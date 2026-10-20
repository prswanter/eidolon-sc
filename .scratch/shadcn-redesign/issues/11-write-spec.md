# 11: 写 spec.md 并切出实现 ticket

Type: task
Blocked by: 09, 10
Status: resolved

## Question

把地图「Decisions so far」里的全部决定汇总写成 `.scratch/shadcn-redesign/spec.md`，内容包括：视觉规范以 `DESIGN.md` 为准，只引用、不重复；人工验收清单（「页面 × 浅色/深色 × 关键状态」），每行标明所属的波；组件纪律；各波的范围和完成条件。然后按「实现波次的切分」（`09-wave-slicing.md`）的五波，切成可以直接交给 agent 的实现 ticket，写清每张的文件范围、依赖关系和分到的验收清单行。

这张 ticket 完成后，地图就到达终点。

补充（来自「新的组件纪律」，`10-component-discipline.md`）：底座波要多加两项，一是在 `frontend/AGENTS.md` 写纪律一节，二是在 CI 加 grep 脚本。清理波改 AGENTS.md 时只删 Astryx 部分，`grep @astryxdesign` 并进同一个脚本。

## Answer

2026-10-09 完成，两样产出都到位：

- **`spec.md`**（`Status: ready-for-agent`）：视觉以 `DESIGN.md` 为准，只引用；汇总 01–10 的全部决定并注明出处；「组件纪律」一节；五波的范围和完成条件；人工验收清单 35 行，每行标了所属的波。
- **实现 ticket `12`–`24`**（都是 `ready-for-agent`），每张写清范围、`Blocked by` 和分到的清单行：
  - 底座：12 字体与基准图 → 13 Tailwind + shadcn 并存 → 14 印象色注入与示例路由 ∥ 15 纪律与 CI grep
  - 共用件：16
  - 用户侧主屏：17 登录、同意、法务 ∥ 18 设置、记忆 ∥ 19 对话列表、对话页、通话条
  - 通话层与后台：20 通话层（在 19 之后）∥ 21 后台外壳、看板、花费 ∥ 22 后台用户 ∥ 23 后台配置、单价；21–23 必须一起合入
  - 清理：24

和 09 号的唯一出入：底座波按「停下来请人确认字体」这个节点和会话大小，从 1 张拆成了 4 张。补充里的两项（`frontend/AGENTS.md` 纪律一节、CI grep 脚本）落在 15 号；清理波只删 Astryx 部分，`@astryxdesign` 并进同一个 grep 脚本，落在 24 号。

## Comments

- 2026-10-09：`spec.md` 已写好（`Status: ready-for-agent`），包含验收清单 35 行及各行所属的波。实现 ticket 还没切，这张 ticket 保持 open。
