# 记忆系统升级调研：成熟的 agent / 记忆框架是怎么设计长期记忆的

访问日期：2026-10-08。所有结论附一手来源（官方文档、源码仓库里的代码和 prompt、官方论文/博客），标 **未确认** 的是没查到一手来源的。厂商自报、没有独立复现的评测数字会单独注明。

源码版本说明（这些项目改得很快，引用以下版本为准）：

- **Letta**：`letta-ai/letta` 的 README 说现行源码已经搬到 `letta-ai/letta-code`（TypeScript），旧的 Python V1 服务端在 `archive` 分支（https://github.com/letta-ai/letta ）。下文 `LA` = `https://github.com/letta-ai/letta/blob/56ba9c25552605eec89de8ed3dc6394b625c1993/`（archive 分支），letta-code 固定在 commit `1d057dd7f54f3a53004d4793bcfc035e279715db`。
- **mem0**：2026-04-14 发布的 Python SDK v2.0.0 换成了「V3 memory pipeline」，论文描述的 ADD/UPDATE/DELETE 流程已经不是开源版现在的流程（https://docs.mem0.ai/changelog 、https://docs.mem0.ai/migration/oss-v2-to-v3 ）。下文「mem0 旧版」指 v1.x 和论文，「mem0 新版」指 main（v2.2.1，2026-09-25）。
- **Graphiti**：`getzep/graphiti` main，commit `86f1c941be`。下文 `G` = `https://github.com/getzep/graphiti/blob/main/graphiti_core`。
- **Codex CLI**：`openai/codex` main。

## 结论先行

- **我们的设计在业界属于「每轮后台抽取原子事实 + 判断后按需检索」**，和 mem0 是同一路线；跟 Letta（模型自己编辑常驻块）、Zep（时序知识图谱）都不一样。这条路线本身是成熟做法，问题不在路线，在几个具体的缺口上。
- **最大的缺口是没有「常驻」的那一层。** Letta 的 core memory blocks、Zep Context Block 里的 `<USER_SUMMARY>`、LangMem 的 Profile、Codex 的 `memory_summary.md`、Claude Code / ZCode 的 `MEMORY.md` 索引，都会在每一轮放进 prompt。我们只有判断模型说「需要」时才找记忆，最多 3 条；判断说 `nothing`（打招呼、闲聊）或 `recall` 时一条都不带。对陪伴型角色来说，「我回来了」这种句子恰恰最该想起「他今天去面试」。
- **冲突和过时记忆，三家走了三条路**：mem0 旧版让 LLM 决定 ADD/UPDATE/DELETE/NONE；Graphiti 不删旧事实，而是给它填上 `invalid_at`（双时间模型）；mem0 新版又**退回只追加**（「the new fact is stored alongside the old one. Retrieval handles ranking」）。我们现在是只追加、注入时带日期，和 mem0 新版一致，但没有在召回或注入时处理新旧（两条互相矛盾的记忆可能一起进 prompt，由对话模型自己看日期判断）。
- **后台整理（sleep-time / consolidation）已是共识。** Letta 的 sleep-time agent（现在叫 Dreaming）、Codex memories 的 Phase 2、LangMem 的 `ReflectionExecutor` 防抖、Generative Agents 的 reflection，都是在对话之外再跑一轮，合并、改写、淘汰记忆。我们没有这一层，记忆只增不减（用户手动删除除外）。
- **召回普遍走混合检索**：Graphiti 是余弦 + BM25 + 图上 BFS，再接 RRF / MMR / cross-encoder；mem0 新版是语义 + BM25 + 实体加成；Letta 的 Turbopuffer 后端是向量 + 全文做 RRF。我们是纯向量 + 重排；另外检索用的 query 只有用户这一句，不带上文（Zep 用最近两条消息）。
- **「先判断要不要检索」是我们独有的。** Zep 每轮都取，Letta 的 core memory 一直在 prompt 里、深层记忆由模型自己调工具找，Codex 是让主模型在 prompt 指引下自己决定跳不跳过。我们用判断模型把关，省下延迟和 token，代价是判断错了就一条也想不起来。
- **评测**：业界通用 LoCoMo 和 LongMemEval，但各家互相指责对方测法不对（Zep 反驳 mem0，Letta 也质疑 mem0），厂商自报的高分（mem0 新版 LoCoMo 91.6，Zep 性能页 94.7）都没有独立复现。我们只有判断模型的路由评测和重排阈值校准，**没有端到端的「记得对不对」评测**。不管做哪项改进，先补这个评测最划算。
- **zcode**：最可能是智谱 Z.ai 的 ZCode（有开源仓库 `zai-org/ZCode`），它的 Memory 设计几乎照搬 Claude Code 的 auto memory。但用户没有说明，不能断定就是指它（见 §7）。

---

## 0. 我们现在的记忆系统

主要代码：`backend/src/eidolon/memory.py`（写入、存储、找记忆、注入）、`backend/src/eidolon/retrieval.py`（判断要不要检索）、`backend/src/eidolon/engine.py`（一个回合怎么串起来）、`backend/src/eidolon/rerank.py`（阈值）。术语见 `GLOSSARY.md` 的「记忆」「来源角色」「制作人档案」；设计决定见 `docs/adr/0002-shared-memory-with-source-character.md`、`docs/adr/0005-embedding-provider-chosen-at-deploy.md`（及 2026-09-27 修订）。

### 0.1 什么时候写

- 回合记下以后，`ConversationEngine._reply` 调 `memory.write_down(history, text, reply)`（`engine.py`），`Memories._write_down` 起一个**后台任务** `_write`，不耽误回复。
- 用户的**下一个回合**开始时，`Memories.begin` → `_settle` 最多等 `SETTLE_TIMEOUT = 5.0` 秒，让上一轮的记忆先写完；列出、删除记忆前也会这样等。
- 抽取用「背景模型」（`TurnLLMs.memory`，用户自带 LLM 密钥时用用户的，`hold_memory` 保证回合结束后模型还在）。
- 清空记忆时 `_clearings` 计数加一，清空前开始、清空后才写完的那些直接丢掉。

### 0.2 抽取 prompt 和粒度

- `_extraction_prompt` 给背景模型看：今天的日期（用户时区）、**最近 50 条已记住的事**（`KNOWN_MEMORIES`）、最近 4 条上文（`EXCHANGE_HISTORY`）、用户最新一句和角色的回复。
- `_INSTRUCTIONS` 的要点：只从**制作人最新的一句话**里找关于制作人本人的信息；不记寒暄、一时的情绪、偶像说的话、剧情设定、已经记住的事；每条是一句以「制作人」开头、单独看得懂的中文陈述；相对时间换算成具体日期；「和已经记住的事有出入时（例如搬了家），把新的情况写成一条新记忆」。输出 `{"memories": [...]}`。
- `parse_memories`：同一批内去重，每条最多 200 字（`MAX_MEMORY_LENGTH`），每轮最多 5 条（`MAX_NEW_MEMORIES`）。
- 结构：`memories` 表（`id, user_id, source_character_id, conversation_id, text, created_at`，`UNIQUE(user_id, text)`）+ `memory_vectors` 表（每个向量化模型一份向量）。`Memory` dataclass 没有别的元数据：没有类型、重要性、事件时间、有效期、访问次数。
- 所有角色共享一份记忆，每条标来源角色，别的角色提起时用转述口吻（ADR-0002）。

### 0.3 去重、更新、遗忘

- 去重只有两道：prompt 里给模型看最近 50 条让它别重复写；数据库 `INSERT OR IGNORE` 挡掉**文字完全相同**的。意思相同、措辞不同的会重复存。
- **没有更新和删除的决策**：情况变了就再存一条新的，旧的原样保留。超过 50 条以后，更早的记忆模型看不到，也就不知道是不是重复。
- 没有过期、衰减和后台整理。记忆只会因为用户在记忆页删一条（`DELETE /api/memories/{id}` → `Memories._delete`）、清空（`DELETE /api/memories` → `_clear`）或删号（`database.delete_user_data`）而消失。删除走 `PRAGMA secure_delete = ON`（`database.py`；见 `.scratch/memory-secure-delete/issues/01-memories-secure-delete.md`，已解决）。
- 用户只能看和删，不能加、不能改（`memory.py` 模块 docstring）。

### 0.4 怎么召回

- 判断模型先答三个是/否问题（`ModelRetrievalJudge.ask`，`retrieval.py`）：`needs_retrieval`、`recall`、`about_producer`。`decide` 的优先级是 recall → references → memories → nothing。阈值按模型族分开（`judge.py` 的 `JUDGE_THRESHOLDS`，由 `backend/eval/judge.toml` 校准）。
- 只有 `memories` 和 `references` 两种结果会找记忆（`Retrieval.retrieve`）；`recall` 和 `nothing` 不找。判断模型出错时按 `references` 处理，所以会找。
- `Memories._find`：用**用户这一句**做 query 向量 → 把这位用户的**全部**记忆读出来做余弦（`embedding.nearest`，numpy 暴力算）取前 12 条（`CANDIDATES`）→ 用 Qwen3 重排 → 分数低于记忆阈值（0.6B 是 0.01，4B 是 0.005，`rerank.py` 的 `KNOWN_THRESHOLDS`，由 `backend/eval/rerank-calibration.toml` 校准）的丢掉 → 最多取 3 条（`MAX_FOUND`）。
- 没有关键词检索，没有时间过滤，也不看新旧和重要程度。

### 0.5 怎么注入 prompt

- `_memories_prompt` 生成 `# 关于制作人的记忆` 一节，放在 system prompt 里角色设定、世界设定、制作人档案之后，参考资料之前（`ConversationEngine._prompt`）。
- 每条带日期和来源：自己听到的写「（2026年10月1日，制作人对你说的）」，别人听到的写「……你是听某某说的：提起时要用转述的口吻……」。
- 唯一每轮都在的「关于用户的信息」是制作人档案（`producer.py` 的 `ProducerProfile`：称呼、性别、时区），由用户手动设置，不是从对话里学到的。
- 对话本身只带当前对话最近 20 轮（`config.py` 的 `DEFAULT_HISTORY_TURNS = 20`，后台可改），更早的直接丢掉，没有摘要。新对话只能靠记忆接上以前的事（`memory.py` docstring）。
- token 预算：记忆最多 3 条 × 200 字，加上标注，大约几百个汉字，很省。

### 0.6 评测

- `backend/eval/judge.toml`：路由评测，其中有一组 `expected = "memories"` 的用例。
- `backend/eval/rerank-calibration.toml`：`[[memories]]` 示例记忆 + `kind = "memory"` 的用例，用来定记忆阈值。
- 测试：`backend/tests/test_memories.py`、`test_memory_management.py`、`test_shared_memory.py`。
- **没有**端到端衡量「抽得对不对、该想起时想不想得起来、情况变了会不会说旧的」的评测。

---

## 1. 决策点一：什么时候写记忆

**我们**：每个成功回合结束后，后台模型自动抽取（§0.1）。主对话模型不能写记忆，也没有后台整理。

**各项目**：

| 方式 | 谁这么做 | 来源 |
|---|---|---|
| 每次 `add()` 同步/异步抽取 | mem0：调用方每轮把消息传给 `add()`，旧版两次 LLM 调用（抽事实 + 决定更新），新版一次 | https://github.com/mem0ai/mem0/blob/main/mem0/memory/main.py 、https://arxiv.org/html/2504.19413v1 |
| 每条消息作为 episode 入图，后台排队 | Graphiti：`add_episode` 的 docstring 写「recommended to run this method as a background process, such as in a queue. It's important that each episode is added sequentially」；Zep 云端入图「can take a few minutes」，所以官方建议同时带上最近 4–6 条原始消息 | https://github.com/getzep/graphiti/blob/main/graphiti_core/graphiti.py 、https://help.getzep.com/retrieving-memory |
| 主模型在对话里调工具写（hot path） | Letta 经典模式：`core_memory_append` / `core_memory_replace` / `archival_memory_insert`，还有上下文快满时的提醒「save that information immediately by calling core_memory_append…」；Anthropic API 的 memory tool（`memory_20250818`）；LangMem 的 hot path | `LA/letta/functions/function_sets/base.py`、`LA/letta/constants.py`（`MESSAGE_SUMMARY_WARNING_STR`）、https://platform.claude.com/docs/en/agents-and-tools/tool-use/memory-tool 、https://langchain-ai.github.io/langmem/concepts/conceptual_guide/ |
| 后台另一个 agent 整理（sleep-time） | Letta sleep-time agent：主 agent 拿不到编辑记忆的工具，交给后台 agent；每轮计数，`turns_counter % sleeptime_agent_frequency == 0` 时触发，把上次处理位置之后的对话交给它；官方示例 frequency 取 5。现行版叫 Dreaming，触发方式 off / step-count / compaction-event，letta-code 默认 compaction-event、stepCount 25 | https://www.letta.com/blog/sleep-time-compute 、https://arxiv.org/abs/2504.13171 、`LA/letta/groups/sleeptime_multi_agent_v4.py`、https://github.com/letta-ai/skills/blob/HEAD/letta/letta-api-client/sleeptime.md 、https://docs.letta.com/configuration/memory |
| 会话闲置后批量抽取 + 全局整理 | Codex CLI memories（默认关）：Phase 1 挑出时间窗口内、已经闲置的旧会话，逐个抽 `raw_memory` 和摘要；Phase 2 起一个无网络、只能写本地的整理子 agent，更新 `MEMORY.md`、`memory_summary.md` | https://developers.openai.com/codex/memories 、https://github.com/openai/codex/blob/main/codex-rs/memories/README.md |
| 防抖后反思（background） | LangMem `ReflectionExecutor`：等 30–60 分钟，期间有新消息就取消旧任务、重新排期，避免拿半截对话去抽 | https://langchain-ai.github.io/langmem/guides/delayed_processing/ |
| 回合后判断 + 用户显式「记住/忘掉」 | Claude Code auto memory、ZCode：成功回合后后台判断有没有值得记的；用户说「记住……」「忘掉……」可以当场写或删 | https://code.claude.com/docs/en/memory 、https://zcode.z.ai/en/docs/memory |
| 重要性累计触发反思 | Generative Agents：最近事件的重要性分累计超过 150 时做 reflection，大约每天 2–3 次 | https://arxiv.org/html/2304.03442v2 |

LangMem 概念页把这个取舍讲得最清楚：hot path 让记忆马上可用但增加延迟；background 召回更高、不拖慢回复，但有滞后（https://langchain-ai.github.io/langmem/concepts/conceptual_guide/ ）。Letta 博客给出的 sleep-time 理由是主 agent 更快更稳，而且「MemGPT 的记忆是增量形成的，时间长了会乱」，后台 agent 能持续整理（https://www.letta.com/blog/sleep-time-compute ）。

**取舍**：

- 我们「回合后后台抽取 + 下一轮最多等 5 秒」已经同时拿到了不拖慢回复和下一轮就记得的好处，比 Zep 云端几分钟的延迟、LangMem 的 30 分钟防抖都及时。
- 缺的是**第二层**：没有一个在对话之外把记忆合并、改写、淘汰的过程。Letta、Codex、LangMem、Generative Agents 都有这一层；mem0 新版干脆放弃更新、只追加，也就没有这一层。
- 让主对话模型自己调工具写记忆（Letta 经典、Anthropic memory tool）不适合我们：通话对首字延迟敏感（`engine.py` 已经把工具轮数限成 1 轮），而且角色扮演的模型同时管记忆，人设容易被打断。

## 2. 决策点二：记忆的粒度和结构

**我们**：一句以「制作人」开头的中文原子陈述，200 字以内；元数据只有来源角色、对话 id、写入时间（§0.2）。

**各项目**：

- **原子事实 → 上下文更丰富的句子（mem0）**：旧版抽「facts」（`FACT_RETRIEVAL_PROMPT`，https://github.com/mem0ai/mem0/blob/v1.0.0/mem0/configs/prompts.py ）。新版 `ADDITIVE_EXTRACTION_PROMPT` 改成强调「Contextually Rich, Not Atomic」，每条 15–80 词；情况变化时写清「从什么变成什么」（例：「switched from almond milk to oat milk」）；相对时间按 Observation Date 换算；**user 和 assistant 两边的消息都抽**；「When in doubt, extract」，重复交给后面去重（https://github.com/mem0ai/mem0/blob/main/mem0/configs/prompts.py ）。payload 有 `hash`、`created_at` / `updated_at`、`user_id` / `agent_id` / `run_id`、`actor_id`、`role`、`expiration_date`；SQLite 里另有 `history` 表记每条记忆的变更（https://github.com/mem0ai/mem0/blob/main/mem0/memory/storage.py ）。新版还加了 spaCy 抽实体的「实体库」，实体链接到记忆（https://github.com/mem0ai/mem0/blob/main/mem0/utils/entity_extraction.py ）。
- **块（Letta core memory）**：每个 block 有 `label`、`description`、`value`、`limit`（字符数），可 `read_only`，同一块可以挂到多个 agent 上共享（https://docs.letta.com/guides/agents/memory-blocks 、`LA/letta/schemas/block.py`）。默认 persona / human 两块各 20000 字符上限（`LA/letta/constants.py`）。另有 archival memory（任意长度文本 + 向量，`LA/letta/orm/passage.py`）和 recall memory（全部消息历史，「stored indefinitely」，MemGPT 论文 §2，https://arxiv.org/abs/2310.08560 ）。现行 letta-code 改成 MemFS：记忆是一个 git 仓库里的 Markdown 文件，根目录文件每轮进 prompt，子目录只放文件树和 description、内容按需读（https://docs.letta.com/concepts/memfs ）。
- **时序知识图谱（Graphiti / Zep）**：三层子图——episode（原始消息原样保存，可追溯出处）、语义实体（entity node + entity edge，一条 edge 就是一条 fact）、community（实体聚类摘要）（Zep 论文 §2，https://arxiv.org/html/2501.13956v1 ）。事实字段有 source、target、`relation_type`、`fact`（自然语言）、`valid_at` / `invalid_at`；抽取规则不许泛化（「Gamecube」不能写成「游戏机」）（`G/prompts/extract_edges.py`）。可以用 Pydantic 定义实体和边的类型（https://help.getzep.com/graphiti/core-concepts/custom-entity-and-edge-types ）。
- **Profile 与 Collection（LangMem）**：Collection 是一条条文档，需要和已有记忆对齐（更新、合并、失效）；Profile 是一份结构化文档，有新信息就原地更新，「适合只关心最新状态」，也方便用户手动改（https://langchain-ai.github.io/langmem/concepts/conceptual_guide/ ）。
- **索引 + 主题文件（Claude Code、ZCode、Codex）**：Claude Code 是 `MEMORY.md` 索引 + 主题文件，分 user / feedback / project / reference 四类，frontmatter 记修改时间（https://code.claude.com/docs/en/memory ）；ZCode 一条事实一个小 Markdown 文件，同样四类、`MEMORY.md` 索引、正文里用 `[[name]]` 互相链接（https://zcode.z.ai/en/docs/memory 、https://github.com/zai-org/ZCode/blob/main/apps/zcode-cli/packages/core/src/context/sections/memory.ts ）；Codex 是 `memory_summary.md`（常驻）+ `MEMORY.md`（供 grep 的手册）+ `rollout_summaries/`，强调「progressive disclosure」（https://github.com/openai/codex/blob/main/codex-rs/memories/write/templates/memories/consolidation.md ）。
- **记忆流 + 反思（Generative Agents）**：每条观察进 memory stream，带 LLM 打的 1–10 重要性分；反思产生的高层洞见带证据引用，也写回 stream（https://arxiv.org/html/2304.03442v2 ）。
- **卡片盒笔记（A-MEM）**：每条记忆生成带上下文描述、关键词、标签的结构化笔记，自动和相近的旧记忆建链接（https://arxiv.org/abs/2502.12110 ）。
- **LongMemEval 的建议**：值的粒度用「轮」（session decomposition），用抽出的用户事实扩展索引键（fact-augmented key expansion），给值打上时间戳以便按时间范围检索（https://arxiv.org/html/2410.10813 ）。

**取舍**：

- 原子事实适合向量检索和逐条删除，这一点很符合我们「用户能逐条看、逐条删」的需求（GLOSSARY「记忆」、ADR-0006 的「真删」）。块、Profile、图谱都是**派生**的结构：用户删掉一条记忆以后，派生出来的摘要或边里还留着它的内容，必须连带重算，否则违背「真删」。这是我们和这些项目相比最特殊的约束。
- mem0 新版从「原子」转向「上下文丰富」，理由是原子事实脱离语境以后难检索、难判断新旧。我们的每条记忆已经要求「单独看得懂」，并且带写入日期，但**没有事件本身的日期**：「制作人下周六考试」换算成了具体日期写进正文，却没有一个可以查询的字段。
- 我们只记**用户说的**。mem0 新版两边都抽；陪伴场景里，角色答应过的事（「下次给你做巧克力」）也是值得记的连续性。这一点牵涉 ADR-0002：一位偶像的承诺要不要让其他偶像也知道。

## 3. 决策点三：去重、更新、冲突、过时和遗忘

**我们**：只追加；文字完全相同才去重；prompt 让模型看最近 50 条避免重复；情况变了就写新的一条；不会自动删、不衰减（§0.3）。

**各项目**：

- **mem0 旧版：LLM 决定 ADD/UPDATE/DELETE/NONE。** 每条新事实各取最相似的旧记忆（论文 s=10，开源 v1 是每条 `limit=5` 再合并），用 `DEFAULT_UPDATE_MEMORY_PROMPT` 让 LLM 比较后选动作。为了防止 LLM 编造 UUID，先把旧记忆的 UUID 映射成 "0","1",…（源码注释「mapping UUIDs with integers for handling UUID hallucinations」）（https://github.com/mem0ai/mem0/blob/v1.0.0/mem0/memory/main.py 约 423–500 行，https://arxiv.org/html/2504.19413v1 ）。
- **mem0 新版：退回只追加。** 迁移文档原话：「Extraction: Single-pass ADD-only (one LLM call, no UPDATE/DELETE)」「When information changes, the new fact is stored alongside the old one. Retrieval handles ranking: the most relevant, current information surfaces first.」官方也承认「memory counts will grow over time」（https://docs.mem0.ai/migration/oss-v2-to-v3 ）。去重靠 prompt 跳过语义上已有的，再加文本 MD5 比对。prompt 要求输出 `linked_memory_ids` 标出「同一实体、偏好变了、后续事件、矛盾」，但读开源代码看，这个字段没有存下来（https://github.com/mem0ai/mem0/blob/main/mem0/memory/main.py ）。
- **Graphiti：不删，让旧事实失效（双时间模型）。**
  - 两条时间线：现实中的有效期 `valid_at` / `invalid_at`，系统时间 `created_at` / `expired_at`（Zep 论文 §2.1、§2.2.3）。
  - 新事实来了，先在同一对实体之间找重复，在全图找可能矛盾的边；`G/prompts/dedupe_edges.py` 的 `resolve_edge` 一次输出 `duplicate_facts` 和 `contradicted_facts`（示例：「works at Acme as a software engineer」对「…as a senior engineer」判为 contradiction, NOT a duplicate）。
  - 判为矛盾且有效期重叠时，旧边的 `invalid_at` 设成新边的 `valid_at`，`expired_at` 设成当前时间（`G/utils/maintenance/edge_operations.py` 的 `resolve_edge_contradictions`）。
  - 实体去重：名字精确匹配 + MinHash/LSH 模糊匹配预筛，再交给 LLM 判断是不是「same real-world object or concept」（`G/utils/maintenance/dedup_helpers.py`、`G/prompts/dedupe_nodes.py`）。
- **mem0 图记忆的论文和代码不一致**：论文说冲突的关系「标为无效、不物理删除」；开源 v1 实际是 LLM 判为过时后 Cypher `DELETE r` 硬删（https://github.com/mem0ai/mem0/blob/v1.0.0/mem0/memory/graph_memory.py 约 400 行）。v2 起图记忆从开源版移除，只在 Platform 有（https://docs.mem0.ai/migration/oss-v2-to-v3 ）。
- **Letta：交给模型自己改写。** 没有算法层面的去重、冲突检测或衰减。模型用 `memory_replace`（old_string 必须唯一）/ `memory_rethink`（整块重写，「make large sweeping changes (e.g. condense or reorganize)」）改；块有字符上限逼它压缩；sleep-time prompt 要求写日期而不是「today/recently」、删掉冗余和过时内容、「be selective… but also aim to have high recall」（`LA/letta/functions/function_sets/base.py`、`LA/letta/prompts/system_prompts/sleeptime_v2.py`）。letta-code 的 reflection 子 agent 写明「fix the stale entry at the source. Do not append the new version alongside the old」，失效内容移到 `ARCHIVE.md` 标日期，用户要求忘掉的直接删（letta-code `src/agent/subagents/builtin/reflection-v2.md`）。集成测试里「冗余信息被合并」的用例目前被 skip（https://github.com/letta-ai/letta/blob/bb52a890/tests/integration_test_sleeptime_agent.py ）。
- **ZCode / Claude Code**：抽取时把已有记忆清单给子 agent，要求「update an existing file rather than creating a duplicate」，错误的记忆要删（https://github.com/zai-org/ZCode/blob/main/apps/zcode-cli/packages/core/src/memory/extraction.ts ）；Claude Code 的 `MEMORY.md` 接近加载上限时提醒模型精简合并（https://code.claude.com/docs/en/memory ）。
- **遗忘、过期、衰减**：
  - mem0：`add(expiration_date=…)`，过期后检索默认隐藏（开源有）；Memory Decay 按最近访问和访问次数给 0.3×–1.5× 的系数，「soft bias, never a filter」，只在 Platform，默认关（https://docs.mem0.ai/platform/features/memory-decay ）。
  - Codex：Phase 2 按 `usage_count` 和最近使用时间选前 N 条，`last_usage` 超过 `max_unused_days` 的淘汰（https://github.com/openai/codex/blob/main/codex-rs/memories/README.md ）。
  - Generative Agents：recency 按距上次被检索的小时数做 0.995 的指数衰减（https://arxiv.org/html/2304.03442v2 ）。
  - Anthropic memory tool 文档建议应用定期删除长期没访问的文件（https://platform.claude.com/docs/en/agents-and-tools/tool-use/memory-tool ）。
  - Letta 的 recall memory 永远不删，MemFS 每次修改都有 git 历史。

**取舍**：

- **三条路线各有代价。** LLM 决定 UPDATE/DELETE（mem0 旧版）会误删、误改，而且我们的用户能看到记忆列表，记忆悄悄被改写会让人困惑；只追加（mem0 新版、我们）会让矛盾的旧记忆一起被召回；失效标记（Graphiti）最稳，但每条新记忆都要多一次 LLM 判断。
- mem0 从「UPDATE/DELETE」退回「只追加」，说明这一步决策的收益没有想象中大（它的新版自报分数反而更高，但未独立复现，见 §6）。对我们来说，**最便宜的一步可能不是改写入，而是在召回和注入时处理新旧**：例如同一话题的几条记忆按日期排、明确告诉对话模型以较新的为准。
- Graphiti 式「失效但不删」和我们的「真删」不冲突：失效是系统内部的标记，用户删除仍然物理删除。但失效记录要不要在记忆页显示、显示成什么样，是产品问题。
- 我们最近 50 条的窗口是硬上限：记忆多了以后，更早的那些模型看不到，重复会越来越多。mem0（取相似的 top-k）和 ZCode（给全量清单）都不是按「最近」而是按「相关」给模型看已有记忆。

## 4. 决策点四：召回

**我们**：判断模型先决定要不要找；要找时用户这一句做 query，纯向量取 12 条，Qwen3 重排卡阈值，最多 3 条（§0.4）。

**各项目**：

- **常驻 vs 按需**：
  - Letta core memory「always visible - no retrieval needed」（https://docs.letta.com/guides/agents/memory-blocks ）；archival / recall 由模型调 `archival_memory_search(query, tags, top_k=10, start_datetime, end_datetime)`、`conversation_search(query, roles, limit, start_date, end_date)` 按需找（`LA/letta/functions/function_sets/base.py`）。system prompt 里还附 `<memory_metadata>`，告诉模型 recall 里有多少条消息、archival 里有多少条记忆（`LA/letta/prompts/prompt_generator.py`）。
  - Zep：每轮调 `thread.get_user_context()` 取 Context Block，「one retrieval call per turn」，检索范围是这位用户跨所有 thread 的整张图，P95 低于 200ms（https://help.getzep.com/retrieving-memory ）。
  - Codex：`memory_summary.md` 每次都进 system prompt；更细的内容由主模型自己 grep `MEMORY.md`（https://github.com/openai/codex/blob/main/codex-rs/memories/write/templates/memories/consolidation.md ）。
  - Claude Code：`MEMORY.md` 前 200 行或 25KB 每次加载，主题文件按需读（https://code.claude.com/docs/en/memory ）。
- **是否先判断要不要检索**：
  - Codex 的读取 prompt 显式写了「何时跳过记忆」，简单自包含的请求直接跳过；查记忆时控制在 4–6 步以内（https://github.com/openai/codex/blob/main/codex-rs/ext/memories/templates/memories/read_path.md ）。这是让**主模型自己判断**，不是独立的判断模型。
  - Zep：一手材料里没有找到检索前的判断环节，策略是每轮都取、让模型忽略无关内容（这是「没找到」得出的否定结论，**未确认**）。
  - mem0：`search()` 何时调用由集成方决定，SDK 本身没有判断环节。
  - 我们用一个独立的小判断模型做路由，在调研对象里没有看到同样的做法。
- **检索方式**：
  - Graphiti：余弦 + BM25 全文 + 图上 BFS；重排可选 RRF、MMR、node_distance、episode_mentions、cross_encoder；预设如 `COMBINED_HYBRID_SEARCH_CROSS_ENCODER`；默认 `limit=10`（`G/search/search_config.py`、`G/search/search_config_recipes.py`）。
  - mem0 新版：语义（多取 max(4×top_k, 60) 条）+ BM25（spaCy 词形还原）+ 实体加成（权重 0.5），合分后过滤过期记忆；`rerank=True` 才调重排器，默认关（https://github.com/mem0ai/mem0/blob/main/mem0/utils/scoring.py ）。BM25 和实体抽取依赖 spaCy，按英文设计，**对中文的效果未确认**。
  - Letta：Turbopuffer 后端支持 vector / fts / hybrid / timestamp，hybrid 默认向量和全文各 0.5 权重再做 RRF（`LA/letta/helpers/tpuf_client.py`）；MemFS 默认没有向量索引，靠文件搜索（https://docs.letta.com/concepts/memfs ）。
  - Generative Agents：分数 = recency + importance + relevance，各自 min-max 归一化、权重都是 1（https://arxiv.org/html/2304.03442v2 ）。LangMem 概念页也建议召回不只看语义相似，还要结合 importance 和 strength（https://langchain-ai.github.io/langmem/concepts/conceptual_guide/ ）。
  - LongMemEval 发现时间感知的 query 扩展（检索时限定在相关时间范围）对时间推理题提升明显（https://arxiv.org/html/2410.10813 ）。
- **query 怎么来**：Zep 用当前对话最近的消息（文档写「the past two messages」）作检索依据（https://help.getzep.com/retrieving-memory ）。

**取舍**：

- 判断模型把关为闲聊省下了向量化和重排的延迟（通话里尤其重要），这个设计值得保留。但它让「想起」变成全有或全无：判断错一次，这一轮就一条记忆都没有。Letta、Zep、Codex、Claude Code 都用一层**小而常驻**的内容兜底，再按需深入。我们缺的是兜底那层，不一定要拿掉判断。
- 纯向量 + 重排对「意思相近」够用，但对专有名词（宠物名「小白」、朋友的名字）和短句不稳。`rerank.py` 的注释已经记下「A short memory scores low against a loosely worded remark」，所以记忆阈值才压到 0.01 / 0.005。关键词检索正好补这一块；中文要选对分词方式（例如 SQLite FTS5 的 trigram 分词器，是否合适**未验证**）。
- query 只有用户这一句：「它昨晚又叫了一夜」里的「它」找不到猫。带上上一条角色回复或最近两条消息，是 Zep 的做法，改动很小。
- 我们每轮把用户全部记忆读出来在 Python 里算余弦（`_find` → `_all` + `nearest`）。单个用户几百、几千条时没问题；要是加了后台整理以后记忆数受控，这也不会成为瓶颈。

## 5. 决策点五：注入 prompt 的方式和 token 预算

**我们**：`# 关于制作人的记忆` 一节，最多 3 条，每条带日期和来源角色，按相关度排；放在制作人档案之后、参考资料之前；总共几百个汉字（§0.5）。

**各项目**：

- **Letta**：`Memory._render_memory_blocks_standard` 把各块渲染成 `<memory_blocks>` 包着的 `<label><description>…<metadata>- chars_current=… - chars_limit=…</metadata><value>…</value></label>`，直接进 system prompt；某些 agent 类型配 Anthropic 模型时用带行号的版本（`LA/letta/schemas/memory.py`）。预算靠每块字符上限。上下文快满时：论文是到 70% 插提醒、到 100% 挤出约一半消息并做递归摘要（https://arxiv.org/abs/2310.08560 ）；archive 源码是到上下文窗口的 90% 触发、默认 sliding_window 挤出 30%，摘要用便宜模型、限 300 或 500 词并要求保留「Lookup hints」以便以后去 recall 里找（`LA/letta/services/summarizer/thresholds.py`、`LA/letta/settings.py`、`LA/letta/prompts/summarizer_prompt.py`）。
- **Zep**：`<USER_SUMMARY>` + `<FACTS>`，每条事实带有效期，格式 `FACT (Date range: from - to)`，例如「Emily is experiencing issues with logging in. (2024-11-14 02:13:19+00:00 - present)」；论文版还有 `<ENTITIES>`（`ENTITY_NAME: entity summary`）和一句说明「If the fact is about an event, the event takes place during this time」（https://help.getzep.com/retrieving-memory 、Zep 论文 §3）。预算靠条数（Context Template 里的 `%{edges limit=10}`、`%{entities limit=5}`），没有显式 token 上限；论文在 LongMemEval 上平均上下文 1.6k token，全量对话 115k。
- **mem0**：论文表中每次查询放进上下文的记忆 Mem0 约 1764 token、Mem0^g 约 3616 token，full-context 26031 token（https://arxiv.org/html/2504.19413v1 ）；新版官方说少于 7K（https://docs.mem0.ai/changelog ）。格式由集成方决定。
- **Codex**：用了记忆要在回复末尾附 `<oai-mem-citation>`；容易过时的事实要先核实，没核实就告诉用户「可能过时」（https://github.com/openai/codex/blob/main/codex-rs/ext/memories/templates/memories/read_path.md ）。AGENTS.md 总长上限默认 32 KiB（https://developers.openai.com/codex/guides/agents-md ）。
- **Claude Code**：`MEMORY.md` 前 200 行或 25KB，取先到者（https://code.claude.com/docs/en/memory ）。
- **Anthropic memory tool**：API 自动往 system prompt 里加「ALWAYS VIEW YOUR MEMORY DIRECTORY BEFORE DOING ANYTHING ELSE… ASSUME INTERRUPTION」（https://platform.claude.com/docs/en/agents-and-tools/tool-use/memory-tool ）。

**取舍**：

- 我们的预算在所有对象里最小（3 条、几百字），对通话延迟和费用最友好，但对「跨对话的连续感」可能偏紧。业界的量级是：Zep 约 10 条事实 + 5 个实体摘要、mem0 约 1.7k–3.6k token。
- 我们已经做对的一点：每条带日期（Zep 也是带有效期）。还差的是**事件日期和写入日期的区分**，以及新旧冲突时的指引（见 §3）。
- 来源角色和转述口吻是我们独有的需求（ADR-0002），调研对象里没有对应设计；无论注入格式怎么改都要保留。
- 对话历史只保留最近 20 轮、不做摘要。Letta 的递归摘要、Codex 的 `/compact`（交接摘要：进度、决定、约束和用户偏好、下一步，https://github.com/openai/codex/blob/main/codex-rs/prompts/templates/compact/prompt.md ）都在丢弃旧消息前先留一份摘要。我们的长对话超过 20 轮以后，前面的内容只剩被抽成记忆的那部分。

## 6. 决策点六：评测

**我们**：只有路由评测（`backend/eval/judge.toml`）和重排阈值校准（`backend/eval/rerank-calibration.toml`），没有端到端的记忆问答评测（§0.6）。

**两个通用 benchmark**：

- **LoCoMo**（ACL 2024，https://arxiv.org/abs/2402.17753 ，仓库 https://github.com/snap-research/locomo ）：每段对话平均 300 轮、约 9K token，最多 35 个会话；正式发布的 `locomo10.json` 只有 10 段对话。QA 分 single-hop、multi-hop、temporal、commonsense/world knowledge、adversarial（应识别为无法回答）。
- **LongMemEval**（ICLR 2025，https://arxiv.org/abs/2410.10813 ）：500 道题，测 information extraction、multi-session reasoning、temporal reasoning、knowledge updates、abstention；LongMemEval_S 每题约 115k token，_M 约 1.5M token。商用助手和长上下文 LLM 掉约 30%。论文把记忆系统拆成 indexing / retrieval / reading 三阶段给出设计建议（见 §2、§4）。

**各家的数字**：

| 项目 | 评测 | 结果 | 来源 |
|---|---|---|---|
| MemGPT | MSC 上的 DMR | GPT-4 + MemGPT 92.5%，不加 32.1% | https://arxiv.org/abs/2310.08560 |
| Zep | DMR | gpt-4-turbo：Zep 94.8%、MemGPT 93.4%、全量对话 94.4%（论文自己承认对话太短，全放得进上下文） | https://arxiv.org/html/2501.13956v1 |
| Zep | LongMemEval_S | gpt-4o：60.2% → 71.2%，延迟 28.9s → 2.58s；gpt-4o-mini：55.4% → 63.8%；single-session-assistant 类反而下降 | 同上，表 2、表 3 |
| mem0（论文） | LoCoMo J 分 | full-context 72.90、Mem0^g 68.44、Mem0 66.88、Zep 65.99、RAG 最佳 60.53、LangMem 58.10、OpenAI 52.90、A-Mem 48.38；p95 延迟 Mem0 1.44s、full-context 17.1s | https://arxiv.org/html/2504.19413v1 |
| mem0 新版（自报） | LoCoMo / LongMemEval | 71.4 → 91.6 / 67.8 → 93.4；BEAM(1M) 64.1 | https://docs.mem0.ai/changelog （**未独立复现**） |
| Zep（反驳 mem0） | LoCoMo | 指出 mem0 测 Zep 时配置有误（两位说话人都标成 user、时间戳没放进 `created_at`、检索串行），修正后 Zep 75.14 ± 0.17；并批评 LoCoMo 对话太短、没有知识更新类问题 | https://blog.getzep.com/lies-damn-lies-statistics-is-mem0-really-sota-in-agent-memory/ |
| Zep（自报） | LoCoMo / LongMemEval | 94.7% / 90.2% | https://help.getzep.com/performance （**评测设置未确认**） |
| Letta | LoCoMo | 只把对话历史放进文件、配 grep 工具，gpt-4o-mini 得 74.0%；认为「current memory benchmarks may not be very meaningful」，并质疑 mem0 跑出的 MemGPT 数字无法复现 | https://www.letta.com/blog/benchmarking-ai-agent-memory |
| Letta | Letta Leaderboard / Context-Bench | 分别测 core 和 archival 记忆的读、写、更新 | https://www.letta.com/blog/letta-leaderboard 、https://www.letta.com/blog/context-bench |

**取舍**：

- 公开 benchmark 都是英文，场景是两个人闲聊或助手问答，没有「多个角色共享记忆、要用转述口吻」这类我们独有的要求；而且各家互相质疑测法，排名参考价值有限。
- 真正值得借的是**题型分类**：LongMemEval 的「knowledge updates」（情况变了以后答新的）、「temporal reasoning」、「abstention」（没说过的不要编），LoCoMo 的「adversarial」，正好对应我们最可能出错的地方（§3 的新旧冲突、§2 的事件日期）。
- 我们已有的两个评测只覆盖「判断」和「重排」两段，覆盖不到「抽取」和「对话模型怎么用」。

---

## 7. 次要对象速览

### 7.1 OpenAI Codex CLI

- **有跨会话记忆，默认关**：`[features] memories = true`（源码特性名 `MemoryTool`，Stage::Stable，`default_enabled: false`，https://github.com/openai/codex/blob/main/codex-rs/features/src/lib.rs ）。存在 `~/.codex/memories/`，生成的字段会脱敏，每个对话可以用 `/memories` 单独控制；配置项有 `generate_memories`、`use_memories`、`extract_model`、`consolidation_model` 等（https://developers.openai.com/codex/memories ）。
- 两阶段流水线和读写 prompt 见 §1、§3、§4。写入 prompt 的门槛是「Will a future agent plausibly act better because of what I write here?」，并且「No-op is allowed and preferred」（https://github.com/openai/codex/blob/main/codex-rs/memories/write/templates/memories/stage_one_system.md ）。
- 官方文档把记忆和 AGENTS.md 分开：必须遵守的规则放 AGENTS.md，记忆只是「recall layer」。AGENTS.md 从全局一份开始，从项目根逐级走到当前目录，每级最多一个文件，越近的越靠后（https://developers.openai.com/codex/guides/agents-md ）。
- `~/.codex/history.jsonl` 只是追加写的用户输入历史，不是记忆（https://github.com/openai/codex/blob/main/codex-rs/message-history/src/lib.rs ）。resume 的实现**未确认**。

### 7.2 「zcode」的识别

- **最可能的候选**：智谱 Z.ai 的 **ZCode**，自称「Agentic Development Environment」，有桌面端、Web 和 CLI agent，针对 GLM 模型调优。官网 https://zcode.z.ai/en ，文档 https://docs.z.ai/devpack/tool/zcode ，开源仓库 https://github.com/zai-org/ZCode （Apache-2.0）。
- **其他同名项目都不是编程 agent**：Infocom 的 Z-machine 解释器源码（erkyrath/infocom-zcode-terps）、Unity 插件（xtqqksszml/zcode-AssetBundlePacker）、围绕 Z.ai ZCode 的账号切换和反代工具（pjpv/zcode-switch、TriDefender/zcode-api）。
- **结论**：用户没有说明 zcode 指什么，**无法确定**；如果指的是编程 agent，几乎只能是 Z.ai 的 ZCode。下面的记忆机制按这个候选写。
- **ZCode 的 Memory**（https://zcode.z.ai/en/docs/memory ）：
  - 默认关闭，需要 v3.6.4 以上。
  - 每个成功回合结束后，后台判断有没有值得长期保留的内容。
  - 分 User / Feedback / Project / Reference 四类；一条事实一个小 Markdown 文件，另有 `MEMORY.md` 索引，新会话自动加载索引，超过上限截断。
  - 按项目隔离，存在 `~/.zcode/cli/memories/projects/<project>/memory/`。
  - 用户说「记住……」「忘掉……」可以当场写入或删除；不记代码结构、git 历史和 AGENTS.md 里已有的内容。
  - 抽取子 agent 限定回合数、只能读写记忆目录，拿到已有记忆清单，要求更新已有文件而不是新建重复的；没有用户发言或主 agent 本回合已经写过记忆时跳过（https://github.com/zai-org/ZCode/blob/main/apps/zcode-cli/packages/core/src/memory/extraction.ts ）。
  - 整体设计和 Claude Code 的 auto memory 几乎一样。第三方文章称「ZCode 内嵌了 Claude Code runtime」，没有找到一手来源，**未确认**。

### 7.3 Claude Code 和 Anthropic memory tool

- Claude Code 有两套：人写的 CLAUDE.md（Managed policy → 用户 → 项目 → 本地，逐级拼接，`@path` 导入最多递归四层）和 Claude 自己写的 auto memory（`~/.claude/projects/<project>/memory/`，`MEMORY.md` 索引 + 主题文件，四种类型，能从代码推出来的不记）（https://code.claude.com/docs/en/memory ）。
- Anthropic API 的 memory tool：`{"type":"memory_20250818","name":"memory"}`，在客户端执行，应用把 `/memories` 映射到自己的存储（例如每个用户一个目录或数据库键）；命令有 view / create / str_replace / insert / delete / rename；文档建议应用自己负责过滤敏感信息、限制文件大小、定期清理长期没访问的文件、防路径穿越（https://platform.claude.com/docs/en/agents-and-tools/tool-use/memory-tool ）。

### 7.4 LangMem、Generative Agents、A-MEM

已在各决策点引用，这里只列来源：LangMem 概念页 https://langchain-ai.github.io/langmem/concepts/conceptual_guide/ ；Generative Agents https://arxiv.org/html/2304.03442v2 （importance 打分 prompt 原文：「On the scale of 1 to 10, where 1 is purely mundane (e.g., brushing teeth, making bed) and 10 is extremely poignant (e.g., a break up, college acceptance), rate the likely poignancy…」）；A-MEM https://arxiv.org/abs/2502.12110 （新记忆还会触发旧记忆的描述和属性更新，论文称 memory evolution）。

---

## 8. 对我们可能有价值的改进点

只列候选，不排定先后，也不替用户做决定。「改动面」是粗估。

### 8.1 先补一个端到端的记忆评测

- **依据**：§6。现有评测只覆盖判断和重排；LongMemEval 的 knowledge updates / temporal / abstention 和 LoCoMo 的 adversarial 题型正好对应我们的弱点。
- **做法**：仿照 `backend/eval/judge.toml` 的格式，写一组中文多会话脚本：前几轮说事实，后面换话题或换角色问，检查抽取结果、召回结果和最终回复。题型包括：情况变了（搬家）、时间（「下周六考试」到了那天）、没说过的事（不要编）、别的角色听来的事（转述口吻）、只说过一次的专有名词。
- **改动面**：新增一个评测文件和一个 `eidolon eval` 子命令，不动运行时代码。
- **风险**：要调用真实模型，评分可能也要 LLM 判（和各家的 J 分一样有噪声）；样本量小时结论不稳。

### 8.2 加一层常驻的「制作人小档案」（派生摘要）

- **依据**：§4、§5。Letta core memory、Zep `<USER_SUMMARY>`、LangMem Profile、Codex `memory_summary.md`、Claude Code / ZCode `MEMORY.md` 都有每轮都在的一层；我们判断为 `nothing` / `recall` 时一条记忆都不带。
- **做法**：后台根据这位用户的全部记忆生成一段几百字的摘要（例如：最近的近况、身边的人和宠物、长期喜好、即将发生的事），每轮都放进 prompt；按需检索的那 3 条照旧。
- **改动面**：`memory.py` 新增摘要的存储和重算、`engine.py` 的 `_prompt` 加一节；可能需要新 ADR 或修订 GLOSSARY（「记忆」现在的定义是一条条的）。
- **风险**：
  - **真删**：摘要是派生内容，用户删一条或清空记忆后必须连带重算或清掉，否则违背 ADR-0006；备份里的副本也要考虑（ADR-0012）。
  - 来源角色：摘要里混合了对不同角色说的事，要保留「谁听来的」，否则破坏 ADR-0002 的转述口吻。
  - 每轮固定多几百 token；后台重算的费用由谁承担（用户自带 LLM 密钥时用谁的模型）。

### 8.3 后台整理（合并重复、标记过时）

- **依据**：§1、§3。Letta sleep-time / Dreaming、Codex Phase 2、LangMem `ReflectionExecutor`、letta-code 的 reflection（「fix the stale entry at the source」）。我们只追加，最近 50 条之外的重复看不到。
- **做法**：每 N 轮或对话闲置后，后台对这位用户的记忆做一次整理：合并意思相同的、给被新情况取代的打标记（见 8.4）。可以和 8.2 的摘要重算合在同一个后台任务里。
- **改动面**：`memory.py` 新增后台任务和触发点；记忆页可能要显示「已合并 / 已过时」。
- **风险**：模型合并或改写出错会丢信息，而用户看得到记忆列表；mem0 新版正是因为 UPDATE/DELETE 不划算才退回只追加（§3），收益要靠 8.1 的评测证明；整理过程要和「清空记忆」「删号」的 `_clearings` 机制配合，不能把已删的内容又写回来。

### 8.4 冲突和过时：从最便宜的做法开始

- **依据**：§3。三条路线：注入时处理（mem0 新版「Retrieval handles ranking」）、失效标记（Graphiti `invalid_at`）、LLM 改写（mem0 旧版、Letta）。
- **候选做法，由轻到重**：
  1. 只改注入：召回的记忆按日期排，`_memories_prompt` 里加一句「同一件事有几条时以日期较新的为准」。改动只在 `memory.py` 的 prompt。
  2. 写入时标失效：抽取时让模型同时给出「被这条取代的旧记忆编号」（用 mem0 的整数编号防编造），旧记忆加一个 `superseded_by` / `invalid_at` 字段，召回时默认跳过或降权。改动在 `memory.py` 的表结构、`_extraction_prompt`、`parse_memories`、`_find`。
  3. 后台整理时标（并入 8.3）。
- **风险**：做法 2 要改提示词，而 `_INSTRUCTIONS` 是线上在用的；模型误判「取代」会让仍然成立的记忆被藏起来；做法 1 几乎没有风险，但只对同时被召回的那几条有用。

### 8.5 检索 query 带上文

- **依据**：§4。Zep 用最近两条消息作检索依据；我们只用用户这一句，代词（「它」「那个」）找不到对象。
- **做法**：`MemoryTurn.find` 的 query 加上上一条角色回复或上一句用户的话（重排的 query 也一样）。
- **改动面**：`memory.py` 的 `_find`，`retrieval.py` 调用处传 history；`rerank-calibration.toml` 要重新校准记忆阈值。
- **风险**：query 变长可能把相关性冲淡，阈值失准；需要重新校准。

### 8.6 关键词检索补专有名词

- **依据**：§4。Graphiti、mem0 新版、Letta 都是向量 + 全文混合；`rerank.py` 的注释已经指出短记忆对口语句子打分偏低。
- **做法**：给 `memories` 表加一个全文索引（中文要选合适的分词，例如 SQLite FTS5 trigram，**未验证**），和向量候选合并后再交给重排。
- **改动面**：`memory.py` 的表结构、`_find`；删除路径要同步删全文索引（secure_delete 也要覆盖）。
- **风险**：中文分词效果未知；多一个索引就多一处要保证「真删」的地方。

### 8.7 事件日期和时间感知召回

- **依据**：§2、§4。Graphiti 的 `valid_at` 和 reference time、LongMemEval 的 time-aware query expansion；我们把「下周六」换算成日期写进正文，但没有可查询的字段。
- **做法**：抽取时额外输出事件日期（可选），存成一列；召回时把「就在这几天」的记忆加权，或在制作人小档案（8.2）里列出「即将发生的事」，让角色能主动问「考试怎么样了」。
- **改动面**：`memory.py` 的表结构、抽取 prompt、`_find` 或摘要生成。
- **风险**：模型解析日期出错；主动提起的频率不好把握，可能显得像提醒软件而不像偶像。

### 8.8 记下角色这边说过的话（承诺、约定）

- **依据**：§2。mem0 新版 user 和 assistant 两边都抽；我们只记「制作人最新的一句话」。
- **做法**：抽取 prompt 允许记下角色答应过的事（「灯织答应下次一起去看海」），以「来源角色说的」形式标注。
- **改动面**：`_INSTRUCTIONS`、可能要给记忆加一个「谁说的」字段；GLOSSARY「记忆」的定义（「关于某位用户」）要修订。
- **风险**：牵涉 ADR-0002：一位偶像的承诺其他偶像知不知道、怎么转述；角色的话有扮演成分，记多了会把剧情性台词当成事实。

### 8.9 对话超过 20 轮时留一份摘要

- **依据**：§5。Letta 递归摘要、Codex `/compact` 都在丢弃旧消息前留摘要；我们超过 `DEFAULT_HISTORY_TURNS` 的部分直接丢掉。
- **做法**：被挤出窗口的那部分对话由后台生成摘要，作为当前对话的一节放进 prompt。
- **改动面**：`engine.py` 的历史截取、新增摘要存储。
- **风险**：同样是派生内容，删对话、删记忆、删号时都要连带清理；和 8.2 的摘要有重叠，可能二选一就够。

### 8.10 用户口头「记住 / 忘掉」

- **依据**：§1、§7.2。Claude Code、ZCode 都支持用户在对话里说「记住……」「忘掉……」。
- **做法**：判断模型加一个问题，或在抽取 prompt 里识别「忘掉某事」并删除匹配的记忆。
- **改动面**：`retrieval.py` / `memory.py`。
- **风险**：和现有设计「用户能删、不能加和改」（`memory.py` docstring）有冲突；口头删除要能确认删对了，否则用户以为删了其实没删，比没有这个功能更糟。

---

## 未确认汇总

- **zcode 指哪个项目**：无法确定，最可能是 Z.ai 的 ZCode（§7.2）。「ZCode 内嵌 Claude Code runtime」的说法没有一手来源。
- **Zep 是否有检索前的判断环节**：一手材料里没找到，按「没有」处理。
- **Graphiti 每个 episode 调用几次 LLM**：没有一手数字；早期是否存在单独的 `invalidate_edges.py` 没查 git 历史。
- **厂商自报的高分**：mem0 新版 LoCoMo 91.6 / LongMemEval 93.4、Zep 性能页 94.7 / 90.2，评测设置和 judge 都没有独立复现。
- **mem0 新版**：Platform 端「Summary」「Recently Extracted」两项输入怎么生成；BM25 和实体抽取对中文的效果。
- **Letta**：服务端 `sleeptime_agent_frequency` 的默认值；letta-code 里 MemFS 根目录文件注入 prompt 的具体格式。
- **Codex**：resume 的实现。
- **我们这边**：SQLite FTS5 trigram 对中文记忆的检索效果（§8.6），没有实测。
