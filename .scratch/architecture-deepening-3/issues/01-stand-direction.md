# 01: 立绘指令从 LiveConversation 里拆成纯 reducer

**What to build:** 新建 `frontend/src/lib/standDirection.ts`，写一个纯 reducer，负责通话中立绘指令的全部规则。`LiveConversation`（`frontend/src/lib/liveConversation.ts`）不再自己算立绘，改为：把通话事件交给这个 reducer，在 `State` 里保存它的状态，再把它导出的立绘指令放进快照的 `stand`。背景见 `../spec.md`。

**Blocked by:** None (can start immediately)

**Status:** resolved

## 已定的设计（2026-10-01 grilling）

- **行为不变是硬约束**：这是一次纯重构，立绘在用户眼里的表现一点不变。规则以 `.scratch/spine-stand/spec.md`「立绘指令」一节和现有测试为准。实现中发现不合理的规则，记在 Comments 里、另开 ticket，这张不改。
- **形状：纯 reducer**，写法照 `lib/conversationLog.ts`：`(状态, 事件) → 状态`，另有一个函数从状态导出 `StandDirection`。不碰时钟、不带可变字段、不导入 `LiveConversation`。名字由实现者决定。
  - 导出的立绘指令没有变化时，必须仍是**同一个对象**。现在 `withStandRules` 保证了这一点，`Stand.tsx` 的 effect 依赖它。
- **搬进 reducer 状态的**：
  - `State` 里只给立绘用的字段：`voicing`、`userSpeaking`、`interruptedByTyping`、`shownReply`、`saying`、`stand`。`shownReply` 名字像是给字幕用的，其实只有「只看文字时从哪段开始说」一处在用。
  - 实例上的可变字段：`nods`、`judged`、`shown`。
  - `withStandRules`、`follows`、`key`、`onSpeaking`、`startSaying`、`onEmotion`、`showEmotion` 的逻辑，以及 `QUIET` 常量。
  - **打字打断的判断**：`submit()` 现在写的是 `if (this.state.voicing) this.update({ interruptedByTyping: true })`。改为 `LiveConversation` 只报「用户在通话中打了字」，她当时是否在出声由 reducer 自己判断。
- **事件**：
  - 直接接收 wire 上的 `CallEvent`（`@/lib/api`）。用得上的是四种 `Speaking`、`segment-playing`、`emotion`、`user`、`delta`，其余（`done`、`error`、`ended` 等）一律忽略。这样 `LiveConversation` 可以把通话事件原样交过去，不用自己分拣。
  - 另外三个 reducer 自己的事件：用户在通话中打了字；只看文字切换了（带新的值）；挂断或掉线，回到初始。
- **只看文字**：
  - 偏好仍由 `LiveConversation` 持有（快照的 `textOnly`、`preferences.save`、`call.setTextOnly` 都不变），切换时报给 reducer。
  - reducer 的初始状态也要带上偏好里的值：页面打开时偏好已经是只看文字的，第一通电话的嘴就得是闭着的。
  - **「回到初始」不能把只看文字清掉**，它是偏好，不属于这通电话。
- **点头的 id 挂断后不归零**：和现在一样（`nods` 从来不清），每次点头都是新的 id。`StandEngine` 靠 id 判断一个点头播过没有（`StandEngine.ts:322`）。
- **过期通话的事件由 `LiveConversation` 挡住**：`attempt` 的判断（`onCallEvent` 里的 `current`）留在 `LiveConversation`，只有当前这通电话的事件才交给 reducer。reducer 不知道有「上一通」这回事。
  - 和现在的一处细微差别：现在 `user` 事件不看 `current`，过期的 `user` 也会改 `shownReply`。改成统一挡住以后，这件事不再发生。它没有可观察的效果：下一通电话里，`delta` 总在这通自己的 `user` 之后到达，`shownReply` 会被重新设置。
- **删掉快照的 `playing` 字段**：它是 ticket 16 的过渡品，没有组件读它。`segment-playing` 只交给 reducer。
- **不动的**：
  - `StandDirection`、`CALM`、`Emotion`、`Nod` 留在 `lib/standAnimations.ts`，`api.ts`、`CallLayer`、`Stand`、`StandEngine`、`OutfitPicker` 一行不改。
  - 快照的 `stand` 字段名和类型不变。
  - `withCallScreenRules`、`hearing`、`line`、收起和展开都不动。
- **CONTEXT.md**：「立绘指令」已在 grilling 中加进词表，这张不用再改。

## 验收

- [x] **先证明行为不变**：在动测试之前，`liveConversation.test.ts` 的「the stand」「her emotions」两组（L1243–1523）在新实现上一行不改，全部通过。在 Comments 里记下结果。
- [x] **按 TDD**：先写 `frontend/src/lib/standDirection.test.ts` 并看到它失败，再实现。测试的形式是「一串事件 → 导出的立绘指令」，不用假 Ports、不用拨号、不用 `FakeCall`。spine-stand spec「立绘指令」一节的每条规则至少对应一个测试。下面这些原测试都要在新文件里有对应：
  - 每通电话从平静开始、看着前方、嘴闭着；
  - 声音开始播放时开嘴，停下时闭嘴；
  - 只看文字时嘴一直闭着，出声时切过去也立刻闭上；
  - 用户说话时看向用户，停下后点头，每次点头 id 不同；
  - 被说话打断：声音一停就闭嘴并看向用户，心情不变；
  - 被打字打断：声音停下后看向用户，再开口时不看了；
  - 她开口前打字，什么都不变；
  - 挂断后清空；
  - 情绪在这段开始播放时才换，早到的先挂起；
  - 情绪晚到时，这段还在播就换过去；
  - 这段已经说完，晚到的情绪丢掉；
  - 声音刚停又开始，下一段的情绪照样保留；
  - 平静的段沿用心情，回复第一段是平静时回到平静；
  - 点头或摇头随情绪一起，每次一个新 id；
  - 只看文字时按每段第一句字幕换情绪；
  - 只看文字时下一段已经露出来了，这段的情绪照样接上；
  - 情绪只对判断它的那条回复有效；
  - 被打断时心情不变；
  - 挂断后忘掉上一通的情绪；
  - 立绘指令没有变化时仍是同一个对象（新增）；
  - 回到初始时保留只看文字、点头 id 继续往上数（新增）。
- [x] **按「替换而不是叠加」收拾 `liveConversation.test.ts`**：「the stand」和「her emotions」两组里断言**规则**的测试，搬到新文件后删掉。只留下证明**接线**的集成测试：
  - `keeps following the call while the call layer is collapsed`；
  - `is cleared when the call %s, the next call starting calm`（挂断和掉线两种；也证明了过期事件被挡住）；
  - `looks at the user who interrupts by typing once her voice stops, until she speaks again`（证明 `submit` 报了「打了字」）；
  - `keeps her mouth shut in text only, even when switched on while she speaks`（证明只看文字的切换报给了 reducer）；
  - 新增一条：偏好里已经是只看文字时，打开页面后第一通电话里她出声，嘴也不动（证明初始状态带上了偏好）。

  在 Comments 里列一张表，写明每条原有测试是「留下」还是「移到哪条新测试」。拿不准的就留下。
- [x] 删掉 L381–409 断言 `playing` 的两条测试：`knows which segment of which reply her voice is playing, until the call is over` 和 `starts the next call with nothing playing, even if the last one dropped`。第二条里「掉线后下一通重新开始」的部分，已经由 `is cleared when the call drops` 覆盖。
- [x] `LiveConversation` 里不再有 `nods`、`judged`、`shown` 字段，也不再有 `onSpeaking`、`startSaying`、`onEmotion`、`showEmotion`、`withStandRules`、`follows`、`key`。`ended()` 不再手动清立绘的状态。`State` 里和立绘有关的只剩一个字段。
- [x] 规则的叙述从 `LiveConversation` 的注释搬到 `standDirection.ts` 的注释里；`LiveConversation` 的注释改为指向它。
- [x] `frontend/` 下 `npm test` 和 `npm run typecheck` 都通过。
- [x] **人工验收（留给用户）**：打一通真实电话，看情绪、点头、打断时看向用户、只看文字的切换和以前一样。用户验过之后再标 `resolved`。

## Comments

### 2026-10-01 实现记录

**行为不变的证明**：接好 `standDirection.ts`、删掉快照的 `playing` 和它的两条测试之后，「the stand」「her emotions」两组（原 L1243–1523，共 21 条，含 `it.each` 展开）一行未改，`liveConversation.test.ts` 全部 99 条通过。之后才动这两组。

**TDD**：`standDirection.test.ts` 先写好，在 `standDirection.ts` 还不存在时跑过一次，整个文件因为导入失败而红（0 条测试跑起来）；写好 reducer 后 26 条全绿，然后才接进 `LiveConversation`。

**新测试的咬合**：
- 对 `standDirection.ts` 做了 10 个手工变异，全部被 `standDirection.test.ts` 抓到：
  - 挂断后点头 id 归零；
  - 挂断丢掉只看文字；
  - 不记 `shown`；
  - 每次都换新的指令对象；
  - 回到已说过的段；
  - 没出声时打字也算打断；
  - `user` 不结束当前段；
  - 平静的段总是回到平静；
  - 情绪带的点头不给；
  - 有声时按字幕开始说。
- 对 `LiveConversation` 的接线做了 5 个变异，全部被留下的集成测试抓到：
  - 初始状态不带偏好；
  - `delta` 不交给 reducer；
  - `user` 不交给 reducer；
  - 打字不上报；
  - 不按 `current` 挡过期事件。
- 另有 1 个变异存活，它是等价变异：不是当前通话时也 `update({ stand })`。这时 `stand` 就是原来的状态，只是多发一次快照。

**和旧行为的差别，比 ticket 写的多一处（code review 指出）**：旧代码里，过期的 `user` 除了改 `shownReply`，还会把 `saying` 标成说完。
- 如果挂断后马上重拨，旧通话的 `user` 在新通话已经开始说一段时才到，这段晚到的情绪就会被丢掉。
- 现在统一挡住了，这是改进，不是回归。
- 新增的集成测试 `is not moved on by the last call's events once the next one is under way` 专门证明这件事，同时补上了 `user`、`emotion`、`segment-playing` 三种过期事件被挡住的覆盖。原来 `is cleared when the call %s` 只推过期的 `bot-started-speaking`。

**原测试的去向**（`liveConversation.test.ts` → `standDirection.test.ts`）：

| 原测试 | 去向 |
| --- | --- |
| starts each call calm, looking ahead with her mouth shut | 移到 `starts each call calm, looking ahead with her mouth shut` |
| opens her mouth while her voice plays and shuts it when it stops | 移到同名测试 |
| keeps her mouth shut in text only, even when switched on while she speaks | **留下**（接线：切换报给 reducer）；规则另有同名新测试 |
| looks at the user while they speak, then nods once when they stop | 移到同名测试 |
| shuts her mouth as soon as her voice stops when the user cuts in, looking at them | 移到同名测试 |
| looks at the user who interrupts by typing once her voice stops, until she speaks again | **留下**（接线：`submit` 报了「打了字」）；规则另有同名新测试 |
| changes nothing for what is typed before she starts speaking | 移到同名测试 |
| keeps following the call while the call layer is collapsed | **留下** |
| is cleared when the call is hung up / drops, the next call starting calm | **留下**；规则移到 `is cleared when the call is over` |
| changes as her voice starts playing the segment, not before | **留下**（拿不准：只有它证明 `segment-playing` 和 `emotion` 交给了 reducer）；规则另有同名新测试 |
| changes on a late emotion while the segment is still playing | 移到同名测试 |
| drops an emotion that comes once the segment has been said | 移到同名测试 |
| keeps an emotion for a segment whose voice starts right after the last one stopped | 移到同名测试 |
| keeps her mood through calm segments, until a reply starts calm | 移到同名测试 |
| nods or shakes her head along with the emotion, once each | 移到同名测试 |
| changes as each segment's first subtitle shows in text only | **留下**（拿不准：只有它证明 `user` 和 `delta` 交给了 reducer）；规则另有同名新测试 |
| takes up each segment's emotion in text only though the next segment shows before it is judged | 移到同名测试 |
| keeps an emotion only for the reply it was judged in | 移到同名测试 |
| leaves her mood alone when she is interrupted | 移到同名测试 |
| starts the next call calm, forgetting the last call's emotions | 移到 `forgets the last call's emotions when it is over`；过期事件被挡住由 `is cleared when the call %s` 和新增的 `is not moved on by the last call's events once the next one is under way` 证明 |

新增：`LiveConversation` 里 `keeps her mouth shut from the first call when text only was on already`、`is not moved on by the last call's events once the next one is under way`；`standDirection.test.ts` 里 `gives the same direction while nothing about it changes`、`keeps text only when the call is over, and nods on with new ids`，以及补足规则的 `drops an emotion that comes once the next turn was taken up`、`gives a nod along with an emotion an id past the user's nods`、`does not take a segment up as said on its subtitle unless it is text only`、`does not go back to a segment she is past`、`forgets in text only which segment's emotion she showed last call`。

删掉：`knows which segment of which reply her voice is playing, until the call is over`、`starts the next call with nothing playing, even if the last one dropped`。

**顺带**：本机 `frontend/node_modules` 装得不完整（没有 `.bin`、缺 `@jridgewell/sourcemap-codec` 等），`npm test` 起不来，按 lockfile 跑了一次 `npm install` 补齐，`package-lock.json` 没有变化。

实现中没有发现不合理的规则，没有另开 ticket。等人工验收。

### 2026-10-02 人工验收

用户在本机打了真实电话：情绪、点头、被打断时看向用户、只看文字的切换都和以前一样，验收通过，标为 resolved。

验收中用户还发现立绘卡顿、开嘴慢，声音偶尔漏字。查下来都与本 ticket 无关：
- 用诊断脚本对照过，换回重构前的 `liveConversation.ts`，dev 模式下照样卡，主线程长任务都在 8～9 秒 / 40 秒。
- 卡顿主要来自 dev 模式：开发版 React 的额外检查，加上每个字幕增量都让整棵组件树重渲染。同样的代码用生产构建跑，没有长任务。
- `imageColorScale` 每次渲染都重算，已另行提交缓存。
- 漏字在对话模型换成 DeepSeek 官方接入点后没再出现，原因未确定。后端在每段 TTS 开始时事件循环会堵约 100ms，浏览器因此丢掉不到 0.1 秒的声音，量级不足以解释「漏一小句」。
