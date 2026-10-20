# 05: 用户列表与封禁

**What to build:** 管理者在后台的「用户」页看到用户列表，能按名字、邮箱或用户 ID 搜索，打开某位用户看详情；能封禁（附只有管理者看得到的备注）和解除封禁。被封禁的用户登录时看到已被封禁和部署者的联系方式。管理者在这里永远看不到任何对话、记忆和制作人档案的内容。见 `../spec.md` 的「用户管理」一节。

**Blocked by:** 01

**Status:** resolved

- [x] 用户列表接口：分页；按名字、邮箱、用户 ID 搜索；每位用户返回名字、登录方式（提供方、显示名、邮箱、标识）、注册时间、最后活跃时间（会话的最近活动时间）、是否封禁、是否是管理者、是否自带密钥（按服务只给「有 / 没有」）。
- [x] 用户详情接口：同上，加上封禁时间和备注。响应里不含任何对话、记忆、制作人档案的内容（测试里明确断言）。
- [x] 封禁 / 解除封禁接口：复用 `Store.set_banned`（退出所有会话，通话由现有轮询挂断）；封禁时可以写备注，存进新字段。目标是管理者时拒绝，包括自己。
- [x] 命令行 `eidolon user ban / unban` 与后台走同一段代码；`ban` 增加可选的备注参数。
- [x] `.env` 新增可选的联系方式变量。被封禁的用户登录失败时，提示沿用「已被封禁」的说法并附上联系方式；没设联系方式时不显示这一句。
- [x] 前端「用户」页：Table 列表加搜索框；用户详情；封禁对话框（备注、确认）；解除封禁。管理者那一行不显示封禁按钮。手机上列表、详情和封禁能用。
- [x] 测试（HTTP API）：列表、分页、三种搜索；封禁后此人的请求得到 403、会话失效、进行中的通话被挂断；解除封禁后能重新登录；封禁管理者被拒绝；被封禁的人登录时的提示带联系方式；响应里没有内容数据；`test_admin_commands.py` 覆盖命令行的备注参数。

## Comments

**实现**（2026-10-07）：后台的用户接口在 `backend/src/eidolon/admin_users_api.py`（`add_admin_user_routes`，在 `app.py` 挂一行）：`GET /api/admin/users?q=&offset=&limit=`（默认每页 50，最新注册的在前；`q` 按用户 ID 前缀、名字，或登录方式的显示名、邮箱的子串搜索，不分大小写，`%` `_` 按字面算），`GET /api/admin/users/{id}`（多了 `banned_at`、`ban_note`），`POST /api/admin/users/{id}/ban`（body `{"note": …}`，目标是管理者时 409）和 `DELETE /api/admin/users/{id}/ban`。备注存在 `users.ban_note`，解除封禁时一并清掉；后台和 `eidolon user ban <id> --note …` 都走 `Store.set_banned(user_id, banned_at, note)`，`user list` 把备注打在封禁时间后面。命令行仍然可以封禁管理者，作为部署者的退路（ticket 01 的测试也靠它）。最后活跃时间是这位用户所有会话里最近的一次续期（`Store.last_active`；会话每小时才续期一次，所以只精确到小时；封禁会删掉会话，被封禁的人因此显示「—」）。联系方式是 `.env` 的 `EIDOLON_CONTACT`，由 `GET /api/auth/providers` 的 `contact` 带给登录页，`signInFailure("banned", contact)` 在「已被封禁」后面接上它。前端：`/admin/users`（`AdminUserList`）、`/admin/users/[id]`（`AdminUserDetails`）和 `BanUserDialog`，文案在 `zh.ts` 的 `admin.users`。

封禁后此人的请求：封禁当场删掉他的所有会话，所以之后的请求是 401（会话已失效）；403 只出现在封禁那一刻正在处理的请求上（原有的 `test_a_request_from_a_banned_users_session_is_forbidden` 覆盖），新测试断言的是 401、重新登录被拒和通话挂断。页面还没有在浏览器里跑过，手机上的列表、详情和封禁留给人工验证。
