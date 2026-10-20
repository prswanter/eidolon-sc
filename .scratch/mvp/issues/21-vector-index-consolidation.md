# 21: 向量索引三合一：不做

**What to build:** 不做。`facts.py` 的 `FactIndex._vectors`、`memory.py` 的 `Memories._vectors`、`corpus.py` 的 `StoryCorpus._known_vectors` 保持各自的「查缺、嵌入、写入」，不合成一个按命名空间区分的向量索引 module，也不抽公共 helper。

**Blocked by:** —

**Status:** wontfix

## 背景（2026-09-26，架构体检候选 4）

报告（Eidolon-SC Deepening Map，停在 `b564c0d`）提议把三份嵌入缓存合成 `search(namespace, query)`，并注明「和候选 2 有重叠，先做 2 再看这一块剩多少」。候选 1、2、3、5（ticket 18、记忆 module、ticket 19、ticket 20）合入之后，三处剩下的是：

| | 键 | 过期 | 向量存放 | 特殊处 |
|---|---|---|---|---|
| `FactIndex._vectors` | (角色, model, 文本) | 自算 stale 后 DELETE（事实来自配置） | `character_facts` 表 | — |
| `Memories._vectors` | (memory_id, model)，按用户 | 自算 stale；`forget=False` 时不清 | `memory_vectors` 表 | `INSERT … WHERE EXISTS memories`：嵌入期间被删的记忆不留向量 |
| `StoryCorpus._known_vectors` | 按段落文本复用 | 不需要：`ON DELETE CASCADE` 随 episode 删除 | `episode_passages` 行内，与 `save` 同一事务 | 搜索靠 JOIN `episode_cast` 按出场角色过滤 |

真正相同的只有约四行：挑出缺的 → `embed_documents` → `to_blob` → 对应回键。

## Comments

### 决定（2026-09-26，grill-with-docs）

- **不做命名空间索引。** 剧情库要么按出场角色复制向量，要么让索引懂 episode；剧情目录与向量不再由同一次导入的同一组表保证一致；记忆的并发删除保护得搬进通用 module。interface 会和三份 implementation 合起来差不多宽，是 shallow module。它还会造出一个通用的内部剧情查询面，和 ADR-0003「不开放剧情查询入口」的方向相悖。
- **不抽 helper**（如 `embed_missing`）：删掉它，每处只多回来四行直白代码，却多一层间接，过不了删除测试。
- **报告列的收益已不成立或已由别处兑现：**
  - 下标偏移：候选 2 已消除，`_references` 现在按 `Reference` 列表挑选。
  - 「查询必须用同一 embedder 嵌入」：ticket 19 之后三处的 embedder 都只由 `assembly.build` 注入同一个实例；`model` 列让不匹配时查不到而不是查错。
  - 缓存行为只被间接测：见下「已知，接受」第 3 条。
- **已知，接受（不行动）：**
  1. judge 判为 references 的回合里，同一句话被 `embed_query` 两次（`Retrieval._references` 与 `Memories._find`）。两者并行，不增加延迟，只多一次 SiliconFlow 调用。
  2. 同一个 SQLite 文件开着四个连接（Store、StoryCorpus、FactIndex、Memories），各有 `timeout=30`；导入命令本来就是另一个进程。没有已知问题。
  3. 事实缓存只由 `test_edited_facts_take_effect_on_restart` 间接覆盖；记忆「嵌入失败、下次搜索时补上」没有专门测试（剧情库重导入不重复嵌入由 `test_importing_again_updates_in_place_without_duplicates` 覆盖）。下次动到记忆嵌入时在那个 ticket 里补上，不单开 ticket。
- 不改 `CONTEXT.md`（「向量索引」没有成为领域术语），不写 ADR（不做的决定随时可以撤回）。报告里候选 4 标为不做，下一步转向候选 6。
