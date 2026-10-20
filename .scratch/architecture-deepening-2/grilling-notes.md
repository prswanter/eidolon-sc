# architecture-deepening-2 拷问记录

来源：2026-09-28 的架构审查（候选 1 向量化文本集、2 名单 module、3 回合放行）。三个候选实现上互不阻塞，可在各自的 worktree 并行；拷问依次进行，最后合成一份 spec，再拆成 tickets。

## 候选 1：作品资料和角色资料的向量化文本集 + 参考资料来源列表（已确认）

**先修的 bug（单独一张 ticket，最先做）**
- `rerank_eval` 的 `CaseKind` 加上作品资料；报告里「剧情与角色资料」一组改名为「参考资料」，和剧情、角色资料共用 references 阈值。
- 从 `characters/world.json` 起草约 6 条校准问题（歌曲、唱片、演出日各 2 条），以条目标题作标签（1431 条标题互不重复），交用户审。
- 跑一次拿到基线；只报告结果，不改阈值。

**向量化文本集（deep module）**
- 只覆盖「来自配置、按文字存向量」的两类：角色资料和作品资料；剧情库和记忆的存储保持现状。
- `character_facts` 和 `world_entries` 合成一张 `(scope, text, model, embedding)` 表，scope 为 `character:<id>` 或 `work`；建表时一次性 `INSERT … SELECT` 复制旧表的行再删掉旧表，已有的向量不重算。
- 由它负责：第一次检索时向量化（分批、逐批提交）；删掉已不在配置里的条目；加载后常驻内存；SQLite 读写放到线程里做；`forget_other_models`。
- 角色资料和作品资料的来源是它上面的薄 adapter，只提供条目。

**参考资料来源列表**
- 只管参考资料这条路（剧情、角色资料、作品资料一起 rerank）；回顾经过和想起记忆保持各自的规则。
- 每个来源自带 kind、提示词标题和给角色的那行使用说明；`Retrieval` 接收来源列表，`references_prompt` 只遍历拼接，自由函数 `rank_references` 消失。
- 作品资料的来源有两种用法：进列表时不过滤类别；被回顾经过直接调用时按演出、唱片过滤。`recall_story` 工具仍只查剧情。
- 一个工厂函数接收数据库路径、embedder、角色和世界设定，返回可一次性关闭的来源列表；`assembly`、`reembed` 和 CLI 的 `eval rerank` 共用。

**重新向量化 interface**
- 剧情库、角色资料、作品资料、记忆都实现 `embed_missing(progress) -> int` 和 `forget_other_models() -> int`，都在构造时拿到 embedder（`Memories` 为此改成构造时传入 embedder；剧情库的 `forget_other_models` 恒为 0）。
- `reembed` 只遍历这四个来源；顺序不变：全部补齐成功后才统一丢掉旧模型的向量。

**改名**
- `WorldIndex` / `world_index.py` 改为作品资料的名字；`Reference.kind` 从 `"world"` 改为 `"work"`；`World` 本身不动。
- 提示词标题「资料」改为「作品资料」，Jev 判断说明的措辞跟着改。改完跑 `eval rerank` 与基线对比，并用两位角色做一次真实对话验证。

**测试**
- 新增：向量化文本集 interface 上的契约测试，两个 scope 各跑一遍（首次向量化、缓存后不再调用 embedder、改一条只重算一条、删掉的被遗忘、`forget_other_models`、迁移后不重算）。
- 保留：经由回合和 CLI 的测试（`test_world_retrieval`、`test_reembed` 等），只改名字。
- 删除：被契约测试覆盖的零散测试（如 `test_reembed.py` 里直接构造 `WorldIndex` 的那段）。
- 补：`test_rerank_eval` 加作品资料的用例。

**领域词汇**：`CONTEXT.md` 已新增「作品资料 (Work Facts)」。没有 ADR：决定都容易回退。

## 候选 3：回合放行（放弃）

审查报告把它列为 Strong，但读代码后不成立：`engine.turn` 已经把所有失败（被拒绝的空白或超长、自带密钥失败、任何异常）都收成 `TurnFailed`，所以文字回合的限额规则在 `app.py` 里只有一行「遇到 `TurnFailed` 就 `give_back()`」；中途离开时生成器被取消，照样计入。`test_rate_limit.py` 已经经由 HTTP 测到这些规则。另做 `TurnOutcome` 或「放行」module 通不过删除测试，是 pass-through。`Calls.ice_servers` 调用 `for_call` 是有意为之（在花钱之前先报出 `CallsUnavailable` / `OwnKeyFailed`），不是泄漏。唯一剩下的只是调用方要转交 `keys.exempt`，一共两处，不值得改。以后的架构审查不要再提这一条。

**2026-10-07 重开**：后台加进运行记录、部署者租约和计量以后，放行与收尾长成了六步，文字回合和通话各写一份，已经不一致（占了次数之后出错不退、自带密钥解不开时两边记录不同、租约在三处放开），上面「只有一行」的前提不再成立。第五轮把它和通话一起收进 `Admissions`，见 `../architecture-deepening-5/spec.md`。

## 候选 2：名单 module（已确认）

**名单回答的问题**（由世界设定的偶像、组合、社长和事务员构造，纯 in-process）
- 这个人名（可附声优名）是哪位偶像：统一去空格、去掉「（初代）」这类尾注。
- 这个名字或读音是哪个组合。
- 这个人是不是社长或事务员。

**留在各导入里**：从各自来源抽出人名和声优名（Lantis 的「名字（CV:xx）」字符串、wikiwiki 的角色和声优两栏、imas-db title 属性里的「櫻木真乃(CV:関根瞳)」）；唱片的特别组合、全員、拆分多人（`several`、`groups`、`_whole_cast`）；live 的「标题行不算人」。

**统一的规范化（行为变化）**
- NFKC，加 `’`→`'`，去掉非文字字符，casefold。组合的名字和读音都先把片假名转成平假名再比；偶像名和声优名去空格后比，也做 NFKC。
- 验收：用真实来源重跑 world sync，`characters/world.json` 和导入报告要么完全不变，要么每一处变化都能解释；出现意外就停下讨论。

**范围**
- 曲名比对（`release_sync._key(track.title)`、live 的 `_comparable`）不纳入。
- 三处 `Fetch` 类型别名、两处 `_hiragana`、三处去空格函数收进一个共享的同步小工具模块；`_lines` 的标签集合不同，两份各自保留。
- `world_sync._key`（在名单建立之前对组合）改用名单的规范化。

**测试**
- 新增：名单的表驱动测试，覆盖全角组合名、`’` 和 `'`、片假名读音、三峰結華（初代）、只有声优名、带空格的声优名、事务员。
- 保留：`test_world_sync.py` 经由 CLI 的端到端测试，不需要改。
- 不做：用字典 `Fetch` 逐个测导入（属于候选 5，这轮不做）。

**领域词汇**：名单是实现概念，它回答的偶像、组合、社长和事务员都已在 `CONTEXT.md`，不加词条。没有 ADR。

## 顺序与并行

- 候选 1 的 rerank 校准 bug ticket 最先做，拿到基线。
- 候选 1 其余部分和候选 2 之间没有 blocking edge，可以在各自的 worktree 并行。
