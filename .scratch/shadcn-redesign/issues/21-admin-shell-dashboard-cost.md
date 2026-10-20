# 21: 后台外壳换成 Sidebar，看板与花费换新

**What to build:** 后台的页框换成 shadcn `Sidebar`（16rem，菜单「看板 / 配置 / 用户」，底部「返回设置」，手机上收进 Sheet）。内容区顶上是 48px 的页首（`SidebarTrigger` 加面包屑）。内容列限宽、靠中：看板和用户最宽 1200px，配置和详情最宽 960px。**只有这一张改后台的 layout**，换完后删掉对旧 `AdminShell` 的使用。

看板按 `DESIGN.md` 的后台几节重做：范围用 `Tabs` 切换；数字卡分「此刻」「{范围}内」两组；服务健康只给出问题的项加琥珀色或红色的点；手写 SVG 的 `TrendChart` 和比例条只用 `--foreground` 一种颜色，悬停的槽位高亮、其余降到半透明；结果表、按角色、通话时长、花费各装一张 Card；宽表在窄屏换成 `divide-y` 的行。不引入 TanStack Table。

属于第 4 波，和 20、22、23 并行。后台各页共用一个布局，按「一屏不混搭」的要求，21、22、23 三张必须在第 4 波结束前一起合入；在此之前，新内容装在旧外壳里只是过渡状态。

**Blocked by:** 16

**Status:** done

- [x] 后台的 layout、`AdminDashboard`、`DashboardParts`、`TrendChart`、`CostSection` 里没有 `@astryxdesign` 的引用
- [x] 验收清单第 27 行：侧栏菜单和当前项、「返回设置」、手机上的 Sheet、面包屑
- [x] 验收清单第 28–29 行：范围切换；数字卡在宽屏、中屏、手机上的排法；「数据截至」；趋势图悬停；状态点；各张表在窄屏换成行
- [x] 验收清单第 30 行：花费
- [x] 以上每行都在浅色、深色，手机宽度、电脑宽度下各看一遍
- [x] CI 的 grep 检查脚本通过
- [x] `typecheck`、`test` 通过，`next build` 成功
- [x] 开工前已把 main 合进 `feat/shadcn-redesign`，冲突在分支里解决

## Comments

2026-10-10 交付（提交 80d8e10；合并后 bf38b2e、审查修复 887a1f1）：
- 后台 layout 换成 `components/app/admin/AdminShell`（手机上点菜单换页后自动收起 Sheet）；旧 `components/AdminShell.tsx`、`components/admin/AdminPage.tsx`、`AdminPlaceholder.tsx` 已无人引用，留给清理波删。
- 新增 `components/app/admin/AdminTrail.tsx`：页面放 `<AdminTrail value={名字} />`，面包屑变成「后台 › 用户 › 名字」，用户详情已接上（bf38b2e）。名字要等浏览器里加载完才出现。
- 看板、花费、`TrendChart`、`DashboardParts` 用 shadcn 重写；`AdminPage` 的标题列改成 `grow basis-80`（手机上范围切换折到下一行，所有后台页都受影响）。表格和窄屏行按视口宽度用 CSS 切换（≥1024 / ≥1280，阈值同旧版）；「此刻」「{范围}内」两组数字卡到 `xl` 才左右排。审查后：直接挂在页面标题下的数字卡组、服务健康卡改用 h2；删掉没人用的 `useWide`/`useTouch`。
- `ui/` 改动：无。
- 和 DESIGN.md 的偏差（待人定）：「用量」「花费」各加一个 h2 和一句说明（保住原文案，用 `text-lg font-semibold`）；「未设单价」用 `outline` Badge；健康摘要正常时只写灰字（原来有绿点）；「已下线的角色」灰字；比例条也按趋势图的规则悬停时其余半透明；手机上范围切换是 32px 高（原来触屏放大），44px 触控区只留在刷新键和「看服务健康」链接上。
- 已知：只在 `<html>` 上加 `.dark`（示例路由的强制深色）时，页面标题等没写颜色的字会变成深蓝看不清，是 Astryx 旧样式只认系统设置造成的；跟随系统时正常，清理波后消失。
- 2026-10-10 用户人工验收通过。
