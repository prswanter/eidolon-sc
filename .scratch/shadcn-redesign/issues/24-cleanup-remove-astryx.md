# 24: 清理：移除 Astryx，最后完整走一遍

**What to build:** 仓库里只剩一套组件体系，分支可以合进 main。要删掉的：

- `@astryxdesign/*`、`@stylexjs/stylex` 两个依赖；
- 共存用的层顺序和 base 层重置；
- 临时示例路由；
- 旧版共用件和不再使用的旧组件（如 `AdminPlaceholder`）；
- `astryxIcons.ts`、`notebookTheme.ts`；
- `notebookTheme.test.ts` 和剩下的旧断言（`--color-accent` 等），以及还没删的旧颜色对；
- `theme:build`/`theme:check` 两个脚本、CI 里的 `theme:check` 一步，以及 `theme/built/`。

CI 的 grep 脚本加入 `@astryxdesign`。删掉根目录 `AGENTS.md` 和 `frontend/AGENTS.md` 里的 Astryx 部分（包括 Astryx CLI 的说明），保留「shadcn 纪律」一节。`README.md` 里关于手帐主题、通话便利贴的描述改成现在的样子。新共用件不搬家、不改名。属于第 5 波。

**Blocked by:** 17、18、19、20、21、22、23

**Status:** done

- [x] `grep -r @astryxdesign src` 结果为零，CI 的 grep 脚本把它当作违规
- [x] 依赖、脚本、生成产物、旧测试都已删掉，剩下的测试全部通过
- [x] 验收清单第 35 行：用 `next build` + `next start` 把清单第 5–34 行从头走一遍（浅色、深色，手机、电脑；用户侧、后台、法务），CI 全绿
- [x] 截图脚本把全部页面重拍一套，附在合进 main 的 PR 里
- [x] `typecheck`、`test` 通过，`next build` 成功
- [x] 开工前已把 main 合进 `feat/shadcn-redesign`，冲突在分支里解决

## Comments

2026-10-10 交付，待人工验收（第 35 行）：
- 删了：`@astryxdesign/core`、`@astryxdesign/cli`、`@stylexjs/stylex`；`layers.css` 和 base 层重置；`app/preview/`；`components/` 根下的旧共用件（`AdminPlaceholder`、`AdminShell`、`AppLink`、`FailureNotice`、`MarkedAvatar`、`PageShell`、`SettingsSection`、`SubpageHeader`）和 `components/admin/AdminPage`；`AppTheme.tsx`、`astryxIcons.ts`、`notebookTheme.ts`、`notebookTheme.test.ts`、`theme/built/`；`herVars` 里的 `--color-*` 强调色及断言；`theme:build`/`theme:check` 脚本和 CI 那一步。
- `check-discipline.sh` 加了 `@astryxdesign`；根 `AGENTS.md` 的 Astryx 块删掉，换成指向 `frontend/AGENTS.md` 的一节；「shadcn 纪律（新代码）」改名「shadcn 纪律」。三份 README 改写前端说明和通话条。顺手删了 `.mcp.json` 的 astryx 服务、dependabot 的 astryx 分组、PR 模板和 `.gitattributes` 里 theme:build 的说法。
- Astryx 重置原先给 html 设的 `color-scheme: light dark` 和 body 的字体平滑补进 `globals.css` 的 base 层（不补的话深色模式会失效）。`Ja.tsx` 原先回退到 Astryx 的 `--font-family-body`，删后整条 font-family 会失效，改用新 token `font-japanese`（`var(--font-ja), var(--font-sans)`）。
- 改前、改后用截图脚本各拍一套（44 张，`frontend/screenshots/before-cleanup`、`after-cleanup`）逐像素比：用户侧、登录、法务全部一致；后台各页标题和面包屑从旧墨水色 `#1c2a4a` 变成主题前景色（之前是 Astryx 主题包裹层的文字色渗进来），其余差异是「最后活跃」等随时间变的数据。`after-cleanup` 就是给 PR 的全套截图。
- 未处理：`package.json` 里有个没人引用的 `cn` 依赖（纪律禁止 `from "cn"`），不在本票范围，留给人定；`.impeccable/` 下的设计记录还提到 Astryx，非代码，未动。
- 2026-10-10 用户人工验收通过（第 35 行），随后开 PR 合进 main。
