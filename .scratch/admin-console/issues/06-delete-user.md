# 06: 删除用户与封禁名单

**What to build:** 管理者可以在用户详情里替某位用户删除他的全部数据，效果和用户自己删除完全一样。被封禁的用户删除后，他用过的登录方式仍然不能再登录或被绑定，删除不会变成解封。见 `../spec.md` 的「用户管理」一节和 GLOSSARY「用户」「封禁」。

**Blocked by:** 05

**Status:** resolved

- [x] 删除接口复用用户自删的整体删除路径（对话、记忆、制作人档案、登录方式、会话、自带密钥等），进行中的通话照常被挂断。目标是管理者时拒绝。
- [x] 删除被封禁的用户之前，把他每个登录方式的「提供方 + 标识」做成带密钥的哈希存进封禁名单表：有 `EIDOLON_SECRET_KEY` 时用它派生的密钥（HMAC），没有时用普通 SHA-256。这张表登记为「不是用户数据」。
- [x] 登录和绑定登录方式时先查封禁名单，命中就按「已被封禁」拒绝，提示与 05 相同。
- [x] 删除没有被封禁的用户时不写封禁名单，他之后可以重新注册。
- [x] 前端：用户详情里的删除按钮，二次确认，说明「彻底删除、备份里最多再留 30 天；如果他已被封禁，他的登录方式不能再登录」。
- [x] 测试（HTTP API）：删除后此人的所有数据都不在了（复用 `test_delete_account.py` 的检查方式）；被封禁的人删除后，用同一个 GitHub / Google 身份登录被拒绝、绑定到别的用户也被拒绝；未被封禁的人删除后能用同一身份重新注册；删除管理者被拒绝。

## Comments

**实现**（2026-10-07）：后台接口是 `DELETE /api/admin/users/{id}`（`backend/src/eidolon/admin_users_api.py`，成功 204，没有这位用户 404，目标是管理者 409），直接调用户自删用的 `Accounts.delete`（`backend/src/eidolon/accounts.py`），所以挂断通话、先等记忆提炼收尾、`database.delete_user_data` 整体删除都是同一条路。`Accounts.delete` 在删除前看这位用户是否被封禁：是的话，把他每个登录方式的 `identity_hash(provider, subject)` 交给 `Store.delete_user(user_id, banned_identities)`，先写进封禁名单表 `banned_identities`（`identity_hash`、`added_at`，建表在 `store.py`，登记在 `database.NOT_USER_DATA`），再整体删除。哈希是 `provider:subject` 的 HMAC-SHA256，密钥由 `EIDOLON_SECRET_KEY` 经 HKDF 派生，`info=b"eidolon ban list"`，与自带密钥、配置覆盖的都不同；没设 `EIDOLON_SECRET_KEY` 时是普通 SHA-256。`Accounts._check`（登录和绑定都先走它）第一步查封禁名单，命中就是 `SignInRefused("banned")`，登录页和设置页沿用 05 的「已被封禁」文案（登录页附联系方式）。这条规则对用户自删也成立，只是被封禁的人登不进来，自删走不到。前端：`AdminUserDetails` 里非管理者的用户多一个「删除这位用户」按钮，`AlertDialog` 二次确认，说明按是否被封禁分两种；删完回到用户列表。`lib/adminUsers.ts` 的 `deleteUser`，文案在 `zh.ts` 的 `admin.users.delete` / `deleteDialog`；管理者那一行的提示改成「管理者不能在后台封禁或删除」。测试在 `backend/tests/test_admin_delete_user.py`。

偏离：哈希密钥跟着 `EIDOLON_SECRET_KEY` 走，部署者换了 `EIDOLON_SECRET_KEY`（或从没有改成有）以后，之前写进名单的哈希就对不上了，那些被删除的封禁用户可以重新注册。和自带密钥换 key 后失效是同一类后果，没有另做迁移；ticket 12 写部署文档时可以一并说明。绑定时被名单拒绝，设置页显示的也是「这位用户已被封禁，无法登录。」，与 05 的提示相同，没有另写绑定专用的文案。

留给人工验证：在浏览器里删除一位普通用户和一位被封禁的用户，确认对话框里两种说明、删除后回到列表；被删除的封禁用户用原 GitHub / Google 登录看到「已被封禁」；手机上的按钮换行和对话框。
