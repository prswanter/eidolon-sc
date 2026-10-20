# 07: 单独限额

**What to build:** 管理者可以给某位用户单独设定每小时的回合数和通话次数（正整数、不限，或 0 即只能用自带密钥），附一句备注，也可以随时取消，回到全站默认。这位用户撞上限额时，提示里的数字是他实际适用的数字。见 `../spec.md` 的「用户管理」一节和 GLOSSARY「限额」。

**Blocked by:** 05

**Status:** resolved

- [x] 新增按用户的限额覆盖表（每小时回合数、每小时通话次数、备注、更新时间），登记为用户数据：删除用户时一并删除。两项可以只设其中一项，另一项跟随全站。
- [x] `UsageLimiter.take` 先查这位用户的覆盖，再用全站值；429 文案和 `retry_at` 用实际适用的数字。0 时：用了自带密钥、免计入的回合和通话照常放行，其余全部拒绝，文案说明「只能用自带密钥」。
- [x] 后台接口：设置、取消某位用户的单独限额。用户列表和详情显示是否有单独限额及数值。
- [x] 前端：用户详情里的「单独限额」编辑（数字 / 不限 / 0、备注、取消）。
- [x] 单次通话的上限不能单独设。
- [x] 测试（HTTP API + `FakeClock`）：设为 1 后第 2 个回合被拒绝且文案是「每小时 1 次」；设为不限后超过全站值也不拒绝；设为 0 时用部署者 key 的回合被拒绝、自带 LLM 的回合照常；只设回合数时通话次数跟随全站；取消后回到全站值；删除用户时覆盖一并删除。

## Comments

**实现**（2026-10-07）：单独限额表 `user_limits`（`user_id`、`turns_per_hour`、`calls_per_hour`、`note`、`updated_at`）建在 `backend/src/eidolon/usage.py`，和 `usage` 表同一个 `UsageLimiter` 管，登记在 `database.USER_DATA`（删除用户时一并删除）。每一项 NULL 表示跟随全站，-1 表示不限，其余是次数（0 即只能用自带密钥）；对外统一成 `UserLimit = int | "unlimited" | None`。`UsageLimiter.take` 在同一把锁里先用 `_own_limit` 查这位用户的覆盖，没有覆盖的一项再取 `self._limits[kind]`（全站值仍只从这一处来，ticket 04 改成读生效配置时只换这一处）。0 且不免计入时抛 `OverLimit(kind, 0, None, now)`，文案「你的文字对话 / 语音通话只能用自带密钥，可以在设置里填写」，`retry_at` 为 null、不带 `Retry-After`（`app.py` 的 429 处理）；前端 `lib/api.ts` 的 `overLimit` 遇到 `retry_at: null` 不再接「请稍后再试」。后台接口在 `admin_users_api.py`：`PUT /api/admin/users/{id}/limits`（body `{"turns_per_hour", "calls_per_hour", "note"}`，每项是 0–100000 的整数、`"unlimited"` 或 null，两项都是 null 时 422）和 `DELETE /api/admin/users/{id}/limits`，都返回这位用户的详情；列表和详情多了 `limits`（没有时 null）。管理者也可以被单独设限额，没有拦。单次通话的时长和回合上限没有接口、表里也没有列。前端：列表多一列「单独限额」（`AdminUserList` 的 `UserLimits`），详情里有「单独限额」一项和设定 / 修改 / 取消按钮，编辑在 `UserLimitsDialog`（每项一个 SegmentedControl：跟随全站 / 设定次数 / 不限，选了次数再填 NumberInput），展示和表单换算在 `lib/adminUsers.ts` 的 `describeLimit`、`limitDraft`、`limitsInput` 并有单元测试，文案在 `zh.ts` 的 `admin.users.limits` / `limitsDialog`。测试在 `backend/tests/test_user_limits.py`。

偏离：没有另做「0」这个选项，0 通过「设定次数」填 0 得到，输入框下面写明「填 0 表示只能用自带密钥」，显示时 0 写成「只能用自带密钥」。

留给人工验证：在浏览器里给一位用户设、改、取消单独限额，列表和详情的显示；设为 0 后这位用户在对话页和拨打通话时看到的提示；手机上对话框里两个 SegmentedControl 和数字框的排布。
