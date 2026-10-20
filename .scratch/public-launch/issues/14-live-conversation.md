# 14: 对话页打开着的对话搬出 React：通话的生命周期和回合的结局

**What to build:** 新建不依赖 React 的 `frontend/src/lib/liveConversation.ts`（`class LiveConversation`），拥有一个对话正在进行的部分：对话记录、文字回合的结局、通话的阶段与结束、草稿、静音。每个对话一个实例，用 `(conversationId, messages)` 创建；注入 `startCall`、`sendTurn`、偏好 port 和角色音轨的回调。页面用 `useSyncExternalStore` 订阅快照、渲染、转发点击。对外行为不变，两处改动：接通中不能发送文字（修掉与通话交错写记录）；为 f584f25（接通中离开页面要挂断）补上测试。

**Blocked by:** —

**Status:** done

- [x] `LiveConversation` 提供 `snapshot` / `subscribe` / `dispose`，以及 `setDraft`、`submit`、`toggleCall`、`toggleMute`；快照含 `entries`、`phase`（`idle` / `connecting` / `active`）、`hearing`、`busy`、`draft`、`muted`、`failure`
- [x] 对话记录由 module 拥有，内部沿用 `conversationLog` reducer；`conversationLog.ts` 与它的测试不改
- [x] 注入的 port：`startCall`、`sendTurn`（签名不改）；偏好 `load` / `save`（真实实现是 `callPreferences`）；角色音轨回调，由页面设置 `<audio>.srcObject`
- [x] 任何时刻都能 `dispose`：接通中则 `startCall` 返回后立即挂断、不进入 `active`；此时 `startCall` 失败不显示错误；通话中则挂断；文字回合进行中不中止，只是不再发布快照
- [x] 用户挂断与掉线走同一条结束路径：回到 `idle`、清空 `hearing`、撤回没说完的回复；掉线显示后端 `ended` 的理由，没有就显示「通话已断开」；用户挂断不显示错误
- [x] 接通中不能 `submit`；文字回合进行中不能开始通话；接通中仍不能取消（UI 不变）
- [x] 回合失败（`error` 事件、流结束仍没有 `done` →「回复中断了，请再试一次」、抛出异常）都撤回记录、把草稿还原
- [x] 通话中 `submit` 走 `sendText`，不开文字回合，草稿清空
- [x] 静音由 module 保存偏好；通话中切换时通知通话；开始通话时带上当前偏好
- [x] 页面：加载（角色名、最近或新建的对话、消息）与「新对话」留在页面；「新对话」dispose 旧实例、创建新实例；`pageError` 只来自加载与新建对话失败，显示 `pageError ?? snapshot.failure`
- [x] 新测试 `src/lib/liveConversation.test.ts`（见「测试」），全部写在 `LiveConversation` 的 interface 上
- [x] 现有测试不改，全部通过；`npm run typecheck` 通过

## 背景（2026-09-27，架构体检候选 3）

1. 通话状态散在 `callState`、`call`、`callEnding`、`disposed`、`hearing`、`muted` 6 处 state / ref；「结束通话」的四步（清 ref、回 `idle`、清 `hearing`、`interrupted`）在 `toggleCall` 的挂断和 `onDropped` 两处各写一遍。
2. 回合结局规则（流没给 `done` 就算「回复中断了」、失败还原输入）只在组件里，零测试。
3. 接通中离开页面会漏挂断：卸载时 `call.current` 还是 `null`。f584f25 已加 `disposed` 标记原地修好，当时约定测试留给本 ticket。
4. 后端不阻止同一对话里文字回合与通话并行；页面只在 `busy` 时禁用通话按钮，接通中仍能发文字。那个文字回合与随后接通的通话写进同一份记录，通话的 `user` 事件会把文字回合里还没被后端接收的回合当成自己的。
5. vitest 跑在 node 环境、没有 jsdom；module 不依赖 React，就能直接测。

## 测试

用假 `startCall`（可手动 resolve / reject，可触发 `onEvent`、`onHearing`、`onDropped`）、脚本化的 `sendTurn`、内存里的偏好：

1. 接通中 `dispose`：`startCall` 返回后立即 `hangUp`，不进入 `active`，也不再发布快照（f584f25）
2. 接通中 `dispose` 后 `startCall` 失败：不显示错误
3. 通话中 `dispose` → `hangUp`
4. 用户挂断与掉线：回到 `idle`、清空 `hearing`、撤回没说完的回复；掉线显示后端理由，没有理由显示「通话已断开」；用户挂断不显示错误
5. 接通失败：回到 `idle`，显示后端给的理由
6. 通话中 `submit` 走 `sendText`，不开文字回合，草稿清空
7. 接通中 `submit` 被拒绝；文字回合进行中不能开始通话
8. 文字回合成功时记下；`error` / 没有 `done` / 抛出异常时撤回记录并还原草稿
9. 文字回合进行中 `dispose`：不中止回合，但不再发布快照
10. 静音：切换时保存偏好；通话中通知通话；开始通话时带上当前偏好

页面本身只做渲染和转发，不单独测，靠 `typecheck`。

## Comments

### 决定（2026-09-27，grilling）

- **范围**：通话的生命周期和文字回合的结局一起搬。两者互相排斥、共用一份记录，这些规则只有在同一个 module 里才测得到。
- **接通中离开照常计入限额**（领域决定）：等连上再挂断，不给 `startCall` 加 abort。离开对话页就是用户挂断，与「用户自己中途离开的照常计入」一致。`CONTEXT.md` 的「通话」已改。
- **接通中不能取消**：保持 UI 不变。以后要做，只需加一个入口，走 `dispose` 的同一条路径。
- **接通中不能发文字**：与「文字回合进行中不能开始通话」对称，同一时间只有一个回合来源。
- **文字回合进行中离开页面不中止**（领域决定）：站内跳转不会断开 `fetch`，回复照常完成并记下；通话必须挂断，是因为麦克风和 WebRTC 还占着。`CONTEXT.md` 的「回合」已澄清「离开」指与回合的连接断开。
- **记录、草稿、静音都归 module**：「撤回」「还原草稿」「通话中切换静音」都是规则，要能在 interface 上断言。
- **加载与「新对话」留在页面**：module 只管对话正在进行的部分；每个对话一个实例。
- **错误**：module 的 `failure` 来自接通失败、掉线、通话中的 `error` 事件、文字回合失败，在它下一次操作（`submit`、`toggleCall`）开始时清除；页面的 `pageError` 只来自加载与新建对话失败。
- **命名**：`liveConversation.ts` / `LiveConversation`，意思是「对话页上打开着的这个对话」。`api.ts` 已有 `Conversation`（后端数据），「会话」在代码里指登录会话。不进 `CONTEXT.md`。
- **边界情况（实现时处理）**：`startCall` 还在接通时触发的 `onDropped` 忽略，由 `startCall` 的失败来处理。
- **不在范围内**：`/api/offer` 走 `redirectFor`、`api.ts` 的 `overLimit` / `describe` / SSE 分帧测试，见 ticket 15。
- 不写 ADR（容易撤回）。`CONTEXT.md` 的改动已随 ticket 提交（bdb0496）；实现一个提交。

### 实现（2026-09-27）

- `liveConversation.ts`：`LiveConversation(conversationId, messages, ports)`；`Ports = { startCall, sendTurn, preferences: { load, save }, onCharacterAudio }`。`snapshot` / `subscribe` 是箭头属性，直接交给 `useSyncExternalStore`；快照只在变化时换新对象。`dispose` 之后 `update` 一律不生效，所以文字回合照常迭代到底、不再发布。用户挂断与掉线共用私有的 `ended(failure)`。`onDropped` 只认已经接通、仍是当前的那个通话，接通中的掉线交给 `startCall` 的失败。
- 页面：`opened`（要打开的对话及其消息）由加载和「新对话」设置；一个依赖 `opened` 的 effect 创建 `LiveConversation`、清理时 `dispose`。这样 StrictMode 和 Fast Refresh 重跑 effect 时会换一个新实例，而不是留下一个已 dispose 的。页面不再有 `call`、`callEnding`、`disposed`、`callState`、`hearing`、`muted`、`input`、`busy` 这些 state / ref。
- 与 ticket 的出入：
  - 开始通话时清除上一次的错误（原页面就这样，补了测试）；挂断不清除，与原页面一致。
  - 对话打开之前，静音开关不可用、显示为未静音；原页面在首次 effect 里读偏好，现在要等对话打开后才读到。读 `localStorage` 不能放在渲染里（会造成 hydration 不一致）。
- 测试：`src/lib/liveConversation.test.ts` 22 个，全部经 `LiveConversation` 的 interface：ticket 列的 10 条，外加「接通中掉线交给接通失败」「通话中的回合失败时通话继续」「开始通话时清除上一次的错误」「后端接收了这句话就不再显示正在听」「上一次通话的结束理由不带到下一次」。
- 验证：`vitest` 45 passed（新增 22）；`tsc --noEmit` 0 errors；`next build` 通过。变异检查：dispose 后仍发布、dispose 不挂断、接通中离开后不挂断、文字回合中开始通话、接通中发送、结束时不撤回回复、结束时不清空正在听、`user` 事件不清空正在听、失败不还原草稿、静音不通知通话、静音不保存、结束理由不重置，各自至少一个测试失败。

### 评审（2026-09-27，code-review）

- 修复：`pageError` 原来只在「新对话」时清除，「新对话」失败后会一直盖住 module 的 `failure`，而原页面发送、开始通话时都会清掉错误。现在页面在转发 `submit` / `toggleCall` 前清除它。
- 修复：`ending` 既是结束理由的字段，又是 `toggleCall` 里正在挂断的那个通话，字段改名为 `endReason`；快照缓存 `current` 改名为 `published`；`snapshot` 的注释改为「只在更新后换新对象」（`setDraft` 传入相同的值也算更新）。
- 修复：「推进记录，同时改别的状态」重复了 6 次，收成私有的 `apply(action, change)`。
- 修复：页面的 `NOT_OPEN` 把初始状态又写了一遍，改由 module 导出，和构造函数共用 `IDLE`。
- 修复：测试夹具 `deployment()` 改名为 `conversation()`，避免和「部署者」混淆。
- 保留不改：
  - `{ message, signedOut: false }` 出现了 4 次：原页面也是这样写的，而 `Failure` 只有两个字段。
  - 测试里的 `message()` 与 `conversationLog.test.ts` 的几乎相同：属于测试里可以接受的重复。
  - 对话打开前静音开关不可用：见「实现」一节里「与 ticket 的出入」的第 2 条，需要 ticket 作者确认。
- 验证：`vitest` 45 passed；`tsc --noEmit` 0 errors；`next build` 通过。
