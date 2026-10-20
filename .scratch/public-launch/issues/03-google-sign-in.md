# 03: Google 登录

**What to build:** 访客可以用 Google 账号登录，规则和 GitHub 登录一样。Google 邮箱没有验证的，登录会被拒绝，并看到明确的原因。邮箱和某个 GitHub 身份相同也不会自动合并，两者是两位用户。

**Blocked by:** 01

**Status:** done

- [x] 实现 Google 提供方（OpenID Connect，只申请 openid、email、profile 三个权限），读取 `GOOGLE_CLIENT_ID` 和 `GOOGLE_CLIENT_SECRET`；没配置时，不显示也不开放这种登录方式
- [x] `email_verified` 不为 true 的拒绝登录
- [x] 测试覆盖：首次登录、再次登录、邮箱未验证被拒；和某个 GitHub 身份邮箱相同时，得到的是另一位新用户
