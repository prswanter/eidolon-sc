# 01: Astryx 组件盘点与 shadcn 对应表

Type: research
Blocked by: None
Status: resolved

## Question

`frontend/src` 里（48 个文件引用 `@astryxdesign`）实际用到了哪些 Astryx 组件、hook、token 和图标适配（`theme/astryxIcons.ts`），各用了多少处？每一项在 shadcn/ui 中对应哪个组件；shadcn 没有、需要自己写的有哪些（布局原语、`StatusDot`/`Token`、列表 `Item`、图表、Sheet/Drawer 的变体等）？主题层（`notebookTheme.ts`、`herVars.ts`、`lineState.ts`、`AppTheme.tsx`、`Ja.tsx`）里有哪些逻辑和 Astryx 无关、可以原样保留？

产出一张对应表（Astryx → shadcn / 自写 / 删除），并附上每项的使用次数和代表文件。

## Answer

调研全文在丢弃式分支 `research/astryx-inventory` 的 `.scratch/shadcn-redesign/research/01-astryx-inventory.md`（提交 d9cb778）。要点：

- 47 个源文件引用 Astryx，用到约 60 项组件、hook 和类型；大头是布局排版（`Text`/`VStack`/`HStack`/`StackItem` 合计 300 多处）。间距可以和 Tailwind 一一对应，字号对不齐（large 17px，Tailwind 的 `text-lg` 18px）。
- 约 20 项可以直接换成 shadcn 组件（Button、Alert、Empty、Dialog、Drawer、Field、Toggle Group、Sidebar，以及官方聊天组件 Message、Bubble、Message Scroller）。要套薄封装的：Selector、MoreMenu、BottomSheet、Avatar、Token、Table（排序、行展开）、Pagination、Resizable。要自己写的：Text、Heading、StatusDot、Timestamp、MetadataList、NumberInput、ChatComposer、`useMediaQuery`、通话层强制深色。
- 可以删掉 Stack/Layout 系列、`astryxIcons.ts`、`theme/built/`、`@stylexjs/stylex`、CI 里的 `theme:check`。图表本来就是手写 SVG，保留。
- 原样保留 `imageColor.ts`、`panelSizes.ts`、`icons.ts`、`Ja.tsx`。`herVars.ts` 保留逻辑，只改变量名（`--color-accent` → `--primary`）。`notebookTheme.ts` 删除，其中 7 条深色修补和对比度决定要搬进新主题。
- 测试：`notebookTheme.test.ts` 的对比度断言改写后保留，`herVars.test.ts` 和 `adminUsers.test.ts` 要跟着改。前端没有组件测试，也没有端到端测试。
