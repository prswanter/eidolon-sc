# 02: 通话和 ice-servers 预检接上 `Admissions`

**What to build:** 通话和拨号前的 ice-servers 预检，改为经由 01 建好的 `Admissions` 放行与收尾。`CallOutcome` 只负责通话自己的规则（接通、上限、只告诉一次 `ended`、按状态得出结果），退不退次数、算不算限额、什么时候放开租约，都交给 `Admission`。`Calls` 只依赖 `Admissions`，不再自己拿着限额、运行记录、自带密钥和部署者模型。

和现在相比，用户和管理者能看到的变化有：

- 通话在接通前因服务器内部错误中断（例如应答 offer 时抛异常），不再白占一次限额，而是记为没能接通（`not_connected`）。
- 拨号时自带密钥解不开，不论是在预检这一步还是开始通话这一步，看板上都留一条 `not_connected`，`own_keys=True`。

`ended` 消息、HTTP 响应和提示文案都不变。背景、取舍和规则表见 `../spec.md`。

**Blocked by:** 01（`Admissions` 接上文字回合）

**Status:** resolved

## 已定的设计（2026-10-07 grilling，详见 spec）

- **`Admissions.call(user_id, character_id) -> Admission`**：顺序和 `turn` 相同，取 key → 开运行记录 → 准备 → 占次数。
  - 自带密钥解不开：记 `not_connected`，`own_keys=True`，抛出，不占次数。
  - `CallsUnavailable`：不留记录，抛出。
  - 准备阶段出错：记 `not_connected`，放开租约，抛出。
  - 超出限额：记 `rejected`，放开租约，抛出。
- **`Admissions.call_setup(user_id) -> exempt`**：给 ice-servers 预检用。取了租约立刻放开，不占次数，成功时不留记录。
  - 自带密钥解不开：留一条 `not_connected`，`own_keys=True`，抛出。
  - `CallsUnavailable`：不留记录，抛出。
- **`CallOutcome`**：
  - 构造时收 `Admission` 和 `CallLimits`，不再收限额、运行记录、用户、角色和 exempt。
  - `_settle` 只得出结果、时长和结束原因，交给 `admission.settle(...)`，不再自己调用 `give_back`。
  - `_tell` 里的 `counts` 改为问 `admission.counts(此刻的结果)`。
  - 其余规则不变，`ended` 消息逐字不变。
- **`Calls`**：
  - 构造时收 `Admissions`，取代限额、运行记录、自带密钥和 `deployer_llms`。
  - `ice_servers` 改用 `call_setup`。
  - `start`：拿到句柄、建好 `CallOutcome` 之后，到交给 pipeline 之前（建 `Call`、应答 offer），任何异常都调用 `outcome.set_up_failed()` 再抛出。现有「应答返回空、或者 pipeline 没建起来」的分支照旧。
  - **租约改在收尾时放开**：删掉 `start` 异常分支里的放开，以及通话任务 done 回调里的放开；done 回调只保留「从进行中的通话里移除」。
- **装配**：把 01 建好的同一个 `Admissions` 也交给 `Calls`。

## 验收

- [x] **按 TDD**：先写下面的测试，看到它们失败，再改实现。
- [x] **`test_admission.py` 补上通话和预检的用例**，测试条件同 01：
  - 通话没能接通：退回，`not_connected`；
  - 接通后成功：计入，`success`；
  - 接通后失败：计入，`failed`；
  - 超出限额：`rejected`；
  - 通话时自带密钥解不开：`not_connected`，`own_keys=True`，不占次数；
  - 预检正常：返回 exempt，不占次数、不留记录、租约放开一次；
  - 预检时自带密钥解不开：一条 `not_connected`，`own_keys=True`，不占次数；
  - 预检遇到 `CallsUnavailable`：不留记录。
- [x] **`test_call_outcome.py`**：fixture 改为经 `Admissions.call(...)` 拿句柄。现有用例照旧断言限额和 `ended`，另外补上对运行记录的断言：结果、结束原因，接通过的还有时长。exempt 不计入的用例改为经由 `counts` 和实际计数一起看。
- [x] **`CallUnderTest`**（`test_call_turns.py`）改为经 `Admissions.call(...)` 拿句柄建 `CallOutcome`，不再手写 `for_turn().llms`；它测的回合轮转行为不变。
- [x] **新增一个 `Calls` 的接线测试**：占了次数之后、交给 pipeline 之前抛异常时，次数退回，留一条 `not_connected`，租约放开。优先用现有的假件触发；只有做不到时才替换应答 offer 那一步，并在 Comments 里说明原因。
- [x] `CallOutcome` 不再调用 `give_back`，也不再持有 exempt；`Calls` 不再持有限额、运行记录、自带密钥和 `deployer_llms`；全代码里只有 `Admission` 会放开部署者的租约（`OwnKeys` 内部为自己出错时做的收回除外）。
- [x] `backend/` 下 `pytest` 全部通过，`ruff` 和 `pyright` 没有新的报错。经 HTTP 的测试（`test_rate_limit.py`、`test_call_records.py` 等）如果只是因为本轮有意改变的行为而要改断言（例如预检失败现在会留记录），就按新行为改，并在 Comments 里写明；其余失败都是回归。
- [x] **人工验收（留给用户）**：本地起服务，打真实电话，在后台看板确认：
  - 正常拨号、接通、挂断：计入限额，一条 `success`；
  - 铃声响时就挂断（没接通）：不计入，记为 `not_connected`；
  - 只用自带密钥的通话：结束页照常说明这一通不算；
  - 超出限额：被拒绝，提示文案和以前一样，记为 `rejected`；
  - （可选）临时改掉 `EIDOLON_SECRET_KEY` 让自带密钥解不开：拨号时提示和以前一样，看板上多一条 `not_connected`，标为自带密钥。验完改回去。

## Comments

- 2026-10-07（实现）：
  - `Calls` 的接线测试替换了应答 offer 那一步（`Calls._answer`）：建 `Call` 只是一个 dataclass，建 pipeline 时的异常在 `serve` 里，而 `serve` 在 `_answer` 里跑，`_answer` 会接住 `Exception` 返回空，走的是「应答返回空」的旧分支。所以现有假件触发不了「抛异常」这条路。
  - 通话已经交给 pipeline 之后（`serve` 已经启动 live 通话）才抛的异常（例如请求被取消），不调用 `set_up_failed()`：这时通话由 live 任务在结束时收尾。否则会在 pipeline 还在跑时就退次数、写记录、放开租约。
  - 预检时自带密钥解不开留的那条记录，角色是空字符串：预检时还不知道打给谁，而 `character_id` 不能为空。看板的「按角色」表里会多一行没有名字的角色（显示为已移除）。
  - `Calls` 不再持有 `UsageLimiter`，单次通话的上限改为传入一个读取当下限额的 callable（和 `UsageLimiter` 收的是同一个）。
  - `Admission` 多交出一个 `own_llm`（这次是否用自带 LLM），给 `Call` 用。回合的准备阶段改为总是读一次自带 LLM 的描述；回合 exempt 正好是「带了自带 LLM」，所以结果不变。
  - `test_call_outcome.py` 里 exempt 的参数行删掉了：`CallOutcome` 不再分 exempt，那一支在 `Admission.counts` 里，由 `test_admission.py` 测。只留一条 exempt 用例，同时看 `ended` 的 `counts` 和实际计数。超限用例也只留在 `test_admission.py`。
  - 经 HTTP 的测试一条都没改，全部通过（1005 passed）。
