# 14: 底座③：印象色注入 shadcn，加示例路由

**What to build:** 打开一段对话时，她的颜色按 shadcn 的变量注入这段对话的子树：`--primary`/`--primary-foreground` 用她的 accent/onAccent，`--ring` 用她的 mark，另外注入 `--her-*`（含新增的壁纸 `wall` 一对）。`color-scheme` 和明暗同步。浮层（Dialog、DropdownMenu、Drawer、Sheet、Popover）通过 Portal 渲染到子树外面，要传 `container` 或在浮层内容上再注入一次。旧的 `--color-accent`、`--her-note` 等变量照常注入，旧页面不受影响。

在 `@theme inline` 里注册具名 token：`--her-*` 和挂断红注册成颜色（如 `bg-her-wall`、`bg-hangup`），`DESIGN.md` frontmatter 里有名字的尺寸注册成字号和圆角 token（如 `text-header`、`text-meta`、`rounded-bubble`）。

新增一个临时示例路由（清理波删掉），在两位印象色差别大的角色（如櫻木真乃、八宮めぐる）的子树里摆出 primary 按钮、焦点环、壁纸、发送键、未读数和三种浮层，用来单独检查注入效果。属于第 1 波（底座）。

**Blocked by:** 13

**Status:** done

- [x] `imageColor.ts` 新增 `wall` 一对；`imageColor.test.ts` 的 `pairs()` 加上「`--foreground`、`--muted-foreground` 在壁纸上 ≥ 4.5」，两种模式都测
- [x] `herVars.test.ts` 新增 `--primary`、`--primary-foreground`、`--ring`、`--her-wall` 的断言，旧断言保留并照常通过
- [x] 新注册的固定色（挂断红等）写进主题对比度测试
- [x] 验收清单第 2 行：示例路由里两位角色的 primary 按钮、焦点环、壁纸、发送键、未读数都是她的颜色（浅色、深色各看一遍）
- [x] 验收清单第 3 行：子树里打开的 Dialog、DropdownMenu、Drawer 带她的颜色；深色模式下浮层比页面高一层色调，并且有边线
- [x] 截图脚本重拍后，和第 12 张拍的基准图像素零差异（范围：登录、法务、后台各页的静态部分）
- [x] `typecheck`、`test` 通过，`next build` 成功
- [x] 开工前已把 main 合进 `feat/shadcn-redesign`，冲突在分支里解决

## Comments

2026-10-09 交付（提交 bc7daf0、f7bc0fc、0a8c3f3）：
- `wall` 按 DESIGN.md（浅 L 0.955 C 0.018、深 L 0.2 C 0.016）；`herVars` 新增 `--primary`、`--primary-foreground`、`--ring`、`--her-wall`，旧变量照旧注入。`color-scheme` 靠继承（html 的 `light dark`、`.dark` 的 `dark`），herVars 不另设。
- 具名 token：她的颜色 `her-wall/mark/button/button-fg/call-deep`；固定色 `hangup`（= `--destructive`）、`producer-ink`/`on-producer-ink`、`bubble-her`（深色 her-bubble-night），都在主题对比度测试里；字号 `text-list-title/header/row-name/body/japanese-line/preview/subtitle/meta`；圆角 `rounded-bubble(-inner)`；尺寸 `list-avatar/bubble-avatar/call-dock-control/call-bar`。
- 浮层：Dialog、DropdownMenu、Drawer 的 Content 加 `container` 透传给 Portal，深色带 `--overlay-edge` 边线；`ui/button` 加 `her` 变体。base-nova 的 `destructive` 按钮是淡红底红字，改成实底挂断红留给 16。
- 示例路由 `/preview`（清理波删）：真乃、めぐる，加一栏强制深色。
- 像素零差异：最后把 119ee39 单独构建，和 HEAD 同一时刻各拍一套，44 张只差上面那一格。
- 用户验收通过验收清单第 2、3 行。
