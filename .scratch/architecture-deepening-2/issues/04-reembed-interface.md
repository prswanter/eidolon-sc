# 04: 四个来源共用重新向量化 interface

**What to build:** 剧情库、角色资料、作品资料、记忆四个来源实现同一个很小的 interface，只做两件事：
- 补齐当前模型缺的向量，报告进度，返回条数；
- 丢掉其他模型的向量，返回条数。剧情库每段只留一份向量，恒返回 0。

四个来源都在构造时拿到 embedder。记忆为此改成构造时传入 embedder，不再在补齐时临时传入。`eidolon reembed` 用 03 的工厂函数打开参考资料来源，再加上记忆，只遍历这四个来源，不再逐个点名。背景见 `../spec.md`。

**Blocked by:** 03（`reembed` 要用它的工厂函数，也要用改名后的来源）

**Status:** resolved

- [x] `reembed` 的顺序不变：四个都补齐成功之后，才统一丢掉旧模型的向量；任何一步失败都不丢，重跑能接着做。
- [x] `reembed` 的日志和报告仍按剧情库、角色资料、作品资料、记忆分别给出条数。
- [x] 服务器运行时，记忆照常工作：没有 embedder 和 reranker 时仍然关闭。
- [x] `test_reembed` 经由 CLI 的测试保留、只改名字；其中直接构造作品资料索引的那段，由 02 的契约测试覆盖，删掉。
- [x] 全部测试通过，pyright 无新错误。

## Comments

### 实现记录（2026-09-28）

- `embedding.py` 定义 `Reembeddable` 协议：
  - `label`、`unit`：日志和报告里的名字和单位；
  - `embed_missing(batch, progress)`：补齐当前模型缺的向量，返回条数；
  - `forget_other_models()`：丢掉其他模型的向量，返回条数。
- `ReferenceSource` 继承 `Reembeddable`，所以三个参考资料来源都实现它：
  - `StoryReferences` 转给剧情库，`forget_other_models` 恒返回 0；
  - `CharacterFacts` 每个角色补完报告一次进度，`WorkFacts` 补完报告一次；
  - `batch` 一路传到向量化文本集（原来固定用 `REEMBED_BATCH`）。
- 记忆的 `embed_missing`、`forget_other_models` 改用构造时传入的 embedder，没有 embedder 时报错。服务器那边的构造没变：没有 embedder 和 reranker 时仍然关闭。
- `reembed` 用 `open_reference_sources(..., warn=False)` 打开来源，再加上记忆，遍历 `[*sources.embedded(), memories]`。顺序不变：全部补齐成功之后，才统一丢掉旧模型的向量。
- 没有世界设定时，工厂函数仍打开作品资料，但不进检索列表，只给 `reembed` 补齐和遗忘用。这样和以前一样，会删掉库里残留的作品资料向量，报告里也仍有「作品资料：新向量化 0 条」。
- `ReembedReport` 从四个具名字段改为 `embedded: tuple[EmbeddedCount, ...]` 加 `forgotten`，CLI 遍历打印。输出文字不变。
- 去掉的日志：剧情库开头「N 段需要重新向量化」那行，以及进度里的「/总数」。现在进度只报已完成的条数。
- `test_reembed`：
  - 断言改用 `report.counts()`；
  - 删掉直接构造作品资料索引的 `test_the_work_facts_are_embedded_again`；
  - CLI 测试补一条「作品资料：新向量化 0 条」（没有世界设定时）。
- code review 之后改了三处：
  - 没有世界设定时仍打开作品资料；
  - 缺向量的警告由工厂函数的 `warn` 参数关掉，不再在 CLI 里把 `eidolon.retrieval` 的日志静音；
  - `Embedded` 改名为 `EmbeddedCount`。
- 全部 764 个测试通过，pyright 无错误，改动的文件 ruff 通过（仓库里原有 22 处 ruff 报错，与本次无关）。
