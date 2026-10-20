# 04: 迁移策略

Type: grilling
Blocked by: 02
Status: resolved

## Question

怎么从 Astryx 迁到 shadcn？是在 `feat/shadcn-redesign` 上一次换完再合并进 main，还是逐页替换、每波合并进 main、两套库短期并存？如果选择并存，靠什么隔离（CSS 层级、按路由分别加载样式）？线上部署（`git push vps`）在迁移期间要保证什么？

参考：「LINE 风格视觉原型」（`03-line-style-prototype.md`）在原型分支上实测，Astryx 主题在 `@layer reset` 里给 `h1`–`h6`、`p`、`small` 设的颜色和字号会渗进 shadcn 区域；在 Tailwind 的 `base` 层把它们改回继承就能修好。并存方案要把这一点考虑进去。

## Answer

结论来自 2026-10-09 的 grilling，依据的事实：CI 只在 main 有推送时发布 `:main` 镜像，VPS 拉这个镜像，所以合进 main 就等于进入上线链路。前端约有 14 个 page/layout，48 个文件引用了 `@astryxdesign`。

- **合并节奏：一次换完。** 所有实现波次都提交在 `feat/shadcn-redesign` 上，等全部页面换完、Astryx 删掉之后，再通过一个 PR 合进 main。线上在此之前一直是旧样式，不会出现新旧混搭的线上状态。
- **分支内两套库并存。** 每波结束时应用都要能 `next build`，也要能人工逐页验收。隔离方法沿用调研和原型验证过的做法：CSS 层顺序为 `reset, theme, base, astryx-base, astryx-theme, components, utilities`，在 Tailwind 的 `base` 层把 `h1`–`h6`、`p`、`small` 的颜色和字号改回继承。最后一波删除 Astryx 时，这些共存用的层和重置一起删掉。
- **第一波是底座波，页面外观不变。** 内容包括：接入 Tailwind v4，执行 `shadcn init`（`base-nova`），写入 tweakcn 的颜色值，配置共存层顺序和 base 层重置，把印象色改为注入 `--primary`/`--ring`（包括浮层 Portal 的 container 处理），引入字体（LINE Seed JP、Noto Sans SC，同时撤掉 init 自动换上的 Geist）。验收标准是「旧页面没被污染」。另外配一个临时示例路由，用来单独检查印象色注入和浮层，最后一波删掉。
- **混搭粒度以屏为单位。** 每波结束时，任何一屏都不能同时出现新旧两种组件；共用同一个布局的屏要一起换（例如 `(conversations)` 下的对话列表和对话页）。
- **main 不冻结。** 每波开工前先把 main 合进分支，冲突在分支里解决。迁移期间 main 上不对 UI 做大改；如果必须改，就在分支上用新组件重做一遍。
- **合进 main 之前要满足：** 本地用 `next build` 加 `next start` 逐页验收（浅色、深色两种模式，用户侧、后台、法务都要看），CI 全绿，`grep @astryxdesign` 结果为零。
- **回滚：** 对合并提交执行 `git revert`，CI 重新发布 `:main` 镜像，然后在 VPS 上 `docker compose pull`。这次不改数据库，也不改后端接口，所以 revert 是安全的。**不搭预发环境。**
