# 06: 后台视觉原型

Type: prototype
Blocked by: 03
Status: resolved

## Question

在「LINE 风格视觉原型」定下的风格下（中性白外框、Noto Sans SC、平面无阴影、控件用 shadcn 默认圆角），后台（`/admin`）长什么样？用丢弃式原型搭出看板（数字卡两组、手写 SVG 的 `TrendChart`、按角色和通话时长的比例条）、用户列表与用户详情、配置页表单，浅色和深色各一套。需要用户拍板的点：侧栏和页框（限宽内容列是否保留）、数字卡和图表的样子、表格密度与窄屏时换成列表行的做法、表单的分组方式。同时要回答两个实现问题：表格要不要引入 TanStack Table（排序、行展开），对话列表的拖拽调宽改用 shadcn Resizable（按百分比）还是自写按像素拖拽。

收尾时补上 `DESIGN.md` 里标着「待『后台视觉原型』定稿后补」的几节（后台的字体层级、按钮、布局，以及对话列表能否拖拽调宽）；后台图表的颜色也在这里定，因为 One Ink Rule 已经改成只管制作人气泡。

## Answer

原型在丢弃式分支 `prototype/admin-style`（提交 7a19868）的 `frontend/src/app/prototype/admin/`。构建时加 `NEXT_PUBLIC_PROTOTYPE=1`，打开 `/prototype/admin?variant=A`；浮条可以切页面（看板 / 用户 / 用户详情 / 配置）、明暗、图表色。B（顶栏、不用卡片、读数带、密表、两栏常驻表单）和 C（列表栏主从、设置行、Sheet 表单）留作比较。用户 2026-10-09 拍板，**整体取 A**：

- **侧栏和页框**：用 shadcn `Sidebar`，窄屏收进 Sheet；内容列限宽、居中：看板和用户最宽 1200px，配置和详情最宽 960px。
- **数字卡和图表**：数字和图表都装在 Card 里（数字卡分「此刻」和「{范围}内」两组）。图表和比例条用 `--foreground`，也就是浅色黑、深色白，不用墨水色，也不用 `--chart-*`。
- **表格**：shadcn `Table`，默认密度，装在 Card 里；窄屏换成 `divide-y` 的行，断点沿用现有的 1280 / 1024px。
- **表单**：配置每项一张卡，点「修改」在卡里展开 `FieldGroup`，全页同时只开一张。

两个实现问题（按原型时的结论定下）：

- **不引入 TanStack Table。** 排序只有三档，全在后端；行展开只有单价表一处（用户列表其实没有行展开）。shadcn `Table` 加普通 state 就够了。
- **对话列表的拖拽调宽改用 shadcn `Resizable`，仍按像素。** react-resizable-panels v4 支持像素的 min/max、`groupResizeBehavior="preserve-pixel-size"`，`onResize` 也给出 `inPixels`。原来 `useSavedSize` 的「默认 320、240–480px、记进 localStorage、挂载后恢复」都能照搬，不用自己写拖拽。原型 C 里已经验证过。

`DESIGN.md` 已经补上后台的字体层级、布局、按钮、状态和图表这几节，以及对话列表的调宽。顺带改了 Flat Rule：后台的 shadcn `Card` 保留默认的 `ring-1` 细线，把它当分隔线看；用户侧仍然不加描边环。

原型过程中的发现（留给后续 ticket）：

- **`cn` 合并不掉 `group-data-[…]` 前缀的变体类。** 仓库的 `cn` 来自 `cn` 包，是 clsx 加 tailwind-merge 的替代品。比如小号 Card 的 `CardTitle` 带 `group-data-[size=sm]/card:text-sm`，在调用处传 `text-2xl` 盖不住，要加 `!`，或者按 Own-the-Source 改组件。这条交给「新的组件纪律」。
- **`shadcn add` 生成的文件可能写成 `import { cn } from "cn"`。** 在这个仓库里能用，因为 `cn` 真有这个包，但和 `components.json` 的 `@/lib/utils` 别名不一致，组件纪律里要统一成一种写法。
- **`next start` 会提示 `output: standalone` 不适用**，本地预览照样能跑。
