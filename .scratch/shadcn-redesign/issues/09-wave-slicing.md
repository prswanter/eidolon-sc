# 09: 实现波次的切分

Type: grilling
Blocked by: 05, 06, 07, 08
Status: resolved

## Question

在「迁移策略」（`04-migration-strategy.md`）定下的约束下（第一波是底座波、以屏为单位替换、最后一波删除 Astryx 和共存层），剩下的屏按什么顺序、分几波来做？每波包含哪些屏和共用组件，哪些波可以并行？每张实现 ticket 的完成条件是什么？

补充（来自「测试替换与每波验收方式」，`08-testing-and-acceptance.md`）：实现 ticket 的完成条件已经统一定好，这里不用再讨论。这张 ticket 要做的是把 `spec.md` 里的人工验收清单逐行分到各波，并把底座波里「先单独提交换字体、在该提交上拍基准图」这个顺序写进底座波的 ticket，同时说明旧测试断言和 `theme:check` 在哪一波删掉。

## Answer

结论来自 2026-10-09 的 grilling。依据的事实：`PageShell` 同时被 `(conversations)/layout.tsx` 和六个外围页使用；`SettingsSection` 同时被设置页和几乎全部后台组件使用；`FailureNotice`、`AppLink` 几乎处处都用；后台各页共用 `admin/layout.tsx`（`AdminShell`）；`CallNote`、`OutfitPicker`、`MicSheet` 都挂在 `ConversationView` 下；`--her-note`/`--her-note-rule` 只有 `CallNote` 在用。

- **共用组件先在旧版旁边另建新版。** 单独设一波「共用件」：用 shadcn 添加 `ui/` 组件，并新建项目自己的共用件（页框、页首、区块卡、失败提示、链接、带标记的头像、后台的 `AdminPage` 和统计卡、新的 Sidebar 外壳）。这一波没有任何页面使用它们，只在示例路由里展示，所以仍然按底座波的标准，和基准图做像素比对，要求零差异。各屏在自己那一波改用新版，旧版在清理波删掉。这样做是为了让后面的波能并行，并行的 ticket 不会抢着建同一个组件。
- **一共分五波，每波开工前先把 main 合进分支：**

  | 波 | 内容 | 并行 ticket |
  |---|---|---|
  | 1 底座 | 第一个提交只换字体，同时加截图脚本并拍基准图，然后停下来请人确认字体效果；之后依次接入 Tailwind v4、`shadcn init`（`base-nova`）、共存层顺序、base 层重置、印象色注入 `--primary`/`--ring`（含浮层 Portal）、示例路由、主题对比度测试和 `herVars` 的 `--primary`/`--ring` 断言。这些后续提交都要和基准图像素零差异 | 1 张 |
  | 2 共用件 | 见上一条，像素零差异 | 1 张 |
  | 3 用户侧主屏 | ① 登录、同意、条款、隐私 ② 设置、记忆 ③ 对话列表加对话页：`(conversations)` 布局、Resizable 按像素调宽、通话条替换 `CallNote` | 3 张 |
  | 4 通话层与后台 | ① 通话层（立绘、`MicSheet`、`OutfitPicker`）② 后台外壳换成 Sidebar（只有这张改 `admin/layout.tsx`），加仪表盘、花费 ③ 后台用户列表、用户详情、`BanUserDialog`、`UserLimitsDialog` ④ 后台配置加价格 | 4 张 |
  | 5 清理 | 删除 `@astryxdesign/*`、共存层和 base 层重置、示例路由、旧共用件、`notebookTheme.test.ts` 和剩下的旧断言、`theme:build`/`theme:check` 两个脚本和 `src/theme/built/`；CI 前端 job 加一步 `grep -r @astryxdesign src`，结果必须为零；改写 `AGENTS.md` 和 `frontend/AGENTS.md` 里 Astryx 的说明 | 1 张 |

  后台三张 ticket 放在同一波，因为后台各页共用一个布局，按「一屏不混搭」要在同一波结束时一起换完。通话层排在对话页后面一波，因为两者都要改 `ConversationView`，并行会冲突。
- **验收清单按页面分到各波。** 清单每一行是「页面 × 浅色/深色 × 关键状态」，归到换这个页面的那一波。底座波和共用件波只验两件事：旧页面没被污染，示例路由里的印象色注入和浮层正常。清单的分配写进 `spec.md`。清理波把整张清单从头再走一遍，这也是合进 main 的条件。
- **旧断言在哪一波删。** 规则沿用「测试替换与每波验收方式」：哪个旧变量在某一波之后没人用了，就在那一波删它的断言。目前能对上的：`--her-note`/`--her-note-rule` 只有 `CallNote` 在用，第三波 ③ 用通话条替换它时，一起删掉这两个变量、`imageColor` 里的 `note`/`noteRule` 颜色对，以及 `herVars.test.ts`、`imageColor.test.ts` 里对应的断言（这些删除是「通话层的其他状态与立绘衔接」定的）。`notebookTheme.test.ts`、其余旧断言和 `theme:check` 都在清理波删。
- **实现 ticket 的完成条件**沿用「测试替换与每波验收方式」，不另定。
- **后续工作。** `spec.md` 和各波的实现 ticket 由一张单独的 task 来写，它汇总全部已定的决定，等「新的组件纪律」定下来之后再做。
