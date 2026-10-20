# 13: 底座②：Tailwind + shadcn 与 Astryx 并存

**What to build:** 在旧页面一个像素都不变的前提下接入新底座：

- Tailwind v4（`@tailwindcss/postcss`）。
- `shadcn init -b base -p nova`（底层 Base UI，样式 `base-nova`）。init 会把根布局字体换成 Geist、生成自引用的 `--font-sans`，都要撤掉。CLI 报 `EALLOWSCRIPTS` 时，用 `NPM_CONFIG_USERCONFIG` 指向一份临时 npmrc 绕开。
- 主题以 shadcn neutral 为底，只覆盖 `--destructive`（挂断红）和深色浮层边线，并把 `notebookTheme.ts` 里还成立的深色修补和对比度决定搬进来。
- 共存用的 CSS 层顺序：`reset, theme, base, astryx-base, astryx-theme, components, utilities`。
- 在 Tailwind 的 `base` 层把 `h1`–`h6`、`p`、`small` 改回 `color: inherit; font: inherit`。

新增主题对比度测试（替代 `notebookTheme.test.ts` 的角色，旧测试先保留）。

每一步单独提交，每个提交都要和基准图像素零差异。属于第 1 波（底座）。

**Blocked by:** 12（字体已经确认，基准图已经拍好）

**Status:** done

- [x] `components.json` 是 `base-nova`，`cn` 从 `@/lib/utils` 导出
- [x] 主题对比度测试覆盖：`--muted-foreground` 在 `--background` 和 `--muted` 上 ≥ 4.5；`--destructive` 上的白字 ≥ 4.5；深色浮层边线和浮层底、页面底都 ≥ 3。浅色、深色两种模式都测
- [x] `notebookTheme.test.ts`、`herVars.test.ts` 的旧断言和 CI 的 `theme:check` 照常通过
- [x] 截图脚本重拍后，和第 12 张拍的基准图像素零差异（范围：登录、法务、后台各页的静态部分）
- [x] `typecheck`、`test` 通过，`next build` 成功
- [x] 开工前已把 main 合进 `feat/shadcn-redesign`，冲突在分支里解决

## Comments

2026-10-09 交付（提交 4ec8b7f、88d23c3、0ddcea6、82ac436），每一步重拍后和基准图零差异：
- 层顺序和 Tailwind 放在同一个提交：否则 Tailwind 自己声明的层排在 Astryx 后面，preflight 会盖过组件样式。
- `:root`/`.dark` 合成 `light-dark()` 跟随系统；`.dark` 强制深色子树。Next 的 LightningCSS 把 `light-dark()` 换成在声明处就地求值的开关变量，所以 `.dark` 上要把整组变量再声明一次（`/preview` 第三栏验证过）。
- 覆盖值：`--destructive` = 挂断红；新增 `--overlay-edge`；**另外**浅色 `--muted-foreground` 压到 `oklch(0.52 0 0)`：shadcn 的 0.556 在 `--muted` 上只有约 4.3:1、0.54 在她的壁纸上约 4.4:1，达不到规格自己的 4.5 要求。已写进 DESIGN.md。
- `notebookTheme.ts` 里的横幅说明字 `bannerNote`、表头修补只针对 Astryx 的 Banner/Table，不搬；shadcn 的 Alert、Table 在用到它们的那一波按对比度测试处理。
- 主题对比度测试 `src/theme/themeContrast.test.ts` 直接读 `globals.css`（辅助在 `src/theme/themeCss.ts`）。
