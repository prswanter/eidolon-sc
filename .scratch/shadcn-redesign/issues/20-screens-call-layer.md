# 20: 通话层、切换麦克风、换衣装换新

**What to build:** 通话层按 `DESIGN.md` 的 Call layer 一节（方案 A）重做：

- **底和渐变**：强制深色；底是她的头像放大并 `blur-3xl`，有背景图时改用背景图清晰铺满，上面压一层到 `call.deep` 的渐变。
- **中部和台词卡**：112px 头像、名字、状态行；台词放在底部的毛玻璃卡里。
- **底栏**：一条毛玻璃胶囊，静音、切换麦克风是 56px 圆形键，挂断是红色胶囊。
- **立绘**：有立绘时立绘做底，名字缩进头部，底部 50% 压暗；手机上占下方 80%、取景到膝、从下方升起，电脑上取景到腰、原地淡入；加载失败时布局不跳。
- **各状态**：呼叫中有三点闪烁、按钮置灰、无立绘时有波纹；「只看文字」开启后胶囊变白底、上一句淡淡地留在上面；结束页是毛玻璃结束卡。
- **动效**：从对话栏底部滑上来、滑下去，410ms + `cubic-bezier(0.24, 1, 0.4, 1)`。

切换麦克风的面板（`MicSheet`）和换衣装（`OutfitPicker`，宽屏对话框、窄屏底部面板）一起换新。它们是浮层，需要她的颜色时按 Scoped Colour Rule 再注入一次。「只看文字」在呼叫中照常可以切换，台词卡在接通前不出现。焦点与 `inert` 的行为不变。

如果 `call.top`/`call.glow`/`call.rule`、`paper`/`paperMuted` 在这一张之后已经没有人用，就在这一张删掉它们和对应的断言。属于第 4 波；它和第 19 张都要改 `ConversationView`，所以排在 19 之后。

**Blocked by:** 19

**Status:** done

- [x] `CallLayer`、`MicSheet`、`OutfitPicker` 和立绘外围的组件里没有 `@astryxdesign` 的引用；`lineState.ts` 已删（Line-State Rule 已经取消）
- [x] 验收清单第 20 行：呼叫中的样子
- [x] 验收清单第 21 行：通话中的样子，静音按下后的样子，「只看文字」开启后的样子
- [x] 验收清单第 22 行：有立绘时手机、电脑两种取景；立绘加载失败时布局不跳、不提示
- [x] 验收清单第 23 行：结束页的各种原因、是否计入限额的说明、重拨或「去设置自带密钥」
- [x] 验收清单第 24 行：展开、收起的滑动，Esc 收起，减少动态效果时无过渡，焦点与 `inert`
- [x] 验收清单第 25–26 行：切换麦克风的面板；换衣装在电脑、手机上的样子
- [x] 通话层在系统浅色、深色下各看一遍（它本身强制深色）；切换麦克风、换衣装在浅色、深色下各看一遍；都在手机、电脑两种宽度下看，至少一位有立绘的角色
- [x] CI 的 grep 检查脚本通过
- [x] `typecheck`、`test` 通过，`next build` 成功
- [x] 开工前已把 main 合进 `feat/shadcn-redesign`，冲突在分支里解决

## Comments

2026-10-10 交付（提交 9c1cbe9、6c1fc4a，合并 5baa7bb；审查修复 887a1f1）：
- `CallLayer`、`MicSheet`、`OutfitPicker` 重写，`stand/Stand.tsx` 的过渡改成 Tailwind 类；删 `lineState.ts`。通话层用 `.dark` 强制深色，展开收起用 `starting:` 和 `translate`/`visibility` 过渡（410ms、`--ease-call`），焦点、`inert`、Esc 逻辑没动。切换麦克风是底部 Drawer（电脑上居中、最宽 `max-w-md`）；换衣装宽屏 Dialog、窄屏 Drawer，内容上再注入一次 `herVars`。
- 删掉 `paper`/`paperMuted`、`call.top`/`call.glow`/`call.rule` 颜色对、对应 `--her-*` 变量和断言（后台没人用），`call` 只剩 `deep`。新增 `--color-her-call-shade`（call.deep 混黑）、`text-call-name`、`text-call-line`、`--ease-call`，`cn` 同步认得。
- `ui/` 改动：`toggle.tsx` 加 `segment` 变体（正在预览的卡铺 `bg-muted`，按下的一项不能也是 `bg-muted`）；审查后 `button.tsx` 加通话层用的 `call-glass`/`call-solid`/`call-round`/`hangup` 变体和 `call`/`call-sm`/`call-dock`/`icon-call-dock` 尺寸。`MarkedAvatar` 加 112px 的 `call` 尺寸。
- 和 DESIGN.md 的偏差（待人定）：新增「80% 白字在 call.deep 上 ≥ 4.5」的契约；「通话已结束 · mm:ss」的时长在组件里记接通时刻自算（没接通的只写「通话已结束」）；「只看文字」由开关改成 `aria-pressed` 按钮；去掉头部「语音通话」标题；底栏顺序改成静音、切换麦克风、挂断（原来挂断在中间）；有立绘时电脑上立绘顶边用 `top-16` 近似头部以下。
- 已知：宽屏换衣装对话框打开时第一张缩略图带焦点环（Base UI 默认初始焦点）；`MicSheet` 的选项行仍在调用处写样式（是列表行，不是按钮）；通话层的白字、毛玻璃直接用 `white/xx`（DESIGN.md 原文如此，和第三波的通话条一致）。真实通话没有在 agent 环境里跑过。
- 2026-10-10 用户人工验收通过。
