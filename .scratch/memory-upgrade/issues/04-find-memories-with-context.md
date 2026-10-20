# 04: 想起时带上文，并重新校准记忆阈值

**What to build:** 角色刚聊到用户的猫，用户接着说「它昨晚又叫了一夜」，角色能想起关于那只猫的记忆。找记忆和重排都改用「角色的上一条回复 + 用户这句话」作为 query，记忆的重排阈值按新的 query 重新校准。通话里不多任何一次网络往返。背景见 `../spec.md`「想起时带上文」一节。

**Blocked by:** 01（记忆评测和基线）

**Status:** resolved

## 已定的设计（详见 spec）

- `MemoryTurn.find` 多拿到这一轮的上文。query 是角色的上一条回复（中文字幕，去掉语气提示）加上用户这句话；没有上一条回复时只用这句话。`Retrieval.retrieve` 把手里的 history 传过去。
- 重排的 query 用同样的内容。向量化和重排的调用次数都不变。
- 重排校准集的记忆类题加上可选的「上一条回复」，`eval rerank` 按同样的方式拼 query。补几道带上一条回复的代词题，标 `reviewed = false`。
- 和 02 都会改找记忆那一步：02 只在有效记忆里找，这张改 query。两张并行时，后合并的那张负责解决冲突。如果 02 已经合并，提炼时用的 query 应该和这里的拼法一致（同一个函数）。

## 验收

- [x] 记忆模块的测试：找记忆的 query 带上角色的上一条回复（去掉语气提示），重排也用同样的 query；没有上一条回复时只用这句话。
- [x] 检索的测试：上文从 `Retrieval.retrieve` 传到了找记忆那一步。
- [x] 重排校准的测试：带「上一条回复」的记忆题按新的方式拼 query；不带的和以前一样。
- [x] `backend/` 下 `pytest` 全部通过，`ruff` 和 `pyright` 没有新的报错。
- [x] **人工验收（留给用户）**：
  - 校对新补的校准题；
  - 用真模型跑 `eidolon eval rerank`，按结果更新预设的记忆阈值和校准记录；
  - 用真模型跑 `eidolon eval memory`：代词类的通过数多于基线，其他类最多少 1 个用例；更新提交的结果，在 Comments 里记下对比。

## Comments

- 2026-10-08（实现）：query 由 `memory.memory_query(history, text)` 拼成：history 里最后一条角色的回复（`without_cues` 后的中文字幕，没有字幕时用日语），换行，再接用户这句话；没有角色的回复时只用这句话。向量化和重排都用它，调用次数不变。`MemoryTurn.find(history, text)`，`Retrieval.retrieve` 把 history 传下去。02 提炼时用的也是 `memory_query`。
  - 重排校准集：记忆题可以写 `previous`（只有 memory 类可以写），`eval rerank` 用 `memory.joined_query(previous, query)` 拼，和对话里一致。补了 5 道 `reviewed = false` 的题：`mano-memory-pronoun-cat`、`kogane-memory-pronoun-dog`、`mano-memory-ellipsis-driving`、`kogane-memory-ellipsis-wedding`、`mano-memory-previous-unrelated`（上一条回复和记忆无关，看会不会多放进东西）。
  - 预设的记忆阈值没有改，等人工跑完 `eval rerank` 再定。
- 2026-10-08（人工验收，用户让 agent 代做）：
  - 新补的 5 道校准题看过一遍，标注没问题，改成 `reviewed = true`。
  - `eidolon eval rerank`（Qwen3-Embedding-0.6B、Qwen3-Reranker-0.6B）：记忆组 16 题，相关 15 条、不相关 158 条，阈值 0.01 时相关命中 12/15、不相关误放 1/158（`mano-memory-cat-indirect` 的 parents-dog 0.0492）。新的 4 道代词、省略题相关的那条都在 0.99 以上；上一条回复和记忆无关的那题，所有记忆都低于 0.002。没命中的三条（`kogane-memory-cat-cross` 0.0077、`mano-memory-back-pain` 0.0019、`kogane-memory-dinner` 的 no-coriander 0.0007）都是不带上一条回复的旧题，降到 0.005 只多救回 1 条、多放进 2 条不相关，所以 0.6B 的记忆阈值保持 0.01，在 `rerank.py` 的校准记录里补了这次的结论。4B 没有重跑（不是现在用的模型）。参考资料组：阈值 0.3 时相关命中 46/48，不相关误放 115/1025。
  - `eidolon eval memory`，和基线同一组模型（deepseek-flash、Jev、Qwen3-Embedding-0.6B、Qwen3-Reranker-0.6B），02 和 04 一起跑了一次，结果更新到 `backend/eval/memory-baseline.json`：

  | 题型 | 基线（01） | 02 + 04 之后 |
  |---|---|---|
  | 取代 | 1/9 | 9/9（提炼 7/7，召回 2/2） |
  | 重复 | 5/6 | 6/6 |
  | 短期状态 | 8/9 | 9/9 |
  | 代词 | 1/7 | 4/7（提炼 1/1，召回 3/6） |
  | 专有名词 | 6/8 | 6/8 |
  | 前情（只作参考） | 1/5 | 0/5 |
  | 全部 | 22/44 | 34/44 |

  - 代词召回 0/6 → 3/6，门槛通过。剩下 3 题：`pronoun-tomatoes-eaten` 判断模型判 nothing（about_producer 0.41，和基线一样没让找）；`pronoun-cat-cried-all-night` 想起了猫，但连带想起了 coffee；`pronoun-hometown-snowing` 想起了老家，但连带想起了 okinawa。后两题是干扰项被一起放进来，不是没找到。
  - 其他类都没有比基线少。专有名词同为 6/8，但换了一题：`proper-noun-dog-mameta` 这次过了，`proper-noun-friend-azhe` 连带想起了 colleague（干扰项被放进来）。`proper-noun-hamster-dango` 和基线一样连带想起了三色团子。前情 1/5 → 0/5，只作参考：两题判断模型判 nothing，其余是没找到或带进了干扰项。
