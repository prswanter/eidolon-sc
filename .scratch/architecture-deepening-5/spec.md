# 架构加深（第五轮）：回合与通话共用一个「放行与收尾」module

Status: ready-for-agent

术语以 `GLOSSARY.md` 为准，本轮不改词表。设计词汇（module、interface、seam、adapter、depth、leverage、locality）取自 `codebase-design` skill。这是 2026-10-07 架构审查里的候选 1，经 grilling 定下设计。只改 `backend/`。

本轮重开了 `architecture-deepening-2/grilling-notes.md` 里放弃的候选 3「回合放行」。当时放弃，是因为文字回合的限额规则只有一行「遇到 `TurnFailed` 就 `give_back()`」。后台加进运行记录、部署者租约和计量以后，放行与收尾长成了六步，文字回合和通话各写一份，两份已经不一样了。

## Problem Statement

一个回合或一次通话从开始到结束，要做同一串事：

1. 选用谁的 key（自带密钥，还是部署者的租约）；
2. 开运行记录；
3. 占限额；
4. 给 LLM 套上计量；
5. 结束时写运行记录、决定退不退次数；
6. 放开部署者的租约，而且只收尾一次。

文字回合（`TurnOutcome`）和通话（`Calls.start` 加 `CallOutcome`）各写了一份，结果不一致：

- **占了次数之后出错，次数不退，记录也不收尾。** 两边都是先占次数，再读用户的自带密钥（`describe`）、再套计量（`turn_llms`）。这两步一抛异常，次数就被白白用掉，运行记录永远不写。通话的建 `Call` 和应答 offer 抛异常时也一样；应答只处理了「返回空」，没处理「抛异常」。
- **自带密钥解不开时，两边不一样。** 文字回合留一条 `failed` 的运行记录；通话一条都不留。通话的第一步是 ice-servers 预检，自带密钥的问题几乎都在这里被拦下，所以部署者换了 `EIDOLON_SECRET_KEY` 以后，看板上完全看不到有多少人拨号失败。
- **哪些结果计入限额，分散在三处。** 文字回合在收到失败事件时退次数；通话在收尾时退；告诉浏览器「这通算不算」又在另一处单独算一遍，还要另记一份 exempt。
- **租约在三处放开。** 文字回合在 `TurnOutcome.end` 放开；通话在 `Calls.start` 的异常分支和通话任务的 done 回调里放开，`CallOutcome` 完全不知道有这回事。
- **测试绕开了出 bug 的那一段。** `TurnOutcome` 没有自己的测试。通话的快速测试用的 `CallUnderTest` 自己重写了一遍 `Calls._start` 的装配，跳过了计量和放开租约。`test_call_outcome.py` 只测限额那一半，从不看运行记录。

## Solution

新增一个 `Admissions` module：一个工厂，在装配时建好，注入给文字回合的接口和 `Calls`。每个回合或每次通话从它那里拿一个 `Admission` 句柄，句柄管从放行到收尾的整段：选 key、开运行记录、套计量、占限额、按种类和结果决定退不退次数、放开租约，只收尾一次。

`TurnOutcome` 和 `CallOutcome` 都持有这个句柄，只负责得出「结果是什么」：

- `TurnOutcome`：回合事件得出结果。
- `CallOutcome`：接通、上限、只告诉一次 `ended`、按状态得出通话的结果。

对用户来说，限额规则和以前一样。对管理者来说，看板上能看到以前漏掉的几类失败。

## User Stories

1. 作为用户，我想服务器在我的回合开始前出了内部错误时，这次不算进我的限额，这样我不会因为别人的 bug 少一次机会。
2. 作为用户，我想服务器在通话接通前出了内部错误时，这通不算进我的限额。
3. 作为用户，我想成功的回合和中途离开的回合照常计入限额，和以前一样（GLOSSARY.md「回合」「限额」）。
4. 作为用户，我想因服务出错失败、或者被拒绝（空白、太长）的回合不计入限额，和以前一样。
5. 作为用户，我想接通后无论怎么结束的通话（挂断、到上限、接通后语音服务故障）照常计入限额，没能接通的不计入，和以前一样（GLOSSARY.md「接通」）。
6. 作为只用自带密钥的用户，我想我的回合和通话一律不计入限额，结束页也照常说明不算。
7. 作为用户，我想超出限额时照常被拒绝，看到的说法和以前一样。
8. 作为自带密钥解不开的用户，我想拨号时看到的说明和以前一样，告诉我是哪项服务的 key 出了问题。
9. 作为管理者，我想每一个超出限额被拒绝的回合和通话都有一条 `rejected` 的运行记录，和以前一样。
10. 作为管理者，我想用户的自带密钥解不开时，不论是打字还是拨号，看板上都留下一条记录，这样换了 `EIDOLON_SECRET_KEY` 以后，我能看出有多少人受影响。
11. 作为管理者，我想拨号在预检这一步因自带密钥解不开而失败时，看板上记一次没能接通的通话，并标明用的是自带密钥。
12. 作为管理者，我想部署既没有部署者的语音 key、用户也没有自带时，预检被拒绝不留记录，因为这是部署本身不支持通话，不是一次失败的使用。
13. 作为管理者，我想服务器在回合或通话开始前出了内部错误时，看板上也留一条记录（回合记为 `failed`，通话记为 `not_connected`），而不是什么都没有。
14. 作为管理者，我想每一条运行记录的结果都和这次使用算没算进限额一致，这样看板上的用量和用户被拒绝的情况对得上。
15. 作为部署者，我想后台换了模型或 key 之后，被替换掉的旧客户端在用它的回合和通话都结束后才关闭，不论这些回合和通话是怎么结束的，包括开始前就出错的。
16. 作为部署者，我想部署者的租约每次使用只放开一次，不会因为重复放开而提前关掉还在用的客户端。
17. 作为开发者，我想放行与收尾只写在一个 module 里，这样改限额规则或运行记录时只改一处。
18. 作为开发者，我想「哪种结果计入限额」只有一张按种类划分的表，告诉浏览器「算不算」时也问同一个地方。
19. 作为开发者，我想 `Calls` 和文字回合的接口只依赖 `Admissions`，不再各自拿着限额、运行记录、自带密钥和部署者模型这四样东西。
20. 作为开发者，我想不跑 HTTP、不开 WebRTC，就能测到放行与收尾的每一条路径：限额计数、运行记录、租约放开次数一起断言。
21. 作为开发者，我想通话的快速测试和生产用同一套放行与收尾，不能再绕过计量和放开租约。
22. 作为开发者，我想 `CallOutcome` 的测试也断言运行记录，而不只是限额。
23. 作为以后做架构审查的人，我想旧笔记里「不要再提回合放行」的那一条指向这一轮的 spec，这样不会读到两条互相矛盾的指示。

## Implementation Decisions

### 新的 module：`Admissions` 和 `Admission`

- 放在一个新的 `admission` module 里。工厂叫 `Admissions`，句柄叫 `Admission`。不是领域词汇，不进 `GLOSSARY.md`。
- **`Admissions` 持有**：限额（`UsageLimiter`）、运行记录（`ActivityLog`）、自带密钥（`OwnKeys`），以及读取部署者当下扮演角色和提炼记忆模型的方式（现在 `Calls` 收的那个 `deployer_llms` callable，文字回合则读 `backend.config`）。在装配时建一次，注入给文字回合的接口和 `Calls`。
- **三个入口：**
  - `turn(user_id, character_id) -> Admission`：一个文字回合。
  - `call(user_id, character_id) -> Admission`：一次通话。
  - `call_setup(user_id) -> exempt`：ice-servers 预检，回答这次拨号的 key 是否都是用户自带的（即这次通话会不会计入限额）。只问一下：取了租约立刻放开，不占次数，不留成功的记录。
- **`turn` 和 `call` 的顺序：**
  1. 取 key（`for_turn` / `for_call`）；
  2. 开运行记录；
  3. 准备：读自带 LLM 的描述、给 LLM 套计量；
  4. 占次数。

  第 3 步在第 4 步之前，所以准备阶段出错时还没占次数。第 2 步在第 3 步之前，所以准备阶段出错也能留下记录。每一步出错都要把已经拿到的东西收回：写记录、放开租约，再把异常抛出去。
- **各条拒绝路径：**

  | 发生了什么 | 回合 | 通话 | 预检 |
  |---|---|---|---|
  | 自带密钥解不开（`OwnKeyFailed`） | 记一条 `failed`，`own_keys=True`；抛出 | 记一条 `not_connected`，`own_keys=True`；抛出 | 记一条 `not_connected`，`own_keys=True`；抛出；不占次数 |
  | 部署者和用户都没有语音的 key（`CallsUnavailable`） | — | 不留记录；抛出 | 不留记录；抛出 |
  | 准备阶段出错 | 记一条 `failed`；放开租约；抛出 | 记一条 `not_connected`；放开租约；抛出 | — |
  | 超出限额（`OverLimit`） | 记一条 `rejected`；放开租约；抛出 | 同左 | — |

- **`Admission` 句柄交出**：这次使用的 key（回合是 `TurnKeys` 的内容，通话是 `CallKeys` 的内容，包括语音的 key、哪些是自带的、情绪判断）、带计量的 LLM、是否 exempt，以及运行记录（`TurnOutcome` 用它设定「当前记录」，`CallOutcome` 用它开通话里每个回合的记录）。
- **收尾 `settle(result, duration=None, end_reason=None)`**：只生效一次，之后的调用什么都不做。按顺序：
  1. 按种类和结果决定退不退次数；
  2. 写运行记录（通话带上时长和结束原因）；
  3. 放开部署者的租约。

  即使前一步抛异常，后面的也照做，租约一定放开。
- **计入限额的表**只写在 `Admission` 里：

  | 种类 | 计入 | 退回 |
  |---|---|---|
  | 回合 | `success`、`left` | `failed`、`rejected` |
  | 通话 | `success`、`failed` | `not_connected` |

  exempt 的使用一律不计入。
- **`counts(result) -> bool`**：按上表和 exempt 回答「这个结果算不算限额」，给 `CallOutcome` 告诉浏览器 `counts` 用。
- 计量照旧调用现有的 `turn_llms`，位置不动。做完以后 `Admission` 是它唯一的调用方，所以候选 2 只需要改这一处。

### `TurnOutcome`

- 构造时只收一个 `Admission`，不再收限额、运行记录、自带密钥和部署者模型。
- `running()`：把句柄的运行记录设为当前；结束时收尾。行为不变。
- `see(event)`：开口时记下 `spoke`；事件结束回合时记下结果。**不再在失败时立刻退次数**，统一在收尾时由 `Admission` 按表决定。这样退次数的时刻从收到失败事件挪到了回合结束，中间只隔流结束的那一点时间，对限额没有影响。
- `end()`：`admission.settle(结果，没有结果就是 left)`。只一次，行为不变。
- 怎么从事件得出结果（`turn_result`，包括比较 `BLANK`/`TOO_LONG` 的字符串）原样保留，留给候选 3。
- 文字回合的接口改为先 `admissions.turn(...)` 拿句柄，再建 `TurnOutcome`。自带密钥解不开、超出限额的异常照常交给现有的异常处理，HTTP 响应不变。

### `CallOutcome`

- 构造时收 `Admission` 和 `CallLimits`，不再收限额、运行记录、用户、角色和 exempt。
- 通话的规则（接通、上限、只告诉一次 `ended`、语音服务故障时算不算接通）都不变。
- `_settle`：只按状态得出结果（`not_connected` / `failed` / `success`）、时长和结束原因，交给 `admission.settle(...)`。不再自己调用 `give_back`。
- `_tell`：告诉浏览器的 `counts` 改为问 `admission.counts(此刻的结果)`：没能接通是 `not_connected`，其余按接通后的结果。不再自己记 exempt。`ended` 消息的形状和文案逐字不变。
- `turn_begun` 照旧用句柄的运行记录开回合的记录。

### `Calls`

- 构造时收 `Admissions`，取代只为放行与收尾而持有的限额、运行记录、自带密钥和 `deployer_llms`。其他依赖不变。
- `ice_servers` 改用 `admissions.call_setup(user_id)` 得到 exempt。返回给浏览器的内容不变。
- `start`：
  1. `admissions.call(...)` 拿句柄，再用它和上限建 `CallOutcome`；
  2. 从这以后、到通话交给 pipeline 之前（建 `Call`、应答 offer），任何异常都调用 `outcome.set_up_failed()`，再抛出。现有的「应答返回空、或者 pipeline 没建起来」分支照旧也走 `set_up_failed()`。
- **租约改由收尾放开。** 删掉 `Calls.start` 异常分支里的放开，也删掉通话任务 done 回调里的放开。done 回调只保留「从进行中的通话里移除」。`CallOutcome` 的收尾在通话任务的 `finally` 里执行，这时 pipeline 已经停下；提炼记忆另有自己的 hold，不靠这个租约。所以租约比以前早放开的这几毫秒没有影响。
- 预检、开始通话时抛出的异常类型和 HTTP 响应都不变。

### 装配

- 在装配时建一个 `Admissions`，交给文字回合的接口和 `Calls`。

### 文档

- `architecture-deepening-2/grilling-notes.md` 的「候选 3：回合放行（放弃）」一节末尾补一行，写明这一轮为什么重开，并指向本 spec。
- 不改 `GLOSSARY.md`，不写 ADR。README、部署文档、隐私政策都不改：运行记录本来就是「每个回合和每次通话一条」，没能接通的拨号也属于通话。

## Testing Decisions

- **好的测试**经由 module 的 interface 断言可以观察到的结果：限额计数（`UsageLimiter` 报出的用量）、运行记录（`ActivityLog` 里读出的记录和结果）、部署者的租约被放开了几次。不检查内部状态，不断言调用顺序，只看结果。先写会失败的测试（`/tdd`），再改实现。
- **新增 `test_admission.py`**，测 `Admissions` 和 `Admission`：
  - **用真的依赖**：临时 SQLite 上的 `UsageLimiter`、`ActivityLog`、`Store` 和 `OwnKeys`，`FakeClock`，自带的 LLM 用现有的 LLM 假件。
  - **只替换部署者**：换成一个会数租约次数的假 `Deployer`（现有的 `Deployer` protocol 就是这个 seam）。
  - **每个用例同时断言三件事**：计数、记录、租约恰好放开一次（只用自带密钥、没取租约的用例，断言为零次）。
  - **回合**：成功（计入，`success`）；服务失败（退回，`failed`）；被拒绝（退回，`rejected`）；离开（计入，`left`）；超出限额（`rejected`，抛 `OverLimit`）；自带密钥解不开（`failed`，`own_keys=True`，抛 `OwnKeyFailed`，不占次数）；只用自带 LLM（不计入，不取租约）。
  - **通话**：没能接通（退回，`not_connected`）；接通后成功（计入）；接通后失败（计入，`failed`）；超出限额；自带密钥解不开（`not_connected`，`own_keys=True`）。
  - **预检**：正常（返回 exempt，不占次数、不留记录、租约放开一次）；自带密钥解不开（留一条 `not_connected`，`own_keys=True`，不占次数）；`CallsUnavailable`（不留记录）。
  - **收尾**：收尾两次只生效一次（计数、记录、租约都只一次）；`counts()` 和实际是否计入一致，包括 exempt。
  - **准备阶段出错**：如果能通过 interface 触发，就断言回合记 `failed`、通话记 `not_connected`、不占次数、租约放开。例如让 `Store` 读自带密钥描述时出错。触发不了的话，由下面 `Calls` 的接线测试覆盖通话那一侧。
- **`test_call_outcome.py`**：
  - fixture 改为经 `Admissions.call(...)` 拿句柄，再建 `CallOutcome`。
  - 现有用例照旧断言限额和 `ended` 消息，同时补上对运行记录的断言：结果、结束原因，接通过的还有时长。
  - 「exempt 不计入」的断言改为经由 `counts` 和实际计数一起看。
- **`test_call_turns.py`**：`CallUnderTest` 改为经 `Admissions.call(...)` 拿句柄建 `CallOutcome`，不再手写 `for_turn().llms`、跳过计量和放开租约。它测的回合轮转行为不变。
- **新增一个 `Calls` 的接线测试**：占了次数之后、交给 pipeline 之前抛异常时，次数退回，留一条 `not_connected`，租约放开。优先用现有的假件触发，比如让语音那边建 pipeline 时抛错；现有假件做不到时，才替换应答 offer 的那一步。仿照 `test_call.py` 里现有的 `Calls` 测试写。
- **经 HTTP 的测试**（`test_rate_limit.py`、`test_call_records.py` 等）不动，它们是对外行为的回归测试。如果哪条只因为本轮有意改变的行为而失败（例如预检失败现在会留记录，看板上的通话数因此变了），就按新行为改断言，并在提交说明里写清楚；其余失败都是回归。
- 已有测试的先例：`test_call_outcome.py` 的 `limiter` fixture（临时 SQLite 上的真 `UsageLimiter` 和 `ActivityLog`）；`tests/fakes.py` 里的 LLM 假件和 `FakeClock`。
- `backend/` 下 `pytest` 全部通过，`ruff` 和 `pyright` 没有新的报错。

## Out of Scope

- **候选 3（回合的结果和「开口」在一处判定）**：`turn_result` 比较消息字符串、`activity` 写记录时把没结束的回合写死为 `left`、`CallTurns` 对「开口」另有一套定义，都留到下一轮。
- **候选 2（计量来自同一个租约）**：`turn_llms` 不挪位置，部署者模型照旧另读一次生效配置，自带 LLM 的描述照旧另读一次数据库。
- 前端，以及 `ended` 消息和所有 HTTP 响应的形状、文案。
- 限额的数值和配置、单次通话上限、`UsageLimiter` 本身。
- 看板的统计口径（预检失败计入通话数，是本轮行为的自然结果，不另改看板）。
- 审查里的其他候选（4–8）。

## Further Notes

- 分支 `architecture-deepening-5`（已从 main 开出），spec 和 ticket 都提交在这个分支上。
- 人工验收清单见各张 ticket。
