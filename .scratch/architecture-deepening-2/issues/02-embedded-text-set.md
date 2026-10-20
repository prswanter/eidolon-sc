# 02: 角色资料和作品资料共用一个向量化文本集

**What to build:** 角色资料和作品资料的向量化，现在是同一件事写了两遍，而且已经漂移。把它收进一个 deep module，叫「向量化文本集」。它负责的事全都只实现一次：
- 按「scope + 文字 + 模型」存向量；
- 第一次检索时懒向量化，分批，逐批提交；
- 删掉已经不在配置里的条目；
- 加载后常驻内存，一个 scope 同一时间只加载一次；
- SQLite 读写放到线程里，不阻塞事件循环；
- `forget_other_models`。

角色资料的索引和作品资料的索引变成它上面的薄 adapter，只提供条目和自己的 scope。对外行为（检索结果、`reembed` 的输出）不变。背景见 `../spec.md`。

**Blocked by:** None (can start immediately)

**Status:** resolved

- [x] 一张表，列为 scope、text、model、embedding，主键 (scope, model, text)；scope 取 `character:<角色 id>` 或 `work`。
- [x] 建表时，如果旧的角色资料表或作品资料表还在，把它们的行一次性复制进新表再删掉旧表；迁移后第一次检索不调用 embedder。
- [x] 角色资料的检索不再每个回合读 SQLite，也不在事件循环上阻塞。
- [x] 契约测试写在向量化文本集的 interface 上，用临时 SQLite 和 `FakeEmbedder`，对两个 scope 各跑一遍：
  - 第一次检索时向量化；
  - 再检索不再调用 embedder；
  - 改了一条，重启后只重算那一条；
  - 删掉的条目被遗忘；
  - `forget_other_models` 只留下当前模型的向量；
  - 迁移不重算。
- [x] 现有经由回合和 CLI 的测试（`test_world_retrieval`、`test_retrieval`、`test_reembed`、`test_document_titles` 等）不改断言，全部通过。
- [x] 全部测试通过，pyright 无新错误。
