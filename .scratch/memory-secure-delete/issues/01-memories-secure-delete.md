# 01: 删一条记忆、清空记忆时，删掉的内容可能还留在数据库文件里

**Status:** resolved

**Type:** bug（疑似，按代码推断，还没有复现）

## 发现经过

2026-10-01 的架构审查（候选 4「数据库与抹除」）读代码时发现的。候选 4 本身这一轮没有做，这个疑点先单独记下来。

## 现象（按代码推断）

- `PRAGMA secure_delete` 是**按连接**生效的设置。
- `Store`（`backend/src/eidolon/store.py:196`）和 `UsageLimiter`（`backend/src/eidolon/usage.py:89`）的连接都开了它。`Store` 的注释写的是「What is deleted is overwritten, not just freed: deleting a user is for good.」
- `Memories`（`backend/src/eidolon/memory.py:136`）有自己的连接，**没有开**。
- 用户在记忆页删一条记忆（`DELETE /api/memories/{id}` → `Memories._delete`），或清空记忆（`DELETE /api/memories` → `Memories._clear`），走的都是这个连接。被删的记忆原文和向量所在的页只是被释放，没有被覆写。
- **会连带影响删号**：用户先清空记忆、再删号时，`Store.delete_user` 已经找不到这些行，它的 `secure_delete` 覆写不到那些早就释放了的页。这时记忆的原文可能还留在数据库文件里，违背 ADR-0006「用户可以删除自己的全部数据，而且是真删」。
- 有先例：`.scratch/public-launch/issues/13-usage-limit.md` 给 `UsageLimiter` 的新连接补上 `secure_delete` 时，就把这种情况算作「删掉的只是释放、不覆盖」的回退。

## 还没核实的

- SQLite 编译时的默认值。本机的 SQLite 3.50.4 默认 `secure_delete = 0`；生产镜像 `python:3.11-slim` 里的 SQLite 默认是多少还没看过。代码自己的注释认为必须显式打开。
- 现有测试 `backend/tests/test_delete_account.py::test_deleted_data_is_gone_from_the_database_files_too` 只覆盖「直接删号」，没有覆盖「先删记忆、再删号」和单独删记忆的情况。`test_memory_management.py` 里没有检查文件字节的测试。

## 建议的复现

照 `test_deleted_data_is_gone_from_the_database_files_too` 的写法，先让后台模型记下一条带独特字符串的记忆：

1. 通过 API 删掉这一条，或者清空记忆；
2. 再删号；
3. 读数据库文件和 `-wal` 文件的字节，看那个字符串还在不在。

## Comments

### 2026-10-02 triage（grilling）

并进 `.scratch/architecture-deepening-4/issues/04-database.md`（数据库 module）：所有连接改由 `database.connect` 打开，统一开 `secure_delete`，这张单独不修。

- 上面「建议的复现」写进 04 的验收测试：先清空记忆再删号、先删一条记忆再删号，查 db 和 `-wal` 的字节。
- 单独删一条记忆、清空记忆**不承诺**立即从 WAL 里清掉：页会被覆写，但更早的 WAL 帧可能还留着原文，要等之后的 checkpoint 或删号时才清掉。ADR-0006 的「真删」指删号。
- 线上数据库里早先被释放、没被覆写的页不处理（不 `VACUUM`）。
- 「SQLite 编译时的默认值」不再需要核实：显式打开以后，默认值是多少都不影响结果。

04 resolved 时，这张一起标 resolved。

### 2026-10-02 由 architecture-deepening-4 ticket 04 修掉

见 `.scratch/architecture-deepening-4/issues/04-database.md`。现在所有连接都由 `database.connect` 打开，统一开 `secure_delete`。`Memories` 的连接也在其中。

- 上面「建议的复现」写成了 `test_delete_account.py` 里的两条测试：先清空记忆再删号、先删一条记忆再删号，各一条。
- 这两条在改实现前都是红的，记忆原文留在 db 文件里，疑点坐实；改完后转绿。
- 按 triage 的约定，等 04 的人工验收通过、04 标 resolved 时，这张一起标 resolved。
- 04 的人工验收通过（2026-10-02），04 标为 resolved，这张一起标 resolved。
