# 04: 限额、单次通话上限、历史轮数

**What to build:** 管理者在后台的「配置」页修改全站的限额（每小时回合数、每小时通话次数）、单次通话的时长和回合上限、带上的历史轮数。保存后下一个回合或下一次通话就按新数字执行，进行中的通话仍用接通时的上限。见 `../spec.md` 的「配置覆盖」一节。

**Blocked by:** 02

**Status:** resolved

- [x] 这五项接入生效配置：可覆盖、可恢复成 `.env` 的值，界面显示 `.env` 的值和当前生效的值。
- [x] 取值规则和 `.env` 相同（限额 0 表示不限；不接受负数和非整数），不合法时说明原因、不保存。这几项不需要「保存前先试」。
- [x] 限额按每次 `take` 时的生效值判断；429 的文案和 `retry_at` 用当时的数字。
- [x] 单次通话上限在接通时取快照；历史轮数在回合开始时取快照。
- [x] 测试（HTTP API + `FakeClock`）：把每小时回合数从 60 改成 2 后，第 3 个回合被拒绝且文案是「每小时 2 次」；改回不限后不再拒绝；通话中改了时长上限，这通电话仍按旧上限结束，下一通按新上限；历史轮数改了以后下一个回合带上的轮数随之变化；不合法的值被拒绝。

## Comments

**实现**（2026-10-07）：五项合成生效配置里的一项 `limits`（`backend/src/eidolon/live_config.py` 的 `_Limits`，字段 `turns_per_hour`、`calls_per_hour`、`call_minutes`、`turns_per_call`、`history_turns`），走 03 的通用路：`PUT/DELETE /api/admin/config/limits`，`GET` 里有 `.env` 的值、当前生效的值和覆盖。值统一用整数、0 表示不限（`.env` 的「不限」显示成 0），不试调；校验在 `_Limits.candidate`，不是非负整数（负数、小数、字符串）就 422，原因写明是哪一项（例如「每小时通话次数需要是非负整数（0 表示不限）」）。生效方式：`UsageLimiter` 接受一个返回 `UsageLimits` 的函数，每次 `take` 时读（`take` 里只改了取上限的那一行，429 的文案和 `retry_at` 自然用当时的数字），并多了 `limits` 属性；`Calls._limits()` 在接通时（以及 `/api/ice-servers` 报 `maxCallSeconds` 时）从 `usage.limits` 取一份 `CallLimits` 交给这通电话的 `CallOutcome`；`ConversationEngine` 的 `history_turns` 改成函数，回合开始读历史时取一次。前端在 `lib/adminConfig.ts` 加了字段类型 `limit`（非负整数，校验并说明原因），表格里限额的 0 显示为「不限」。测试在 `backend/tests/test_live_config_limits.py`。

- 偏离：「通话中改了时长上限，这通电话仍按旧上限结束」用回合上限测（时长上限要真等几分钟）：两者是同一份 `CallLimits` 快照，测试同时断言保存后 `/api/ice-servers` 的 `maxCallSeconds` 是新的时长。
- 五项是一个整体保存、一起恢复；和 `.env` 相同的字段不存覆盖（`override` 里只列改过的字段）。
- 和 07（按用户的限额）的关系：`UsageLimiter.take` 只是从「构造时固定的数字」改成「每次读生效配置」，07 在它前面查用户自己的覆盖即可。

人工验证：在后台把每小时回合数改小后，真实浏览器里撞上限额的提示（次数和可以再试的时间）；通话中改了时长上限，进行中的通话按旧时长挂断、下一通按新时长（看通话页的倒计时）；改历史轮数后回复质量的变化；「配置」页限额一节的表单校验提示和「不限」的显示。
