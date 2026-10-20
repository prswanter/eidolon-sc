# 架构加深（第四轮）：数据库 module，一种连接、一处真删

Status: resolved

术语以 `CONTEXT.md` 为准，本轮不改词表。设计词汇（module、interface、seam、adapter、depth、locality）取自 `codebase-design` skill。这是 2026-10-02 架构审查里的候选 4，经 grilling 定下设计。只改 `backend/`。它把 `.scratch/memory-secure-delete/issues/01-memories-secure-delete.md` 一并做掉。

## Problem Statement

后端的用户、对话、记忆、用量、剧情库和向量化文本集都在同一个 SQLite 文件里（`settings.database_path`）。打开这个文件的有五个 module：`Store`、`Memories`、`UsageLimiter`、`StoryCorpus`、`EmbeddedTexts`（经 `CharacterFacts` 和 `WorkFacts` 打开了两次）。CLI（`story import`、`reembed`、`user usage` 等）还会在另一个进程里再打开它。

- **pragma 各配各的**：
  - `journal_mode = WAL` 只有 `Store` 设了。WAL 记在文件里，别的连接会沿用，前提是 `Store` 先打开过。
  - `secure_delete` 只有 `Store`、`UsageLimiter` 设了。
  - `foreign_keys`：`EmbeddedTexts` 没设。
  - timeout：`Store` 是默认的 5 秒，其他是 30 秒。
- **记忆删掉了，原文可能还在**：`Memories` 的连接没开 `secure_delete`。用户删一条记忆或清空记忆时，被删的页只是释放，没有覆写。用户先清空记忆、再删号时，`Store.delete_user` 已经找不到这些行，它的 `secure_delete` 覆写不到那些早就释放了的页。记忆的原文因此可能还留在数据库文件里，违背 ADR-0006「用户可以删除自己的全部数据，而且是真删」。详见 memory-secure-delete ticket 01。
- **删号由 `Store` 点名别人的表**：`Store._USER_DATA` 写死了 `memories`、`memory_vectors`、`usage` 这些别的 module 的表，还要先查表在不在。「新加用户数据的表要记得加到这里」只靠一句注释、靠人记。

## Solution

新增数据库 module `backend/src/eidolon/database.py`，管这个文件的三件事：

- **怎么打开**：`connect(path)`，每条连接同样的 pragma，五个 module 都改用它。
- **哪些表、哪些行属于一位用户**：两张清单，用户数据表和不是用户数据的表；契约测试保证库里每张表都归了类。
- **删号**：`delete_user_data(db, user_id)`，按清单删掉，再截掉 WAL。`Store.delete_user` 用自己的连接调它。

## User Stories

1. 作为用户，我想清空记忆以后再删号，记忆的原文不会留在服务器的数据库文件里，这样「真删」名副其实。
2. 作为用户，我想删掉一条记忆以后再删号，那条记忆的原文同样不留在数据库文件里。
3. 作为用户，我想删号、删记忆、清空记忆的结果和以前一样：该删的都删掉，别人的数据不受影响。
4. 作为开发者，我想每条连接的 pragma 只在一处设，这样新加一个 module 不会漏掉 `secure_delete`。
5. 作为开发者，我想新加一张表时，不归类测试就失败，这样删号不会悄悄漏掉新的用户数据。
6. 作为开发者，我想 `Store` 不再知道记忆、用量的表名，删号的规矩在数据库 module 里一处读懂。

## Implementation Decisions

- **`database.connect(path) -> sqlite3.Connection`**：
  - 建好父目录（五处现在各写一遍 `mkdir`），用 `check_same_thread=False, timeout=30` 打开，再设 `journal_mode = WAL`、`secure_delete = ON`、`foreign_keys = ON`。
  - `Store` 的 timeout 因此从 5 秒变成 30 秒。
  - 不设 `row_factory`，留给各 module 自己设（`Store`、`StoryCorpus` 用 `sqlite3.Row`，另外三个用 tuple）。
  - 不改 `isolation_level`：`EmbeddedTexts` 依赖手写的 `BEGIN IMMEDIATE`，各 module 的 `with self._db:` 也依赖默认的事务行为。
  - `secure_delete` 对不存用户数据的剧情库、向量化文本集也打开，规矩没有例外，代价只是导入时多一些写入。
- **各 module 仍然各持一条连接、各有一把锁**：构造函数签名不变，照旧收 `path`。只是把 `sqlite3.connect(...)` 和自己设的 pragma 换成 `connect(path)`。不用全进程共享的一条连接：那样会把现在能并行的读串到一把锁上，`row_factory` 也会互相冲突，而且 CLI 在另一个进程，管不到。
- **schema 和迁移不动**：仍由各 module 在构造时自己跑。它们只管各自的表，互不交叉，集中起来不会多一分 locality。
- **两张清单在 `database.py`**：
  - `USER_DATA`：表名 → 哪些行属于这位用户的 where 子句，按「先删引用别人的行」的顺序排列。就是现在 `Store._USER_DATA` 的那 10 张表，原样搬过来。
  - `NOT_USER_DATA`：`episodes`、`episode_cast`、`episode_lines`、`episode_passages`、`embedded_texts`。
  - 清单是静态的，不让各 module 构造时登记。登记的话，一个没构造过 `Memories` 的进程删号时会漏掉记忆，删除顺序也要另外处理。漏写由契约测试兜住。
- **`database.delete_user_data(db, user_id)`**：
  - 在一个事务里按 `USER_DATA` 删掉，表不存在就跳过（只打开了 `Store` 的库里没有 `memories`、`usage`），再 `wal_checkpoint(TRUNCATE)`。
  - 锁由调用方持有：`Store.delete_user` 在自己的锁里用自己的连接调它，和现在的两段（删除的事务、checkpoint）一样。
  - `Accounts.delete` 不动。
- **「真删」的边界**写进 `database.py` 的 module docstring：删号是真删，删掉的内容被覆写，WAL 也截掉。单独删一条记忆、清空记忆会覆写页，但更早的 WAL 帧里可能还留着原文，要等之后的 checkpoint 或删号时才清掉。ADR-0006 承诺的是「全部数据」，也就是删号。不给每次删除都截 WAL：截断要等所有读结束，放在删一条记忆这样的操作上不划算。
- **注释跟着改**：`Store` 关于 WAL、`secure_delete` 的注释，`UsageLimiter` 的 `secure_delete` 注释，`Memories.forget`、`Accounts.delete` 的 docstring 里「`Store.delete_user` 删掉记忆」的说法，以及 `_USER_DATA` 那句「A table added for users' data must be added here」，都改成指向数据库 module。
- **线上旧页不处理**：在 `Memories` 打开 `secure_delete` 之前就释放了、没被覆写的页，不做一次性 `VACUUM`，也不加 CLI 命令。

## Testing Decisions

- 好的测试只经由公开的 interface 断言：`connect` 返回的连接、HTTP API 加数据库文件的字节、库里有哪些表。不读各 module 的私有 `_db`。
- **`test_database.py`（新）**：
  - `connect(path)` 打开的连接，`journal_mode` 是 `wal`，`secure_delete`、`foreign_keys` 是 1，`busy_timeout` 是 30000。
  - 父目录不存在时会建好。
- **归类契约测试**：在临时库上打开整套后端，开着记忆和检索，让所有表都建出来。断言两件事：
  - `sqlite_master` 里每张不以 `sqlite_` 开头的表，恰好在 `USER_DATA` 和 `NOT_USER_DATA` 之一；
  - 两张清单里没有库里不存在的表。
- **memory-secure-delete ticket 01 的复现**，写进 `test_delete_account.py`，照 `test_deleted_data_is_gone_from_the_database_files_too` 的写法（`memory_client`、`use_everything`、`CAT`），各一条：
  - 先清空记忆（`DELETE /api/memories`），再删号；
  - 先删一条记忆（`DELETE /api/memories/{id}`），再删号。

  断言 `CAT` 不在 db 和 `-wal` 文件的字节里。本机 SQLite 默认 `secure_delete = 0`，改实现之前这两条应该是红的；如果没看到红，就在 ticket 里如实记下。
- **单独删一条记忆不测文件字节**：按上面「真删」的边界，这一条不承诺。
- **防回退**：一条小测试，扫描 `src/eidolon/` 下的源码，断言除了 `database.py` 以外没有 `sqlite3.connect(`。测试代码自己用 `sqlite3.connect` 读文件，不受限制。
- **现有测试要原样通过**：`test_delete_account.py` 的全部（含 `test_deleted_data_is_gone_from_the_database_files_too`）、`test_memories.py`、`test_usage.py`、`test_embedded_texts.py`、剧情导入和 reembed 的测试。
- 先写会失败的测试（`/tdd`），再改实现。`backend/` 下 `pytest` 全部通过，`pyright` 0 errors。

## Out of Scope

- schema 和迁移的集中登记（审查原文里的那一半）。
- 对线上已有的数据库做 `VACUUM`、加 vacuum 命令。
- 单独删一条记忆、清空记忆时也截 WAL。
- 全进程共享一条连接、改各 module 的构造函数签名。
- 前端，`Accounts` 的删号流程（`calls.hang_up` → `memories.forget` → `store.delete_user`）。
- 不改 `CONTEXT.md`，不写 ADR，不修订 ADR-0006。

## Further Notes

- 人工验收清单见 ticket 04。
- 生产镜像 `python:3.11-slim` 里 SQLite 的 `secure_delete` 默认值一直没核实过。显式打开以后，默认值是多少都不影响结果。
