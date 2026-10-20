# 13: 限额 module 自己记、自己算、自己退、自己汇总

**What to build:** 把限额的全部知识收进 `usage.py`：它自己打开 SQLite 连接、拥有 `usage` 表（建表与补 `exempt` 列的迁移），窗口算法、`retry_at`、只保留 24 小时、退还、给管理员的按小时汇总都在里面。`Store` 不再知道限额。对外行为不变；另补一个测试固定「用户中途离开的回合照常计入」。

**Blocked by:** —

**Status:** done

- [x] `usage.py` 拥有 `usage` 表：建表、补 `exempt` 列的迁移、窗口算法、`retry_at`、24 小时清理、退还
- [x] `Store` 删掉 `take_usage`、`give_back_usage`、`usage_since`、`LimitReached`、`USAGE_KEPT`；`_USER_DATA` 仍列 `usage`，删号照旧删
- [x] 限额 module 给出最近 24 小时按小时的汇总（回合、通话、其中免计入的）；`eidolon user usage` 只打印，输出一字不改
- [x] interface 不改名：`UsageLimiter.take(user_id, kind, exempt) -> Use`、`Use.give_back()`、`OverLimit`；`exempt` 仍来自 `OwnKeys`
- [x] 何时退还仍由调用方判断：`app.py` 在 `TurnFailed` 时，`call.py` 在没接通、或服务出错且一个回合都没记下时
- [x] 新测试在限额 module 的 interface 上（tmp SQLite + `FakeClock`）：窗口滑动与 `retry_at`、免计入照记不占、`None` 不限、退还、24 小时后清掉、按小时汇总
- [x] 新 HTTP 测试：角色说完前浏览器断开的回合不留记录，但照常计入
- [x] 现有测试不改，全部通过；`pyright` 0 errors

## 背景（2026-09-27，架构体检候选 2）

1. `usage.py` 是透传层：`UsageLimiter.take` 只是把参数交给 `Store.take_usage`，把 `LimitReached` 换成 `OverLimit`。
2. 限额的领域算法（窗口内数不免计入的使用、算出 `retry_at`、只留 24 小时）写在 `Store.take_usage` 里，`Store` 的 interface 因此带着 `window`、`limit`、`exempt` 这些只有限额才懂的参数。
3. 管理员报表 `__main__._user_usage` 自己拿 `Store.usage_since` 的原始记录按小时汇总，「保留 24 小时」「什么算免计入」散在 CLI 里。
4. 疑点「浏览器中途断开时回合不退还限额」经子代理核实：断开会取消回合，回合不留记录，限额也不退还。httpx 的测试 transport 会缓冲整个响应，断开到不了应用，现有测试测不到。

## Comments

### 决定（2026-09-27，grilling）

- **`usage` 表归限额 module**：像 `Memories` 一样自己开连接、自己建表。「查、判断、写」须在一个事务里，天然在一个 module 内。`Store` 只在 `_USER_DATA` 里留一行 `usage`，删号照旧由它统一删。
- **管理员报表收进来**：限额 module 返回按小时的汇总，CLI 只打印，输出不变。
- **不改名**：`usage.py`、`UsageLimiter`、`Use`、`OverLimit` 照旧；`CONTEXT.md` 已有「限额」。
- **与候选 4 的边界**：删号、封禁的编排不动；限额 module 不提供 `forget(user_id)`。
- **免计入的输入**：`take(user_id, kind, exempt: bool)`，`exempt` 来自 `OwnKeys.for_turn` / `for_call`；限额 module 不依赖自带密钥 module。
- **中途离开照常计入**（领域决定）：因服务出错而失败的回合不计入；用户在角色说完前离开的回合不留记录，但照常计入。否则反复发送再断开就能不计入地消耗共用额度。与通话一致：接通后用户自己挂断照常计入。`CONTEXT.md` 的「限额」「回合」两条已改。所以疑点不是代码的 bug，而是术语表的措辞不准；补一个测试把它固定下来。
- **何时退还由调用方判断**：「什么算失败」依赖回合和通话自己的状态（`TurnFailed`、接通、已记下几个回合），限额 module 只管怎么记、怎么算、怎么退。
- **测试**：新测试在限额 module 的 interface 上；中途离开的 HTTP 测试照 uvicorn 的方式直接驱动 ASGI app（ASGI spec 2.3，Starlette 在 `http.disconnect` 时取消流），辅助函数放在 `tests/` 公共处；现有 HTTP、端到端测试作为安全网不改。
- 不写 ADR（容易撤回）。一个提交，含 `CONTEXT.md` 改动。

### 实现（2026-09-27）

- `usage.py`：`UsageLimiter(path, limits, clock)` 自己开连接（与 `Memories` 一样 `timeout=30`），建 `usage` 表并给旧库补 `exempt` 列；`take` 在一个事务里清掉一天前的、数窗口内不免计入的、算 `retry_at`、写入。`Use(limiter, use_id).give_back()` 退还，只退一次。`last_day(user_id) -> DayOfUse(hours: {UTC 整点: Tally}, total: Tally)`；`Tally(turns, calls, exempt_turns, exempt_calls)`。`UsageKind`、`KEPT`（原 `Store.USAGE_KEPT`）搬到这里。
- `store.py`：删掉 `usage` 的建表与迁移、`take_usage`、`give_back_usage`、`usage_since`、`LimitReached`、`USAGE_KEPT`、`UsageKind`；`_USER_DATA` 仍列 `usage`，`delete_user` 照旧在表存在时删。
- `assembly.py`：`UsageLimiter` 用 `settings.database_path`，并加入 closers（在 calls 之前加入，所以 calls 先关，挂断时的退还还能写）。
- `__main__.py`：`eidolon user usage` 打开 `UsageLimiter` 取 `last_day`，只打印。限额本身不参与查看，传默认的 `UsageLimits()`。
- 测试：新增 `tests/test_usage.py`（8 个，在限额 module 的 interface 上：窗口与 `retry_at`、免计入照记不占、每个用户每种各算各的、`None` 不限、退还且只退一次、保留一天、按小时汇总、旧库的使用照常计入）。`test_rate_limit.py` 新增 `test_a_turn_left_before_the_reply_is_done_leaves_no_record_but_counts`；辅助函数 `leave_turn` 放在 `test_text_turn.py`，照 uvicorn 的方式（ASGI spec 2.3）直接驱动 app，因为 httpx 的 ASGITransport 会先把应用跑完，断开到不了应用。
- 验证：`pytest` 493 passed，另有 1 个与本 ticket 无关的旧失败（`test_characters.py::test_missing_character_sheet_is_reported_with_its_path`）；`pyright` 0 errors；ruff 的 8 个问题在 main 上就有。变异检查：免计入也计数、窗口查询不排除免计入、不分种类、退还不生效、`retry_at` 取错一条、按分钟而不是按小时汇总、免计入回合的汇总不分种类、不给旧库补列、中途离开就退还，各自至少一个测试失败。「保留一天」的测试在 24 小时的边界上也能抓到漏删一天前的使用。

### 评审（2026-09-27，code-review）

- 修复：新连接补上 `PRAGMA secure_delete = ON`。原来退还与清掉一天前的使用走 `Store` 的连接，那里开着它；不补就是「删掉的只是释放、不覆盖」的小回退（删号仍走 `Store`，不受影响）。
- 修复：两个测试文件新增处的空行；`DayOfUse` 去掉用不到的默认值；迁移里按列名解包 `PRAGMA table_info`，不再用 `row[1]`；`test_usage.Deployment.limiter` 的换行。
- 保留不改：
  - CLI 看报表要构造一个带默认限额的 `UsageLimiter`：这是「汇总收进拥有这张表的 module」的代价，另起一个只读类型会让一张表有两个入口。
  - `store`、`memory`、`usage` 三处相同的 SQLite 连接初始化：已有先例，要统一另开。
  - `Tally` 手工展开「种类 × 免计入」：只有两种。
  - `leave_turn` 放在 `test_text_turn.py`：`send_turn`、`start_conversation` 也在那里，各测试都从那里导入。
