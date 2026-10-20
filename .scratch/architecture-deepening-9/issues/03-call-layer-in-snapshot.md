# 03: 快照交出通话层画哪一通、收没收起

**What to build:** 通话层照旧这样：
- 这一页还没打过电话时不出现；
- 拨号和因故结束时，收起的通话层重新展开；
- 挂断后、看完结束页点「回到对话」后，照常滑下收起，收起的过程中画的是最后一刻的样子，立绘不换也不重新载入；
- 焦点照旧归位。

新加一条：通话结束以后，通话层不能再被展开。

现在「画哪一通」靠页面的 hook 在渲染时 setState 留住最后一刻，「通话层收着」页面又自己算了一遍；LiveConversation 里也有一半同样的规则（什么时候重新展开）。改成快照交出 `layer`，规则只在 LiveConversation 里。

背景见 `../spec.md`（「通话状态与快照」里的 `layer`）。

**Blocked by:** 02（`layer.call` 要带 `dial`，立绘的 key 才不会在收起动画中途变掉）

**Status:** resolved

## 已定的设计（2026-10-11 grilling，详见 spec）

- 快照里的 `collapsed` 换成 `layer: { call: ShownCall; collapsed: boolean } | null`。`ShownCall`（拨号中、通话中或因故结束）的定义从通话层组件搬进 LiveConversation 的 module。
- 拨号前为 null。通话状态变成拨号、接通或因故结束时，`layer.call` 就是这个状态。回到 idle 时（用户挂断，或看完结束页），`layer.call` 留着最后一刻，`collapsed` 为 true。
- 原有的规则搬到 `layer.collapsed` 上照旧：拨号和因故结束时重新展开；`collapse()` 只在通话进行中有效。新加：`expand()` 也只在通话进行中有效。
- 开新对话时不清 `layer`。
- 删掉 `useShownCall` 和页面上自己算的「通话层收着」；焦点归位的输入（通话层开着没有、通话条显示没有）改从 `layer` 和通话状态算。

## 验收

- [ ] `liveConversation.test.ts`：
  - 拨号前 `layer` 为 null；
  - 拨号时出现并展开；
  - 用户挂断后留着最后一刻，并且收起；
  - 看完结束页后留着结束页，并且收起；
  - 收起后，拨号、因故结束都会让它重新展开；
  - 通话结束后 `expand()` 不起作用；
  - 开新对话时不清。
- [ ] 已有的用例里，凡是断言 `collapsed` 的，改成断言 `layer.collapsed`。
- [ ] `useShownCall` 删掉，页面不再自己算「通话层收着」。
- [ ] `vitest`、`tsc`、`sh scripts/check-discipline.sh` 通过。
- [ ] 人工验收清单写进 Comments：在构建版前端里，手机宽度和电脑宽度各看一遍：
  - 进页面时没有通话层；
  - 拨号时通话层滑上来；
  - 通话中收起再展开；
  - 挂断后通话层滑下，画面停在挂断那一刻，立绘不换；
  - 结束页点「回到对话」后滑下；
  - 收起后因故结束，通话层重新展开；
  - 用键盘收起时，焦点落在通话条上；结束后焦点落在电话键上。

## Comments

### 实现说明（2026-10-11）

- `Snapshot` 里的 `collapsed: boolean` 换成 `layer: Layer | null`，`Layer = { call: ShownCall; collapsed: boolean }`。`ShownCall` 的定义从 `CallLayer.tsx` 搬进 `liveConversation.ts`（`Extract<CallState, { phase: "dialing" | "connected" | "ended" }>`）并导出；通话层改从 `@/lib/liveConversation` 引这个类型，组件里不再有它自己的定义。
- 规则都收进 `withCallScreenRules` 里的新函数 `nextLayer(before, next)`：通话状态变成拨号/接通/因故结束时 `layer.call` 就是它（拨号、因故结束展开，接通沿用用户收起没收起）；回到 idle（用户挂断，或看完结束页）时 `layer.call` 留着最后一刻、`collapsed` 为 true；`call` 没变的更新（收起、展开、hearing 之类）原样保留 `layer`。`layer` 一直在 `State` 里，开新对话不清。
- `collapse()` 从 `state.collapsed` 改到 `layer.collapsed`，只在通话进行中有效；`expand()` 新加同样的「只在通话进行中」限制，通话结束后的通话层不能再被展开。
- `ConversationView.tsx` 删掉 `useShownCall` 和页面自己算的「通话层收着」（原来的 `isLayerCollapsed = collapsed || call.phase === "idle"`）。焦点归位的输入改从快照算：`isCovered = layer !== null && !layer.collapsed`，通话条 `barShown = isLive(call) && layer.collapsed`；`<CallLayer>` 只在 `layer` 非空时渲染，`call={layer.call}`、`isCollapsed={layer.collapsed}`。看得见的行为不变，唯一例外是票里写明的「结束后不能再展开」。
- 测试：`liveConversation.test.ts` 的「the call layer」一组重写，覆盖票里 `layer` 的全部情形；原有用例里断言 `collapsed` 的改断言 `layer.collapsed`（拨号前那条改成断言 `layer` 为 null）。

### 代码审查的修正（2026-10-11）

- 「拨号前为 null」那条删掉：它是「只在通话进行中收起、展开」开头一段的严格前缀（CODING_STANDARDS「Prefix of another case」）。
- 「挂断后不能再展开」并进「挂断后留着最后一刻并收起」，「看完结束页后不能再展开」删掉：夹具一样、只断言了结果的另一半（「Same setup, assertions split」），两条的 `expand()` 走的又是同一个分支（「Parameters that don't branch」）。
- 「只在通话进行中收起、展开」改成拨号中收起，再断言接通后仍然收着，补上「接通沿用用户收没收起」的用例。

### 人工验收清单（构建版前端：在 `frontend/` 下 `npm run build` 然后 `npm run start`）

手机宽度和电脑宽度各看一遍：

1. 刚进对话页时没有通话层；页首的电话键可以拨号。
2. 点电话键拨打：通话层从底部滑上来，显示「正在呼叫」。
3. 通话中（接通后）点收起键：通话层滑下，页首下面出现通话条；点电话键（或通话条）再展开，回到通话层。
4. 通话中点挂断：通话层滑下收起，画面停在挂断那一刻的样子，立绘不换、不重新载入。
5. 让通话因故结束（例如停掉后端，或等到时长上限）：结束页展开显示；点「回到对话」后通话层滑下收起。
6. 先收起通话层，再让通话因故结束：通话层重新展开，显示结束页。
7. 用键盘收起通话层（Esc 或点收起键）：焦点落在通话条上；通话结束后焦点落在页首的电话键上。
