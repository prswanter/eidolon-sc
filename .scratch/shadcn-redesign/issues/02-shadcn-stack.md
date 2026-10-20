# 02: shadcn 底层选型与 Tailwind v4 接入

Type: research
Blocked by: None
Status: resolved

## Question

截至现在，shadcn/ui 的底层应该选 Radix 还是 Base UI（两者在 shadcn CLI 中的支持程度、可访问性、维护状况、与 React 19 的兼容性）？Tailwind v4 在 Next 16（App Router）下的标准接入方式是什么？tweakcn 导出的主题变量格式是什么，如何与 `.dark` 深色模式以及运行时按角色注入的变量（印象色）配合？迁移期间 Tailwind 的 preflight 和 `@astryxdesign/core/reset.css`、`astryx.css` 能不能共存，会在哪里冲突？

## Answer

调研全文在丢弃式分支 `research/shadcn-stack` 的 `.scratch/shadcn-redesign/research/02-shadcn-stack.md`（提交 a16be41），每条结论都标了出处。要点：

- **底层选 Base UI**：2026-07 起它是 shadcn 的默认底层，官方对新项目推荐它。在可访问性、React 19 支持、维护活跃度上它和 Radix 打平，而我们没有存量 Radix 代码。代价是社区里 `asChild` 的写法要改成 `render`。
- **Tailwind v4 接入**：装 `@tailwindcss/postcss`，加 `postcss.config.mjs`，全局 CSS 里 `@import "tailwindcss"`。`shadcn init -b base -p nova` 会生成 `components.json`（`base-nova`，初始化后不能改）、`lib/utils.ts` 和 `globals.css`（`@theme inline` 加 `:root`/`.dark` 的 oklch 令牌），还会把根布局字体换成 Geist，要改回来。
- **tweakcn**：默认导出 oklch。只取它 `:root`/`.dark` 的颜色值，`@theme inline` 用 CLI 生成的那份。
- **印象色**：可以盖在子树上，但要写进 `--primary`/`--ring`，不是 shadcn 的 `--accent`（那是悬停底色）。坑：`color-scheme` 要和 `.dark` 同步；Dialog 等浮层渲染到 body，拿不到子树变量，要传 Portal `container` 或在浮层上重设一次。
- **和 Astryx 共存**：有真实的撞名冲突（`--color-accent`、`--color-border`）。可行方案是层顺序 `reset, theme, base, astryx-base, astryx-theme, components, utilities`，要在 feat 分支上用 `next build` 验证。双根布局隔离（跨组跳转会整页刷新）和 `tw` 前缀都不推荐，去掉 preflight 是备选。
- **待处理**：本机 npm 全局配置了 `allow-scripts`，会让 shadcn CLI 内部的安装报 `EALLOWSCRIPTS`。
