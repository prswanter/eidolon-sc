# 03: LINE 风格视觉原型

Type: prototype
Blocked by: 01, 02
Status: resolved

## Question

在 shadcn/ui 上，克制的 LINE 风格具体长什么样？用一个丢弃式原型搭出三屏：对话列表、对话（IM）、通话层（浅色和深色各一套，至少用两位印象色差别大的角色），主题在 tweakcn 里调好。需要用户拍板的点：中性外框的灰白层次、气泡形状与配色（她的气泡用印象色的哪一档）、头像与列表密度、字体（中文与日语台词）、圆角、阴影的用量。

## Answer

原型在丢弃式分支 `prototype/line-style`（提交 9483117、3e1835f）的 `frontend/src/app/prototype/line/`。构建时加 `NEXT_PUBLIC_PROTOTYPE=1`，打开 `/prototype/line?variant=D` 就是定稿组合；A、B、C 是供比较的三个方案。用户 2026-10-09 拍板，取各方案的部分拼成 D：

- **外框（取 A）**：列表栏白底（深色模式用 `--background`）。聊天区铺她色相的极淡壁纸 `oklch(from 原色 0.955 0.018 h)`，深色模式 `0.2 0.016 h`，页首和壁纸同色、不加分隔线。输入栏实底，上沿一条细线。
- **气泡配色（取 A）**：她的气泡是白底（深色模式 `oklch(0.3 0.01 260)`），日语原文在上、中文字幕在下，字幕用 muted 色。制作人的气泡沿用事务所深蓝墨水（`#1c2a4a` / `#a9c6f5`，上面的字用纸色），One Ink 规则保留。
- **气泡形状（取 B）**：A 的尾巴三角和圆角矩形看起来是分开的两块，所以不要尾巴。改成 22px 圆角，同一个人连着发时，靠内侧的角收成小圆角（`rounded-md`）。她的头像（36px）和名字只在一组的第一条出现，时间戳贴在一组最后一条气泡外侧的底部。
- **列表密度（取 A）**：头像 56px，名字 15px semibold，预览 13px 单行，时间 11px。顶部有「聊天」大标题和搜索框。选中行铺中性的 `bg-muted`，不用她的 paper。未读数用她的 mark 色做底。
- **字体**：日语台词用 LINE Seed JP（`next/font` 的 `LINE_Seed_JP`，400/700；构建时会提示这款字体没有 fallback 度量，无害）。中文用 Noto Sans SC。
- **圆角和阴影（按推荐）**：气泡和输入框 22px；其余控件用 shadcn 默认的 `--radius`（0.625rem）。平面上的东西都不投影，只有浮层保留 shadcn 默认阴影（延续 Flat Paper Rule）。
- **通话层（取 B，底栏取 C）**：底是她的头像放大、`blur-3xl`，上面压一层从透明黑到 `--her-call-deep` 的渐变；头像 112px 没有描边；名字 26px bold，下面是计时。台词放在底部的毛玻璃卡片里（`bg-white/12 backdrop-blur-md rounded-3xl`，最宽 34em）。控制键收进一条毛玻璃底栏：静音、切换麦克风是 56px 的圆形图标键，挂断是带「挂断」二字的红色胶囊。右上角「只看文字」是带字的胶囊。
- **她的颜色只出现在**：聊天壁纸、电话键图标、发送键（button 档）、未读数、通话层。shadcn 的 `--primary`/`--ring` 在对话子树里换成她的 accent/mark（`herStyle()`，见原型 `data.ts`）。

原型过程中的发现（留给后续 ticket）：

- **Astryx 的样式会渗进 shadcn 区域**：Astryx 主题在 `@layer reset` 里给 `h1`–`h6`、`p`、`small` 直接设了颜色和字号，shadcn 区域里的这些元素不再继承 `text-foreground`，深色模式下文字直接看不清。在 Tailwind 的 `base` 层把它们改回 `color: inherit; font: inherit` 就修好了，因为 base 层排在 reset 之后。这条交给「迁移策略」处理。
- **`shadcn init` 的副作用**：会把根布局字体换成 Geist，`globals.css` 里生成的 `--font-sans: var(--font-sans)` 引用自己。`EALLOWSCRIPTS` 可以用 `NPM_CONFIG_USERCONFIG` 指向一份不带 `allow-scripts` 的临时 npmrc 绕开。
- **浅色印象色在实色档上会走样**：真乃 `#ffbad6` 的 accent 档为了让白字达到 4.5 会压暗成灰紫。定稿的她的气泡是白色，这个问题不影响气泡，但以后如果要用 accent 填底，得记着这一点。
- 主题色值是按 tweakcn 导出格式手写的，还没在 tweakcn 里定稿，留到「DESIGN.md / PRODUCT.md 改写与说法统一」里一起做。
