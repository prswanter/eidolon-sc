# 前端组件库从 Astryx 换成 shadcn/ui + Tailwind v4

前端原本用 Astryx（`@astryxdesign/core`）配一套自定义的「手帐」主题，但做出来的效果不满意：组件本身的质感不好，复印纸、横线的隐喻也显得过重。现在改用 shadcn/ui + Tailwind CSS v4，视觉改为克制的 LINE 风格（中性外框，属于角色的地方用她的印象色），主题在 tweakcn 里调好后导出 CSS 变量。全部页面都换，最后移除 Astryx 依赖。信息架构和交互流程不变。

## Considered Options

- **留在 Astryx，只重写主题**：改动最小，但 Astryx 的组件形态改不了多少，而组件质感正是不满意的原因之一。
- **shadcn/ui + Tailwind v4**：组件源码直接放进仓库，样式可以随意改；生态大，主题可以在 tweakcn 里可视化地调。代价是要引入 Tailwind，并改写约 48 个文件。

## Consequences

- `AGENTS.md` 里的 Astryx 规则（不写裸 `<div>`、一律走 Astryx token）要换成适用于 shadcn + Tailwind 的新规则。
- 印象色继续按浅色、深色成对推出并经过对比度测试，只是改为以 CSS 变量的形式注入 shadcn 主题。
