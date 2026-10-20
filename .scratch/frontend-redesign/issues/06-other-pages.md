# 06: 设置、记忆、登录、同意和静态页迁到新视觉

**What to build:** 其余页面全部用 Astryx 和新主题重写：登录（落地页）、同意、设置（制作人档案、登录方式、自带密钥、通话设置、删除数据）、记忆、隐私、条款。行为不变，界面安静、角色在前（`PRODUCT.md`）。全部迁完后删掉旧的 `globals.css`。

**Blocked by:** 01

**Status:** ready-for-agent

- [x] 各页面按 `DESIGN.md` 重写，版式遵守 Astryx 的布局规则（先定框架和区域宽度，表单和文字限宽）
- [x] 登录页要说明这是什么、有哪些角色，并声明非官方粉丝作品、角色由 AI 扮演；角色列表不写死，随 `characters.toml` 变化
- [x] 自带密钥只显示末 4 位；失败提示遵守「不会改用部署者的 key」的语义
- [x] 记忆页：每条记忆标注来源角色（可用她的 `mark` 色做小标记），删除和清空保留二次确认
- [x] 所有文案从 01 建好的文案模块取
- [x] 删除 `frontend/src/app/globals.css` 以及里面的 `@layer legacy`，确认没有页面还依赖它
- [x] 浅色和深色模式、手机和电脑各截图检查

## Comments

**2026-09-28 实现完成**（Status 不动，理由同 01；删除 `globals.css` 那项留给合并 03 之后统一做）：

- 版式：六个页面都用 `PageShell`，一栏、`contentWidth={640}`、`padding={4}`，手机和电脑同一个版式。设置、记忆、隐私、条款、同意页有页首（`components/SubpageHeader.tsx`：返回键 + Title 字号标题 + 末端操作）；登录、同意、隐私、条款页有页脚声明（`components/LegalFooter.tsx`：非官方粉丝作品、角色由 AI 扮演，以及两份文件的链接）。设置页每一节是 `components/SettingsSection.tsx`（标题、说明、内容，下面一条 `Divider`）；没用 Astryx `Section`，因为它会伸出页面内边距，和页首的内容线对不齐。
- 登录页：说明、登录按钮（第一个提供方 primary，其余 secondary）、开发登录、「可以说话的偶像」列表。名单从 `/api/characters` 取，每位的头像带她 `--her-mark` 的 2px 描边（`components/MarkedAvatar.tsx`，颜色只经 `herVars()` 注入）；`lib/api.ts` 的 `Character` 补上了后端已经返回的 `color`、`background_url`。
- 记忆页：每行是她的小头像（mark 描边；来源角色已不在时是没有描边的首字头像）、记忆全文、「对某某说的 · 日期」。逐条删除和清空全部都用 `AlertDialog` 确认；逐条删除原来没有确认，按本 ticket 的要求加上了。
- 自带密钥：只显示末 4 位；三项没填时收成一行「未填写，使用部署者的服务」+「填写」，点开才是表单（原来是直接摊开三张表单），这样系统界面安静一些。说明文案保留「不会改用部署者的密钥」；限额说明由 `lib/ownKeys.ts` 的 `limitExemption()` 决定。
- 删除全部数据：原来是行内的第二个按钮，现在是 `AlertDialog`，仍然要确认一次。
- `FailureNotice` 换成 Astryx `Banner`（error），接口不变，没登录时带「去登录」按钮；首页和对话页（旧界面）也在用，截图确认还能正常显示。
- 文案：`i18n/zh.ts` 新增 `legal`、`failure`、`login`、`consent`、`settings`、`memories`、`privacy`、`terms` 分组，没改已有分组。句中带链接的文案用 `{名字}` 占位，由 `i18n/interpolate.ts` 换成链接。`lib/signIn.ts` 的登录失败原因、`PROVIDER_LABELS` 还留在 lib 里（有测试，且只能扩展）；通话音质和接口类型的名称搬进了文案模块。
- 抽出的纯逻辑（先写测试）：`lib/producerProfile.ts`（草稿与档案互转、是否改动、称呼按字截到 20 个字：Astryx `TextInput` 没有 `maxLength`）、`lib/ownKeys.ts`、`lib/memories.ts`（`sourceCharacter()`）、`i18n/interpolate.ts`。
- 站内链接用 `components/AppLink.tsx`（Astryx `Link` + `next/link`，客户端组件：服务端页面不能把 `next/link` 当 prop 传给客户端组件）。句中链接默认画下划线，因为强调色和正文是同一种墨水。
- `globals.css`：删掉了只属于这些页面的规则（`.settings`、`.field*`、`.hint*`、`.error*`、`button.danger`、`.memory*`、`.landing-*`、`.sign-in-*`、`.own-key*`、`.prose*` 等 42 条），`all: revert` 和元素选择器只剩 `main.selection|conversation`。首页和对话页用到的规则都留着，截图确认它们没变。
- 检查：`npm run typecheck`、`npm test`（12 个文件 107 个测试）、`next build` 都通过。本地起了后端（临时数据库、开发登录）和 `next dev`，在浅色 / 深色、390px / 1280px 下截图看过登录（含登录失败提示）、同意、设置（含 LLM 表单展开、删除确认框）、记忆（含删除确认框，另往临时库里插了三条记忆，其中一条的来源角色已不在）、隐私、条款。没看到的：已绑定登录方式的列表（开发登录的用户没有第三方身份）、已填自带密钥的状态、「已绑定 X」提示。

**2026-09-28 合并 03 之后**：删除了 `frontend/src/app/globals.css`，`layers.css` 去掉了 `legacy` 层。删除前查过全部 `className`，没有页面还在用旧类名；typecheck、`npm test`（131 个）和 `next build` 都通过。
