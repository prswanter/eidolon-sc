# 03: 参考资料来源列表，作品资料改名

**What to build:** 参考资料的三个来源（剧情、角色资料、作品资料）改成一张列表。每个来源自带四样东西：
- kind；
- 提示词里的标题；
- 给角色的那行使用说明；
- 按查询向量为某位角色检索候选。

`Retrieval` 接收这张列表，拼提示词只是遍历拼接，自由函数 `rank_references` 消失。一个工厂函数接收数据库路径、embedder、角色和世界设定（可以没有），返回可以一次性关闭的来源列表；`assembly` 和 CLI 的 `eval rerank` 共用它，缺向量的警告也由它统一发出。

同时按 `CONTEXT.md` 的「作品资料 (Work Facts)」改名：
- 代码里的 world index 改为作品资料的名字，kind 从 `"world"` 改为 `"work"`；`World` 本身不动。
- 提示词标题「资料」改为「作品资料」，Jev 判断说明里的措辞跟着改。

回顾经过和想起记忆不进列表。回顾经过直接调用作品资料的来源，按演出、唱片过滤；`recall_story` 工具仍然只查剧情。背景见 `../spec.md`。

**Blocked by:** 01（要用它的基线做对比，两者也都改 `eval rerank`）、02（来源建在向量化文本集的 adapter 上）

**Status:** resolved

- [x] 加一个参考资料来源只需要在一处写它的检索、标题和使用说明，外加在工厂函数里登记。
- [x] `eval rerank` 通过同一个来源列表拿到候选和分数，不再手工构造剧情库和各个索引。
- [x] 回合的提示词里，「作品资料」和「角色资料」两个标题各自对应正确的条目；经由回合的测试补上这条断言。
- [x] 回顾经过照样把相关的演出和唱片与剧情一起带上；`recall_story` 仍然只查剧情。
- [x] `test_world_retrieval`、`test_retrieval`、`test_recall_story`、`test_rerank_eval` 只改名字和标题文字，全部通过。
- [x] 三份 README 里提到「资料」标题或 world index 的地方，同步改为作品资料。
- [x] 用真实服务跑一次 `eval rerank`，和 01 的基线对比，结果记到本 ticket 的 Comments。
- [x] 用两位角色做一次真实对话，问到歌曲、唱片、演出，确认会照作品资料回答，也不和角色资料混淆；结果记到本 ticket 的 Comments。

## Comments

### 实现记录（2026-09-28）

- `references.py` 定义 `Reference`（kind 为 `episode`、`fact`、`work`）和 `ReferenceSource` 协议：kind、`heading`、`guide`、`search(query_vector, character, limit)`、`close`。
- 三个来源各在一处写齐检索、标题和使用说明：
  - `StoryReferences`（`retrieval.py`，包着剧情库）；
  - `CharacterFacts`（`facts.py`，原 `FactIndex`）；
  - `WorkFacts`（`work_facts.py`，原 `world_index.py` 的 `WorldIndex`）。
- `ReferenceSources`（`retrieval.py`）负责三件事：一起 rerank（`rank`）、拼提示词（遍历来源的说明和标题）、一次性关闭。它另外持有剧情库和作品资料，给回顾经过用。
- `open_reference_sources(path, embedder, characters, world)` 登记来源，并发出缺向量的警告。`assembly` 和 `eval rerank` 都用它。`eval rerank` 把这条警告以「注意：…」打到 stderr。
- `rank_references` 删掉了。`rerank_eval.evaluate(calibration, characters, reranker, sources)` 通过来源列表拿候选和分数。
- 回顾经过调用 `WorkFacts.search_entries(..., RECALL_KINDS)`，只查演出和唱片；`recall_story` 只查剧情。
- 提示词：
  - 「资料」改为「作品资料」，回顾经过里的标题也一样。
  - 使用说明里的「资料里只有……」改为「作品资料里只有……」。
  - Jev 的判断说明改为「剧情、角色资料、作品资料」三类，措辞从「资料」改为「内容」。
  - 没有世界设定时，提示词里不再出现作品资料那行说明。
- 超出「只改名字」的地方：
  - `evaluate` 的参数变了，所以 `test_rerank_eval` 的 fixture 改为用 `open_reference_sources` 打开来源。
  - `CharacterFacts` 构造时拿到角色，`embed_missing()` 不再需要参数，这是给 04 的 interface 铺路。为此 `test_document_titles` 和 `test_reembed` 里构造它的地方跟着改了。
  - `reembed` 只做了改名，报告字段 `world` 改为 `work`，输出文字「歌曲、唱片和演出」改为「作品资料」。改用工厂函数留给 04。
  - `KeywordReranker` 移到了 `tests/fakes.py`。
- 新测试 `test_work_facts_and_character_facts_go_under_their_own_headings` 经由文字回合断言：「角色资料」下只有那条人物关系，「作品资料」下只有那首歌。
- 全部 762 个测试通过，pyright 无错误。

### eval rerank 对比（2026-09-28，03 之后）

命令和模型同基线：`Qwen/Qwen3-Reranker-0.6B`、`Qwen/Qwen3-Embedding-0.6B`。

```
参考资料（33 条问题）
相关　n=48 最低 0.0042 p10 0.6536 p25 0.9418 中位 0.9976 p75 0.9995 p90 0.9998 最高 1.0000
不相关 n=1025 最低 0.0000 p10 0.0000 p25 0.0001 中位 0.0010 p75 0.0270 p90 0.4087 最高 0.9995
阈值 0.3：相关命中 46/48，不相关误放 117/1025

记忆（11 条问题）
相关　n=11 最低 0.0007 p10 0.0019 p25 0.0158 中位 0.1998 p75 0.9565 p90 0.9999 最高 0.9999
不相关 n=108 最低 0.0000 p10 0.0001 p25 0.0001 中位 0.0002 p75 0.0005 p90 0.0010 最高 0.0506
阈值 0.01：相关命中 8/11，不相关误放 1/108
```

- 和基线一致：
  - 参考资料的相关命中 46/48、误放 117 条都没变；
  - 召回问题还是同样的 5 条（含 `kogane-work-release-wing03`）；
  - 6 条作品资料问题的排序和分数与基线相同或只差千分位。
- 小差异来自服务端分数的抖动：
  - 不相关候选 1026 → 1025；
  - 记忆误放 2 → 1，最高 0.0502 → 0.0506。
  
  03 没有改候选的来源、文字和重排方式，标题只进对话提示词，不进 rerank。

### 真实对话（2026-09-28）

- 在真实数据库的副本上，用 `build(Settings.from_env())` 驱动文字回合，对话模型和记忆模型都是真实服务。真乃和恋鐘各问 3 个问题，每个问题一个新对话。
- 当时 Jev 返回 403（Vercel 免费额度不能用这个模型），所以 6 个回合都按「judge 失败，照常检索参考资料」走。回顾经过这条路没有经由 Jev 实测，由 `test_world_retrieval` 覆盖。
- 真乃：
  - 「ヒカリのdestination 谁唱、收在哪张 CD」：作品资料下是 4 首歌曲和 WING 02。回答 illumination STARS 三人、WING 02、2018年7月4日，另外提到 WING COLLECTION -A side- 和 Over the prism，都对。
  - 「1stLIVE 在哪个会场」：作品资料下是 1stLIVE 两天等演出。回答舞浜アンフィシアター、2019年3月9日和10日，对。
  - 「灯織是怎样的人，イルミネ最近的 CD」：角色资料下是「人物关系 / 風野灯織」和「组合 / illumination STARS」，作品资料下是歌曲。回答分开说灯織的性格和「円環 -Halo around-」04（2025年9月10日），没有混淆。
- 恋鐘：
  - 「幻惑SILHOUETTE 收在哪张 CD、什么时候发售」：回答 WING 03、2018年8月1日，还有 SOLO COLLECTION 里的各人 Ver.，对。
  - 「我儘なまま第二天唱了什么」：角色资料「档案 / 名字的由来」排在第一，作品资料的两天演出紧随其后。回答アポイント・シグナル（个人）和 Killer×Mission（与千雪、冬優子、美琴），和 world.json 逐字一致，没有把名字由来混进来。
  - 「名字的由来和 L'Antica 的歌」：角色资料下是名字由来、组合、人物关系。回答名字来自父亲唱的演歌「恋の岬に鐘が鳴る」，歌单来自每回合都带的「你的歌」。两部分各自对应，没有混淆。

