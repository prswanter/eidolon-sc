# 04: 通话层和通话状态机

**What to build:** 点通话按钮后，全屏的通话层从页首展开（手机上占满全屏，电脑上只盖右栏），显示她、通话状态、计时，以及她当前这句的日语和字幕、用户正在说的话。可以收起回到 IM（通话照常继续，页首留一张「通话中 · 点击返回」便利贴），也可以按 Esc 收起。底部三个按钮：麦克风静音、挂断、切换麦克风（切换的实现在 05）；右上角「只看文字」开关。因故结束时停在结束页，写明原因和是否计入限额。规则见 `../spec.md`「通话层」「通话状态」，术语见 `CONTEXT.md`。

**Prototype:** 原型参见提交 `8551cde`（原 `prototype/frontend-redesign` 分支，合并后已删除）里的 `frontend/src/app/prototype/`（`git switch --detach 8551cde` 后 `npm run dev` 打开 `/prototype`，右下角「原型控制台」可以跳到任意状态）。 对应文件：`CallLayer.tsx`、`call.ts`（结束原因和文案）、`Conversation.tsx` 里的 `CallNote`。

**Blocked by:** 03

**Status:** ready-for-agent

- [x] 扩展 `liveConversation` 的通话阶段：现在只有 `idle / connecting / active`，而且 `active` 在传输连上时就置位（`frontend/src/lib/liveConversation.ts:169`）。要分出：
  - 拨打中；
  - 接通（`CONTEXT.md`「接通」：角色能听也能说。先确认后端/Pipecat 哪个事件对应，例如 bot ready，在 Comments 里写明依据）；
  - 因故结束（带原因）和回到空闲两种结束
  - 先写测试
- [x] 结束原因需要结构化：现在失败只有一段文字（`frontend/src/lib/failure.ts`）。和后端约定原因代码：没能接通、中途断开、时长到上限（后端 `call.py` 已有「这次通话已经满 N 分钟了」）、限额用完、自带密钥出错；麦克风被拒由前端识别。每种原因的文案和「是否计入限额」按 `CONTEXT.md`「限额」「接通」
- [x] 计时从接通开始；离单次通话时长上限不到 1 分钟时改为显示剩余时间（上限值由后端提供，不要写死）
- [x] 麦克风静音：只在浏览器端关掉音轨（`microphone.ts` 的 `enableMic(false)`），打字不受影响，照常算补充或打断
- [x] 「只看文字」替换现在的「静音（只看文字）」复选框，行为不变（关掉她的声音并通知后端，偏好存 localStorage）
- [x] 通话中离开对话（双栏里点别的角色、进设置或记忆、返回列表）先弹确认，确认后照常挂断（`CONTEXT.md`「通话」）
- [x] 视觉：背景图（02 的 `background_url`）全幅，上面叠从她的 `call.top` 到 `call.deep` 的渐变；没有背景图时只用渐变。状态线（虚线=拨打中、实线=通话中、删除线=已结束）和头像描边用 `call.rule`；次要字的透明度与 `CALL_MUTED` 一致；开关圆钮在通话层上要看得见
- [x] 收起后的便利贴：原型里是手写样式的 `<button>`，正式实现改用 Astryx 组件（例如 `Button`/`ClickableCard` 加主题覆盖），外观按 `DESIGN.md`；底色 `note`，状态下划线 `noteRule`
- [x] 系统开启「减少动态效果」时展开/收起不用动画；手机上按钮不小于 44px；通话层有 `aria-label`，收起时 `inert`
- [x] 真实通话里验证一遍（拨打、接通、收起、打字、静音、挂断、各种结束原因能模拟的都模拟），浅色和深色各截图

## Comments

**2026-09-28 实现完成**（Status 不动，理由同 01）：

- **「接通」对应哪个事件**：Pipecat 的 `bot-ready`。依据：
  - 前端 `PipecatClient.connect()` 要等到 `bot-ready` 才 resolve（`@pipecat-ai/client-js` 的 `connect()` 把 resolve 交给 `handleMessage` 里 `BOT_READY` 那一支）；原来的 `active` 其实就是这一刻置位的，并不是传输一连上就置位。
  - 后端的 `bot-ready` 由 `PipelineWorker` 在 RTVI 收到浏览器的 `client-ready` 后发出（`pipecat/pipeline/worker.py` 的 `on_client_ready` → `set_bot_ready()`），而 `client-ready` 走数据通道，所以一定在 WebRTC 连上、`on_client_connected` 触发之后。后端从 `on_client_connected` 起把这次通话算作接通（`_LiveCall._connected`，没接通的退还限额）。所以前端显示「通话中」的通话，后端也一定当它接通了。
  - `CONTEXT.md`「接通」还说，语音服务在记下任何回合之前出故障结束的，也算没能接通。这种情况下后端会退还限额，并在 `ended` 消息里写 `not_connected`，前端照此显示「没能接通 / 不计入」。
- **结束原因**：
  - 后端 `ended` 消息加上 `reason` 和 `counts`（是否计入限额）两个字段。`reason` 有这几种：
    - `not_connected`：语音服务在记下任何回合之前出故障；
    - `dropped`：记下回合之后出故障；
    - `duration_limit`、`turn_limit`：到了时长或回合数上限；
    - `own_key`：自带密钥出错，`message` 里写明是哪一项。
  - 到上限时，`counts` 在全用自带密钥时为 false。服务出故障时，`counts` 在记下过回合且不免计时才为 true，和 `_serve` 退不退还限额一致。`_run` 本身抛异常的，只要已接通，也照样发出 `ended`。
  - `/api/ice-servers` 多返回 `maxCallSeconds`（单次时长上限，不限时为 null）和 `callExempt`（这次是否全用自带密钥）。
  - 前端 `lib/callEnd.ts` 把原因补全：
    - 开始阶段的 429 → `over_limit`；
    - 409 → `own_key`；
    - `MicUnavailable`（`microphone.ts` 打不开麦克风）→ `mic_denied`；
    - 其余 → `not_connected`。
    - 以上都不计入限额。
    - 连接断开而后端没有说明原因的 → `dropped`，计入与否取 `!callExempt`。
  - 每种原因的标题和说明在 `i18n/zh.ts` 的 `call.endings`。
- **计时**：`lib/callTime.ts` 负责。从接通算起；离上限不到 60 秒时改为「还剩 mm:ss」。后端的时长计时原来从管线启动算起，比接通早了连接所需的几秒，现在改为从 `on_client_connected` 算起（`CallTurns.connected()`），和前端对齐。
- **状态机**：`liveConversation.ts` 的 `CallState` 有四种：
  - `idle`；
  - `dialing`：可以挂断，挂断后如果又接通了，会随即挂掉；
  - `connected`：带 `since` 和 `maxSeconds`；
  - `ended`：带 `CallEnd`，由 `dismissEnd()` 回到空闲，或者由 `startCall()` 重拨。

  用户自己挂断时直接回到 `idle`。另外：
  - 新增 `toggleMic()`：只调 `Microphone.enableMic`，每次通话开始时麦克风是开着的；
  - `toggleMute()` 改名为 `toggleTextOnly()`，偏好的键名和发给后端的消息仍叫 `muted` / `mute`，保持兼容；
  - 新增 `line`：本次通话里她最新的一句。
- **界面**：
  - `CallLayer.tsx`：通话层。
  - `CallNote.tsx`：收起后的便利贴，用 `ClickableCard` 加她的 note 色。
  - `useCallTime.ts`：每秒刷新计时。
  - `theme/lineState.ts`：线形状态的样式，通话层和便利贴共用。
  - 对话页页首的电话键在通话中变成「回到通话」。⋯ 菜单里的「只看文字」去掉了，换成通话层上的开关。
  - 离开时的确认框放在 `ConversationDirectory` 里（`leave()`）。在列表里点别的角色、菜单里进记忆或设置、窄屏的返回键、结束页的「去设置自带密钥」，都经过它。
  - 结束页上，限额用完和自带密钥出错这两种，主操作是「去设置自带密钥」（同原型），其余是「重拨」。
- **真实通话验证**（Playwright Chromium，后端用真实的 Soniox 和 Fish Audio，`EIDOLON_CALL_MINUTES=2`）。依次验证了：
  - 拨打中（虚线）→ 接通（约 7 秒，实线，计时从 00:00 开始），列表那一行同步显示；
  - 麦克风静音；
  - Esc 收起（通话层 `inert`），便利贴显示「通话中 mm:ss · 点击返回」；
  - 静音期间打字，照常进通话、她照常回答；
  - 点击便利贴或键盘 Enter 展开，通话层显示她当前这句的日语和字幕；
  - 最后一分钟变成「还剩 00:52」；
  - 到时长上限后停在结束页，写明「计入」；
  - 限额用完（本地每小时 5 次）后停在结束页，写明 429 带回的重试时间和「不计入」；
  - 麦克风被拒后停在结束页，写明「不计入」；
  - 挂断后通话层直接收起，不出结束页，也没有便利贴；
  - 窄屏返回键先弹确认框，「挂断并离开」之后后端断开；
  - 390 宽时通话层 `position: fixed` 占满全屏，所有控件高度 ≥ 44px；
  - 系统设为减少动态效果时 `transition: none`；
  - 只看文字的开关写进 localStorage。

  浅色和深色的截图在本地 `logs/t04-*.png`（不入库）。没有模拟的是：
  - `not_connected`、`dropped`、`own_key` 这三种由后端给出的结束（由后端端到端测试和前端单元测试覆盖）；
  - 真正的背景图：`characters/backgrounds/` 里还没有图，是临时拿她的头像当背景看了一眼，文字仍然读得清。
- **发现并修正**：通话层强制深色，但系统是浅色时，次要按钮的底（`--color-neutral`）仍取到浅色模式的值，几乎看不见。现在在通话层上把它换成 16% 的白。
- **没有做的**：
  - 浏览器自带的后退或手势后退不会弹确认，直接离开并挂断（`CONTEXT.md`「通话」允许，ticket 列出的几种离开方式都已覆盖）；
  - 切换麦克风按钮只占了位置，暂时不可用（ticket 05）；
  - 拨打中仍可以收起，也可以拨动只看文字的开关。
- 后端全量测试里 `test_characters.py::test_missing_character_sheet_is_reported_with_its_path` 在 Windows 上因为路径分隔符失败，和本次改动无关。
