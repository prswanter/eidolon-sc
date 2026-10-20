# 01: 接入 Astryx，搭好应用外壳和视觉底座

**What to build:** 把原型里定下的视觉底座搬进正式代码：Astryx 主题（手帐纸面、事务所深蓝墨水、明暗两套）、字体、Lucide 图标、按角色注入颜色的机制，以及全站共用的页面外壳。做完之后，任何页面都能用这套底座来写；旧页面暂时保持原样。视觉以 `DESIGN.md` 为准，规则见 `../spec.md`。

**Prototype:** 原型参见提交 `8551cde`（原 `prototype/frontend-redesign` 分支，合并后已删除）里的 `frontend/src/app/prototype/`（`git switch --detach 8551cde` 后 `npm run dev` 打开 `/prototype`，右下角「原型控制台」可以跳到任意状态）。

**Blocked by:** None (can start immediately)

**Status:** ready-for-agent

- [x] 在根布局引入 `@astryxdesign/core/reset.css`、`astryx.css`，挂上主题（`mode="system"`）。主题从 `frontend/src/app/prototype/theme.tsx` 搬过来，放到正式位置（例如 `frontend/src/theme/`）
  - 深色模式下 Astryx 默认颜色有几处看不清，覆盖都要带上：危险红、弹层底色、弹层边线（组件覆盖的键名就是稳定类名 `.astryx-<键>`，例如 `"bottom-sheet"`）
  - 生产环境考虑用 `astryx theme build` 预构建，避免首屏闪烁
- [x] 字体用 `next/font`：日语 M PLUS 1p（`--font-ja`），中文 Noto Sans SC（`--font-zh`）。日语原文统一用带 `lang="ja"` 的包装组件（参考原型的 `Ja.tsx`）
- [x] 图标只用 `lucide-react`，并在主题的 `icons` 里注册 Astryx 自带图标名。不手绘 SVG
- [x] `frontend/src/lib/imageColor.ts` 和测试保留，作为唯一的角色取色来源。原型的 `herVars.ts` 搬进正式代码，成为给子树注入角色颜色的唯一入口；界面上不得直接使用原色值
- [x] 界面文案集中管理（例如 `frontend/src/i18n/zh.ts`），这次只有简体中文；本 ticket 建好结构，之后各 ticket 的新界面都从这里取文案
- [x] 旧的 `globals.css` 仍放在 `@layer legacy` 里，旧页面不变；等 06 迁完所有页面后删除
- [x] `@stylexjs/stylex` 保持为显式依赖（Astryx 运行时需要，不需要编译插件）
- [x] 从实现分支里删除原型：`frontend/src/app/prototype/`、`frontend/public/prototype/`（包括只用于配色压力测试的「風野灯織」）。原型本身保留在提交 `8551cde` 里（原 `prototype/frontend-redesign` 分支，合并后已删除），之后以它和 `DESIGN.md` 为参照
- [x] `npm run typecheck`、`npm test`、`next build` 都通过

## Comments

**2026-09-28 实现完成**（`triage-labels.md` 里没有「已完成」这个标签，所以 Status 不动，在这里记一笔）：

- 主题：源文件 `frontend/src/theme/notebookTheme.ts`，Astryx 自带图标的 Lucide 注册表单独放在 `astryxIcons.ts`（`theme build` 只带上具名导入的图标表）。已经做了预构建：`npm run theme:build` 生成 `frontend/src/theme/built/`（`notebookTheme.css` + `eidolon-notebook.js/.d.ts`，提交进仓库），根布局引入 CSS，`AppTheme` 用预构建的主题对象挂 `<Theme mode="system">`，令牌和组件覆盖在服务端渲染的首屏就有。`@astryxdesign/cli` 0.6.3 固定为 devDependency。
  - 预构建是否过期由 `src/theme/notebookTheme.test.ts` 检查（比对预构建和源文件的令牌、图标），`npm test` 里就会跑。`npm run theme:check`（CLI 自带的 `--check`）也有，但它逐字比对生成文件头里的源文件路径，Windows 生成的在 Linux 上会报过期，所以没放进 `npm test`。
  - 深色模式修补都带上了：危险红、弹层 / 卡片底色、`dialog`、`bottom-sheet`、`popover` 的深色边线。
- 字体：根布局用 `next/font` 载入 Noto Sans SC（`--font-zh`，主题正文字体）和 M PLUS 1p（`--font-ja`），`frontend/src/theme/Ja.tsx` 包日语原文。
- 图标：界面用的语义别名在 `frontend/src/theme/icons.ts`（原型控制台专用的 `SlidersIcon` 没搬）。
- 角色颜色：`frontend/src/theme/herVars.ts`（`herVars()`、`ld()`），带测试。去掉了原型里没用上的 `--her-raw`，官方原色只以 `--her-call-glow` 出现（纯装饰光晕）。
- 文案：`frontend/src/i18n/zh.ts`（按界面分组，带参数的句子写成函数），`@/i18n` 导出 `copy` 和 `Messages` 类型；根布局的标题和描述已经从这里取。
- 页面外壳：`frontend/src/components/PageShell.tsx`（占满视口的纸面 + Astryx `Layout` 的页首 / 起始栏 / 内容 / 页脚，内容区是 `main` 地标，并在这里记下 `--office-ink`）。
- 旧页面：层的先后由 `frontend/src/app/layers.css` 第一个声明：`reset, legacy, astryx-base, astryx-theme`。legacy 必须高于 reset，否则全局引入的重置会去掉旧页面的边框、按钮底色和默认外边距；所以 `globals.css` 里给旧页面的根（`main.settings|selection|conversation`）加了 `all: revert`，抵消重置，元素选择器（`button`、`input`）也限定在这些根下面，不会漏到新页面上。用浏览器逐个元素比对了 /login、/privacy、/terms、/settings、/consent、/memories、/ 改动前后的计算样式：`main` 以下完全一致。
- 原型已删除（`frontend/src/app/prototype/`、`frontend/public/prototype/`），`DESIGN.md` 里指向原型文件的路径改成了正式位置。
