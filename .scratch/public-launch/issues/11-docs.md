# 11: 更新文档

**What to build:** 想自己部署一套的人，照着 README 和 `docs/deploy.md` 就能配好 Google 和 GitHub 的 OAuth 应用、会话和自带密钥需要的环境变量，也知道公开部署时有哪些隐私上的注意事项。文档里不再出现「小圈子」「访问密钥」这类旧说法。

**Blocked by:** 02, 03, 04, 05, 06, 07, 08, 09

**Status:** done

- [x] README（中文，另有英文版和日文版）：
  - 把徽章和定位从「私用・小圈子」改成「对公众开放」
  - 把「用户与访问密钥」一节改为「登录与用户」
  - 新增自带密钥的说明
  - 更新功能表格和版权声明里「仅供私用」的措辞
- [x] `docs/deploy.md`：
  - 用「配置 OAuth 应用」取代「签发访问密钥」，写明在 Google Cloud Console 和 GitHub Developer Settings 里分别怎么创建应用、回调地址是什么
  - 列出新的环境变量：`GITHUB_CLIENT_ID`、`GITHUB_CLIENT_SECRET`、`GOOGLE_CLIENT_ID`、`GOOGLE_CLIENT_SECRET`、`EIDOLON_SECRET_KEY`、`GEMINI_BILLING_ENABLED`；说明 `EIDOLON_DEV_LOGIN` 只能在开发环境打开
  - 更新数据卷里有哪些数据的说明
- [x] `.env.example` 补上新的环境变量
- [x] `characters/characters.toml` 开头的注释：把「公共音色下架后换成自己的私有音色」改成与 ADR-0003 修订一致的说法
