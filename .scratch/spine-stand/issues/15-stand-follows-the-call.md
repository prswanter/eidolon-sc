# 15: 她跟着通话动起来（口型、看向、点头）

**What to build:** 通话中，她的声音播放时立绘动嘴，停下时闭嘴；用户开口时她看向用户，说完时点一下头；被打断时立刻闭嘴并看向用户；挂断后状态清空。「只看文字」时嘴始终闭着。这一张心情始终是平静，情绪在 17 接上；但「选动画」纯函数要一次把七种情绪的逐级替代都写好并测试。纯前端，不改后端。规则和定义见 `../spec.md`（「立绘指令」「选动画」两节）。

参考：原型分支 `prototype/spine-stand` 的立绘引擎里，有 `setSpeaking`、`setLooking`、`nod`、`playBody`（`loop_start`、`relay`）的写法。

**Blocked by:** 14

**Status:** resolved

- [x] **接收事件**：前端开始监听 pipecat 已经在发的 RTVI 事件，包括 `bot-started-speaking`、`bot-stopped-speaking`、`user-started-speaking`、`user-stopped-speaking`，把它们变成新的 `CallEvent` 交给 `LiveConversation`。
- [x] **立绘指令**：`LiveConversation` 的快照里新增立绘指令（下面是来自原型的类型，只保留决定性的部分）：
  ```ts
  type StandDirection = {
    mood: Emotion;          // 七种之一，通话开始时是平静
    speaking: boolean;
    looking: boolean;
    nod: { kind: "yes" | "no"; id: number } | null; // 每次给新 id，渲染层据此只播一次
  };
  ```
  规则：
  - 开始说话时开嘴，停止说话时闭嘴；「只看文字」时始终闭着。
  - 用户开口时看向用户；用户停下时不再看向，并点一次头（`yes`）。
  - 打断时，声音一停就闭嘴并看向用户，心情不变；补充发生在她开口前，指令不变。
  - 挂断时清空，下次通话从平静开始。
  - 收起通话层时，指令照常更新。
- [x] **选动画**（新增的纯函数）：输入立绘指令、这套衣装有哪些动画、是否减少动态效果，输出各条轨道该播什么。
  - 轨道：0 身体、1 表情、2 点头、3 视线、5 口型。同一条轨道上切换时混合 0.3 秒。
  - 逐级替代列表照 spec「选动画」一节：身体找不到用 `wait`，表情找不到用 `blank`，口型按替代链找。
  - 减少动态效果时，身体一律用 `wait`。
- [x] **引擎按选动画的结果播放**：
  - 带 `loop_start` 的身体动作，开头播一次，之后从 `loop_start` 起循环尾段；离开带 `relay` 的动作时，先播它指定的 `arm_down*`。
  - 说话时循环说话口型；闭嘴时把同一个说话口型冻结在第 0 帧，用 `animationEnd = 0`，不用 `timeScale = 0`，也不用 `lip_*_s`。开嘴、闭嘴混合 0.1 秒。
  - 点头播一次，然后清空这条轨道。
  - 看向用户时播 `eye_front`；不看时清空这条轨道，混合 0.3 秒。
  - 立绘晚到时，直接按当前的指令开始画。
  - 通话中途切换系统的「减少动态效果」时，从下一个动作开始生效。
- [x] **测试**：
  - `LiveConversation`（沿用 `FakeCall` 和假 `Ports`）：开嘴和闭嘴；「只看文字」时不开嘴；用户开口看向、停下点头；打断时闭嘴、看向、心情不变；挂断后清空。
  - 选动画：用真乃、恋钟各几套真实衣装的动画名单做测试数据（从镜像里挑，只取名字），覆盖七种情绪的身体、表情、口型替代，缺表情时用 `blank`，减少动态效果，点头和视线。
- [x] **人工验证**：真实通话里，嘴跟着声音开合，停下后嘴部完全不动；开口时她看向你，说完点头；打断时立刻闭嘴。在 Comments 里记下观察结果。
- [x] `npm test`、`npm run typecheck` 全部通过。

## Comments

**实现记录（2026-10-01，agent）**

- **接收事件**：`call.ts` 把 pipecat 的 `onBotStartedSpeaking` / `onBotStoppedSpeaking` / `onUserStartedSpeaking` / `onUserStoppedSpeaking` 变成 `CallEvent` 里新的 `Speaking` 事件（`api.ts`，事件名只在 `SPEAKING` 一处列出）。已经挂断或断线的那通电话后到的这类事件不理会。
- **立绘指令**：`Snapshot.stand: StandDirection`（类型、`Emotion`、`CALM` 在 `lib/standAnimations.ts`）。情绪在代码里用英文：`calm`、`happy`、`shy`、`surprised`、`sad`、`angry`、`thinking`，17 的 `emotion` 消息可以直接用这几个值。`LiveConversation` 内部记着她的声音在不在播、用户在不在说，由它们推出 `speaking`（「只看文字」时始终是 false，中途切换也立刻闭嘴）和 `looking`；用户停下时给一个新编号的 `yes`。挂断、断线都回到 `CALM`。指令没变时快照里还是同一个对象，渲染层不会白白重设。
- **打断**：说话打断靠 `user-started-speaking`（看向）加 `bot-stopped-speaking`（打断时 pipecat 立刻发，闭嘴）。**打字打断**没有这两个用户事件，这里另做了一条：她的声音在播时用户发出文字，算打断，等声音停了就看向用户，直到她再开口。spec 没写到打字打断，这是我补的，人工验收时请顺便看一下是否合适。她开口前打的字（补充）不改变指令。
- **选动画**：`pickAnimations(direction, animations, reducedMotion)`，`animations` 是这套衣装的「动画名 → 时长」（口型的最后一级替代要看时长）。返回身体、表情、口型（名字 + 开合）、点头（名字 + 编号）、视线。测试数据是镜像里真乃 `stand/1030010010`、`stand/3000010580` 和恋钟 `stand/1030040010`、`stand/3000040580` 的真实动画名单（这四套分别缺 `face_serious`、`shy1/shy2/face_shy`、`face_surp`、`sad1/sad2`，正好覆盖几种替代）；替代链更靠后的几级，用从真实名单里去掉几个动画的方式测。
- **引擎**：`StandEngine.direct(direction, reducedMotion)`，立绘没到时先记下，到了按最新指令开始画（到之前的点头不补）。各轨道只在要放的变了时才重设；身体动作只在心情变了时换，所以减少动态效果从下一个动作开始生效。`loop_start`、`relay`、闭嘴冻结（`animationEnd = 0`，混合 0.1 秒）照原型写法。衣装连 `blank` 都没有时清空表情轨道。点头用 `addEmptyAnimation(轨道, 0.3, 点头时长)`：3.6 在 delay 为 0 时会把混合时间扣两次，点头最后约 0.6 秒会被吃掉（原型的写法有这个问题，code review 发现的）。
- **本地冒烟**（临时页面 + CORS 静态服务器 + Playwright，没有提交）：在真的 spine-ts 3.6 上逐步下指令读各轨道，载入后闭嘴冻结 `lip_smile`、开嘴循环、看向 `eye_front` 和清空、点头播完清空且同一编号不重播、`smile1` → `think` 时先播 `arm_down`、减少动态效果时身体是 `wait` 都符合预期。无头浏览器的 rAF 大约 1 帧/秒，只能看轨道状态，看不了动画效果。
- **全量**：`npm test` 292 passed，`npm run typecheck` 通过。没有改后端。

**留给人工验证**：真实通话里嘴跟着声音开合、停下后嘴部完全不动；开口时她看向你，说完点一下头（点头要完整）；说话打断和打字打断时立刻闭嘴并看向你；「只看文字」时嘴不动。

### 2026-10-01 人工验收（用户）

在本地开发环境里打真实电话验收，素材由 CORS 静态服务器直接提供镜像的 `assets` 目录（`EIDOLON_STAND_ASSETS_URL=http://localhost:8765`）。全部正常：

- 她说话时嘴跟着声音开合，停下后嘴部完全不动。
- 用户开口时她看向用户，说完点一下头，点头完整。
- 说话打断时她立刻闭嘴并看向用户。
- 打字打断时，她的声音停下后看向用户，直到她再开口（这条是实现时补的规则，验收认可）。
- 「只看文字」时嘴始终不动。
- 挂断再打，从平静开始。
