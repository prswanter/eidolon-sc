# 01: `Admissions` 接上文字回合

**What to build:** 新增 `Admissions`（工厂）和 `Admission`（一次使用的句柄），先接上文字回合。一个文字回合的放行与收尾都由 `Admission` 负责：

- 放行：选 key、开运行记录、准备（读自带 LLM 的描述、套计量）、占次数；
- 收尾：只一次，按种类和结果决定退不退次数，写运行记录，放开部署者的租约。

`TurnOutcome` 只负责从回合事件得出结果。对用户来说，限额规则和 HTTP 响应都不变。行为上只有一处变化：开始前的准备阶段出错时，不再白占一次限额，而是留一条 `failed` 的运行记录。背景、取舍和完整的规则表见 `../spec.md`。

**Blocked by:** None (can start immediately)

**Status:** resolved

## 已定的设计（2026-10-07 grilling，详见 spec）

- **新 module `admission`**：里面是 `Admissions` 和 `Admission`，不进 `GLOSSARY.md`。
  - `Admissions` 持有限额、运行记录、自带密钥，以及读取部署者当下扮演角色和提炼记忆模型的方式。在装配时建好，注入给文字回合的接口。
  - 这张 ticket 只做 `turn(user_id, character_id) -> Admission`；`call` 和 `call_setup` 留给 02。
- **放行的顺序**：取 key → 开运行记录 → 准备 → 占次数。每一步出错时，都把已经拿到的东西收回（写记录、放开租约），再抛出异常。
  - 自带密钥解不开：记 `failed`，`own_keys=True`，抛 `OwnKeyFailed`，不占次数。
  - 准备阶段出错：记 `failed`，放开租约，抛出，不占次数。
  - 超出限额：记 `rejected`，放开租约，抛 `OverLimit`。
- **`Admission`**：
  - 交出 key、带计量的 LLM（照旧调用 `turn_llms`，它的位置不动）、是否 exempt、运行记录。
  - **`settle(result, duration=None, end_reason=None)`**：只生效一次。顺序是先按表决定退不退次数，再写运行记录，最后放开租约。即使前一步抛异常，租约也一定放开。
  - **计入限额的表**只写在这里。回合：`success`、`left` 计入，`failed`、`rejected` 退回。通话那一行一并写好，02 才会用到：`success`、`failed` 计入，`not_connected` 退回。exempt 一律不计入。
  - **`counts(result) -> bool`**：按上表和 exempt 回答这个结果算不算限额。
- **`TurnOutcome`**：
  - 构造时只收 `Admission`。
  - `see` 不再在失败时立刻退次数。
  - `end()` 调用 `admission.settle(结果，没有结果就是 left)`。
  - `turn_result` 原样保留（候选 3 的范围）。
- **文字回合的接口**：先 `admissions.turn(...)` 拿到句柄，再建 `TurnOutcome`。异常照常交给现有的异常处理。
- **旧笔记**：`architecture-deepening-2/grilling-notes.md` 的「候选 3：回合放行（放弃）」末尾补一行，写明本轮为什么重开，并指向 `architecture-deepening-5/spec.md`。

## 验收

- [x] **按 TDD**：先写 `test_admission.py` 里回合和收尾的用例，看到它们失败，再写实现。
- [x] **`test_admission.py` 的测试条件**：用临时 SQLite 上真的 `UsageLimiter`、`ActivityLog`、`Store`/`OwnKeys`，以及 `FakeClock`；只有部署者换成一个会数租约次数的假 `Deployer`。每个用例同时断言三件事：限额计数、运行记录、租约放开的次数。覆盖下面这些用例：
  - 回合成功：计入，`success`；
  - 服务失败：退回，`failed`；
  - 被拒绝：退回，`rejected`；
  - 离开：计入，`left`；
  - 超出限额：`rejected`，抛 `OverLimit`，租约放开；
  - 自带密钥解不开：`failed`，`own_keys=True`，不占次数；
  - 只用自带 LLM：不计入，不取租约；
  - 收尾两次只生效一次；
  - `counts()` 和实际是否计入一致，包括 exempt；
  - 准备阶段出错：记 `failed`、不占次数、租约放开。如果没法通过 interface 触发，在 Comments 里说明原因。
- [x] `TurnOutcome` 不再自己调用 `give_back`，也不再直接持有限额、运行记录或自带密钥。
- [x] 文字回合的接口只经由 `Admissions` 放行，不再自己去读部署者的模型设置。
- [x] 旧笔记已补上那一行。
- [x] `backend/` 下 `pytest` 全部通过，`ruff` 和 `pyright` 没有新的报错。经 HTTP 的测试（例如 `test_rate_limit.py`）不改断言就能通过；如果哪条必须改，在 Comments 里说明原因。
- [x] **人工验收（留给用户）**：本地起服务，发几个文字回合，在后台看板确认：
  - 成功的回合计入限额，有一条 `success` 记录；
  - 空白或太长的输入被拒绝，不计入限额，记为 `rejected`；
  - 发出后立刻关掉页面，照常计入，记为 `left`；
  - 超出限额时被拒绝，提示文案和以前一样。

## Comments

- 2026-10-07（实现）：
  - 准备阶段出错可以经由 interface 触发：`Admissions` 收的「读取部署者模型」的 callable 抛异常即可（对应生效配置读不出来）。测试用这个办法断言记 `failed`、不占次数、租约放开一次。
  - 退不退次数只看种类和结果，不看 exempt：exempt 的使用一律不计入限额（`counts()` 为 False），但成功和离开的 exempt 回合照旧留在用量里给后台看，与以前一致。
  - `Admission` 带一个类型参数（`Admission[TurnKeys]` / `Admission[CallKeys]`），`keys` 交出这次的 key；`call` / `call_setup` 留给 02。
  - `Calls` 这一张没动，只是和 `Admissions` 共用装配里的同一个「读取部署者模型」函数。
  - 经 HTTP 的测试一条都没改，全部通过（998 passed）。

