# 架构加深（第九轮）：通话的转换由 LiveConversation 交出

Status: ready-for-agent

术语以 `GLOSSARY.md` 为准，本轮不改 GLOSSARY。设计词汇（module、interface、seam、adapter、depth、locality）取自 `codebase-design` skill。这是 2026-10-11 架构审查的候选 1，设计经 grilling 定下。只改前端。

## Problem Statement

对话页的状态都在 LiveConversation 里，它交出的快照只说「现在」：通话处在哪个阶段、她当前这句是什么。要知道「刚才」发生了什么，就得在 React 里自己推，现在有五个 hook 和一段 effect 各推各的：

- **提示音**：`useCallTones` 用 ref 记住上一个阶段，跟这次比，决定响铃、停铃、播接通音或挂断音。
- **结束时打了多久**：`useEndedSeconds` 在渲染时记下接通时刻，到结束的那次 effect 里用 `Date.now()` 算出时长。
- **上一句**：只看文字时，台词卡上留着她的上一句。`usePreviousLine` 判断「同一句」的办法是新原文以旧原文开头。用户在她组织回复时补充一句，被放下的那句也会被当成上一句留下。GLOSSARY 却说放下的回复不留任何痕迹。
- **第几次拨号**：`useDialCount` 数进入拨号的次数，拿来当立绘的 key，让每次拨号重新载入立绘。
- **通话层画哪一通**：`useShownCall` 在渲染时 setState，挂断后留着最后一刻的通话，收起动画才有东西可画。页面另外还算了一遍「通话层收着」。
- **对话列表**：对话页每次转换都在 effect 里把通话状态抄一份给列表；列表那一行的计时和离开前的确认，读的都是这份副本。

这些规则都没有测试：vitest 没配 jsdom，`.tsx` 和 hook 一个都测不到。可是同一类规则，比如什么时候重新展开通话层、通话结束后哪些消息不再起作用，已经在 LiveConversation 里，有几十个用例经假的 port 测着。规则分在两处：改一处的时候，看不到另一处。

## Solution

这些转换都由 LiveConversation 算好交出，组件只读快照：

- 铃声、接通音、挂断音变成 LiveConversation 的一个 port：在拨号、接通、通话结束和离开页面这几处，由它直接告诉页面响什么，跟它告诉页面她的声音该怎么放是一个做法。
- 通话状态带上这是第几次拨号；通话结束时直接带上打了多久。
- 快照交出这通电话里她的上一句，从记录里取。
- 快照交出通话层：画哪一通、收没收起。
- 对话页把 LiveConversation 交给对话列表一次，列表自己订阅，不再每次转换都抄一份。

用户看到、听到的行为不变，只有一处例外：补充时被放下的那句，不再作为上一句留在台词卡上。

## User Stories

1. 作为用户，我想点下拨打的那一刻就听到铃声，一直响到接通或通话结束。
2. 作为用户，我想接通时铃声立刻停下，接通音播一次。
3. 作为用户，我想通话结束时挂断音播一次，不论是我挂断、她挂断、断了线、时间到了，还是根本没接通。
4. 作为用户，我想通话中离开对话页时铃声停下，挂断音不播。
5. 作为用户，我想只看文字和收起通话层都不影响铃声、接通音、挂断音。
6. 作为用户，我想因故结束的通话在结束页上显示「通话已结束 · mm:ss」，时长从接通算到结束。
7. 作为用户，我想没接通就结束的通话在结束页上只显示「通话已结束」，不带时长。
8. 作为用户，我想只看文字时，台词卡上她当前这句的上面以浅色留着她在这通电话里的上一句。
9. 作为用户，我想一句话在说的过程中变长时，它还是当前这句，不会被挤成上一句。
10. 作为用户，我想补充时被放下的那次回复不再作为上一句出现，和它不留任何痕迹的规则一致。
11. 作为用户，我想重新拨号后台词卡上没有上一通电话的话。
12. 作为用户，我想每次拨号立绘都重新载入，上一通没载出来，这一通可以再试一次。
13. 作为用户，我想通话层收起动画的过程中，立绘不会换掉或重新载入。
14. 作为用户，我想挂断后通话层照常滑下收起，收起的过程中画的是挂断那一刻的样子。
15. 作为用户，我想看完结束页点「回到对话」后，通话层照常滑下收起。
16. 作为用户，我想这一页还没打过电话时，通话层不出现。
17. 作为用户，我想拨号和因故结束时，收起的通话层重新展开，和现在一样。
18. 作为用户，我想通话结束以后，通话层不能再被展开。
19. 作为用户，我想通话中点别的角色、进设置或记忆、回列表时，先被问一句会不会挂断，和现在一样。
20. 作为用户，我想不在通话中时离开对话页不被拦下。
21. 作为用户，我想对话列表里通话中那位角色的一行照旧显示「正在呼叫」或计时。
22. 作为用户，我想通话中那位角色在列表里照旧不会因为隐藏而消失。
23. 作为开发者，我想通话的转换规则都在 LiveConversation 里，经它的 interface 用假的 port 测。
24. 作为开发者，我想提示音的规则可以用假的 port 记下调用来测，不用真的 Audio。
25. 作为开发者，我想通话层和列表读的是同一份快照，没有哪一份是用 effect 抄的。
26. 作为开发者，我想组件里不再有在渲染时 setState、只为记住上一刻的 hook。

## Implementation Decisions

### 通话状态与快照

通话状态改成下面的形状（grilling 时定的类型形状）：

```ts
export type CallState =
  | { phase: "idle" }
  | { phase: "dialing"; dial: number }
  | { phase: "connected"; dial: number; since: number; maxSeconds: number | null }
  | { phase: "ended"; dial: number; end: CallEnd; seconds: number | null };

/** 通话层上画的通话：拨号中、通话中，或因故结束。 */
export type ShownCall = Extract<CallState, { phase: "dialing" | "connected" | "ended" }>;

Snapshot:
  - collapsed: boolean
  + layer: { call: ShownCall; collapsed: boolean } | null
  + previousLine: Segment | null
```

- **`dial`**：这一页第几次拨号，从 1 开始，每次 `startCall` 加一。拨号、接通、因故结束都带着同一个值。页面拿它当立绘的 key。
- **`seconds`**：在判定通话结束的那一刻，用已经注入的 `ports.now` 算出接通以来的整秒数（向下取整，不小于 0）。没接通过的为 null。用户自己挂断时直接回到 idle，没有结束页，用不到时长。
- **`previousLine`**：取的范围和 `line` 一样，是这通电话的记录，取倒数第二句有原文的话；没有就是 null。不论开没开只看文字都交出，显不显示由页面决定。补充时被放下的回复已经不在记录里，所以不会被取到。
- **`layer`**：这一页还没拨过号时为 null。通话状态变成拨号、接通或因故结束时，`layer.call` 就是这个状态。回到 idle 时，不论是用户挂断还是看完结束页，`layer.call` 都留着最后一刻，`collapsed` 为 true。原有的规则搬到 `layer.collapsed` 上照旧：拨号和因故结束时重新展开；`collapse()` 只在通话进行中有效。新加一条：`expand()` 也只在通话进行中有效，通话结束后的通话层不能再被展开。开新对话时不清 `layer`。
- `ShownCall` 的定义从通话层组件搬进 LiveConversation 的 module。

### 提示音：一个新的 port

`Ports` 加一项 `tones`，和 `voice` 并列。它是电话本身的声音（GLOSSARY「铃声」「接通音」「挂断音」），不是她的声音：

```ts
tones: {
  ring: () => void;    // 开始循环响铃
  connect: () => void; // 停铃，播一次接通音
  hangUp: () => void;  // 停铃，播一次挂断音
  silence: () => void; // 只停铃
}
```

- `startCall` 在用户的这次点击里，在任何 await 之前、紧挨着告诉她的声音拨号的那一处调 `ring()`。
- 接通时调 `connect()`。
- 通话结束时调 `hangUp()`，用的是挂断、断线、后端挂断、没能接通共同经过的同一个出口。
- `dispose()` 调 `silence()`，不播挂断音（GLOSSARY「离开对话页挂断的通话来不及播放」）。
- 看完结束页回到 idle、开新对话，都不发声。
- 只看文字、收起和展开通话层，都不碰 `tones`。
- 原来的纯函数 `callTones` 和它的测试删掉，规则由上面这几处调用承担。`useCallTones` 只剩一个 adapter：建好铃声、接通音、挂断音的 Audio 元素，实现这个 port，播放被拒时照旧放弃。页面像交出她的声音那样把它交给 LiveConversation。

### 对话列表订阅同一份快照

- 对话页建好 LiveConversation 后，把它交给对话列表的外壳（Directory）一次，离开时收回。这一步和建它、dispose 它放在同一个 effect 里。
- LiveConversation 对外说明它是哪位角色的对话，列表要用它标出通话中的那一行。
- Directory 自己订阅交来的那个 LiveConversation：列表那一行的「正在呼叫」和计时，以及隐藏时保留通话中的那位角色，都从这份快照算出来。
- `leave()` 在用户点击的那一刻读快照，判断通话是否在进行。
- 删掉 Directory 上的 `setCall`，以及对话页里每次转换都抄一份的那段 effect。
- 「`leave()` 读到旧值」实际几乎碰不到：用户点击引起的更新，React 会在下一次输入之前跑完 effect。所以这一项是去掉一份重复的状态，不算修 bug。

### 组件这一侧

- 删掉 `useDialCount`、`useEndedSeconds`、`usePreviousLine`、`useShownCall`，以及页面上自己算的「通话层收着」。通话层组件直接读 `layer`、`dial`、`seconds` 和 `previousLine`。
- 原来的 `collapsed` 由 `layer.collapsed` 代替，焦点归位的输入（通话层开着没有、通话条显示没有）改从 `layer` 和通话状态算。

## Testing Decisions

- **好的测试**只经 LiveConversation 的 interface 断言看得见的结果：快照里有什么，假的 port 收到了哪些调用、按什么顺序。不检查内部字段。先写会失败的测试（`/tdd`），再改实现。
- **seam 只有一个，就是已有的 LiveConversation，经假的 `Ports` 测。** 仿照 `liveConversation.test.ts` 里已有的假通话、假的声音和停住的时钟。假的 `tones` 记下调用，和现在测 `voice` 的写法一样。
  - 提示音：
    - 拨号时同步响铃；
    - 接通时调 `connect`；
    - 用户在拨号中挂断、通话中挂断、断线、后端挂断、没能接通，各调一次 `hangUp`；
    - 离开页面只调 `silence`；
    - 看完结束页、只看文字、收起或展开通话层，都不调用；
    - 已经过时的那通电话后来再发来的消息，不引起任何提示音。
  - `dial`：第一次拨号是 1；重拨加一；接通和结束沿用同一个值。
  - `seconds`：用停住的时钟，接通后过 83 秒断线，结束状态带 83；没接通就失败时为 null。
  - `previousLine`：
    - 她换了一句，原来那句成为上一句；
    - 同一句变长，上一句不变；
    - 补充时被放下的回复，不会成为上一句；
    - 重拨后从 null 开始；
    - 上一通电话的话不算。
  - `layer`：
    - 拨号前为 null；
    - 拨号时出现并展开；
    - 用户挂断后留着最后一刻，并且收起；
    - 看完结束页后留着结束页，并且收起；
    - 收起后，拨号、因故结束都会让它重新展开；
    - 通话结束后 `expand()` 不起作用；
    - 开新对话时不清。
  - 已有的用例里，凡是断言 `collapsed` 的，改成断言 `layer.collapsed`。
- **组件、adapter 和 Directory 不写自动测试**：vitest 不配 jsdom，这一轮也不配。它们只剩读快照、建 Audio 元素、订阅这些薄的部分，由每张票的人工验收清单在构建版前端里核对（`next build` 加 `next start`）。
- 删掉 `callTones.test.ts`。
- 前端 `vitest`、`tsc`、`sh scripts/check-discipline.sh` 通过。

## Out of Scope

- 焦点归位（`useFocusBack`、`callFocus`）：它管的是 DOM 焦点，`focusBack` 已经是测过的纯函数。审查里「callFocus 可并回」那一条撤掉。
- 通话计时（`useCallTime`）每秒走一下的时钟：它是界面上的事，不算转换。
- 给 vitest 配 jsdom、测组件和 hook。
- 由 Directory 来建 LiveConversation。它跨所有角色，换角色时生命周期很别扭。
- 后端，以及通话里发生的事本身的规则（补充、打断、立绘指令）。

## Further Notes

- 接着第一轮（02「LiveConversation 管整页」）、第四轮（过期的通话消息只过一道闸）的方向往下走，不冲突。
- 分支 `architecture-deepening-9`，第八轮（PR #68）合进 main 之后，从 main 的 7b94d87 开出。第八轮没有把 userId 从对话页的 port 里拿掉，`startCall`、`sendTurn` 的 port 照旧带着它；本轮不碰这一处。
- 计划切成四张票，分两波，每次会话只做一波：
  - 第一波：01（提示音改成 port）、02（`dial`、`seconds`、`previousLine`）、04（对话列表订阅 LiveConversation），三张并行。04 只改对话页交出对象的那一处和 Directory，不碰 02、03 改的地方。
  - 第二波：03（快照交出 `layer`），依赖 02 的 `dial`。
- 人工验收要核对：
  - 拨号响铃，接通音，挂断音；
  - 离开页面时铃声停下、不播挂断音；
  - 结束页上的时长；
  - 只看文字时的上一句；
  - 重拨时立绘重新载入；
  - 挂断后的收起动画；
  - 通话中换角色时弹出确认；
  - 列表里那一行在计时。
