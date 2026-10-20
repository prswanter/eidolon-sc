# 02: 对话页的状态都交给 LiveConversation

**What to build:** 把 `ConversationView` 里带规则的状态和 effect 搬进 `frontend/src/lib/liveConversation.ts`，React 这边只负责渲染快照、把操作转给它。搬的内容包括：打开对话、开新对话、通话层的收起、选麦克风、页面错误、列表刷新的时机和消息时间。背景和约定见 `../spec.md`。

**Blocked by:** None (can start immediately)

**Status:** resolved

## 已定的设计（2026-09-28 grilling）

- **生命周期：每位角色一个**。改成 `new LiveConversation(characterId, ports)`，由它自己负责打开：有对话就打开最新的一个（`listConversations`），没有就新建（`createConversation`），再用 `listMessages` 载入消息。
  - 快照里要能看出"打开中"。打开失败时（包括未登录，`failure.signedOut`），失败原因放在快照的 `failure` 里。页面现有的"打不开"空状态和重新登录按钮照旧，只是改为从快照取数据。
  - `startNewConversation()` 也移到它身上：新建对话，清空日志，重置 `callFrom` 等按对话计的状态。按钮禁用的条件保持现状（回合进行中、通话中、未登录时禁用）。
  - `dispose()` 的语义不变：离开页面就挂断通话，拨号中的也挂断。正在打开时 dispose，打开的结果被丢弃，不再发出 `onListChanged` 之外的任何更新。至于这种情况下"已经新建了对话"要不要仍然调用 `onListChanged`，由实现者决定并在 Comments 里写明。
  - 页面 `ConversationView` 以 `character.id` 作 key，所以一位角色对应一个实例（`app/(conversations)/conversation/[characterId]/page.tsx:24`）。
- **Ports 新增**：
  - `listConversations`、`createConversation`、`listMessages`，直接对应 `@/lib/api` 里的同名函数；
  - `onListChanged(): void`，在两种情况下调用：一个回合**记下了**（收到 `done`，文字回合和通话里的回合都算），以及新建了一个对话（包括打开时因为没有对话而新建）。
- **快照新增或调整**：
  - `collapsed`：通话层收起了。规则：`call.phase` 变成 `ended` 时自动展开；拨号时展开。另外提供 `collapse()` 和 `expand()` 两个方法。
  - `pickingMic`：麦克风列表开着。规则：通话一旦不在 `connected`，就自动关上。另外提供打开和关闭的方法。
  - `failure`：页面唯一的错误。`pageError` 删掉，打开失败、开新对话失败都写进它。拨号时清掉它（现在的 `dial()` 就是这样做的）。
- **消息时间**：`Entry` 加一个 `at: string` 字段（ISO 格式）。
  - `loaded` 的消息用它们的 `created_at`；
  - `done` 换成已记下的回复时，用 `message.created_at`；
  - 用户那条在 `submitted` 或 `user` 时，由 `LiveConversation` 用 `ports.now` 盖上时间。作法是在这两个 `LogAction` 上加一个 `at` 参数，`conversationLog` 保持纯函数；
  - 进行中的回复，时间可以先用开始的时刻，也可以留空，由实现者决定。
  - 删掉 `ConversationView` 里的 `useEntryTimes`，改为直接用 `entry.at`。
- **留在 React 的**：
  - `useShownCall`：只是为了让收起动画在挂断后还有东西可收，属于渲染细节。
  - 目录的 `setCall` 镜像 effect（`ConversationView.tsx:118-122`）保持原样。
  - `isFullScreen`、`isReducedMotion`、`<audio>` 的 ref，以及通过 `onCharacterAudio` 接到 `<audio>` 的那部分接线。
- **删掉的**：数 settled 条目刷新列表的那段代码（`ConversationView.tsx:133-140`，包括 `seen` ref）、两个 phase effect（`:124-131`）、打开对话的 effect（`:84-101`）、`startNewConversation` 里的 React 状态操作、`pageError`。
- **不碰的**：`failure.ts`、`callEnd.ts`、`call.ts`、`microphone.ts`、`CallLayer.tsx` 的接口（props 名可以跟着快照调整，但不要改它的行为）、限额相关的文案，以及后端。

## 验收

- [x] 在 `frontend/src/lib/liveConversation.test.ts` 里，给 fake Ports 补上三个 list/create 函数和 `onListChanged` 计数器，新增测试：
  - 有对话时打开最新的一个，消息载入，**不**调用 `onListChanged`；
  - 没有对话时新建一个，调用 `onListChanged` 一次；
  - 打开失败（普通错误，以及 `signedOut`）时，失败原因出现在快照的 `failure` 里；
  - 开新对话：日志清空，调用 `onListChanged` 一次；
  - 一个成功的文字回合只调用 `onListChanged` 一次，而且是在 `done` 之后，提交时不调用；
  - 通话里记下一个回合时调用一次；
  - 失败的回合、被撤回的回合不调用；
  - 用固定时钟测时间：新回复的 `at` 等于 `done.message.created_at`，用户那条的 `at` 等于提交时的 `now`；
  - 收起时通话因故结束，会自动展开；
  - 拨号会展开，并清掉之前的 `failure`；
  - 麦克风列表开着时通话断开或结束，列表会自动关上；
  - 打开过程中 dispose，之后不再更新快照。
- [x] 现有的 `liveConversation.test.ts` 按新的构造方式调整，全部照常通过。
- [x] `frontend/src/lib/conversationLog.test.ts`：给 `at` 补断言，覆盖 `loaded`、`submitted`、`user` 和 `done` 四种情况。
- [x] `ConversationView.tsx` 里不再出现 `pageError`、`useEntryTimes`、`seen`、`setCollapsed` 和 `setPickingMic` 这几个 React state，也不再有处理通话 phase 的 effect。
- [x] 手动验证（用 `run` skill 或 Playwright 均可）：
  - 进入一位角色的对话，发一句话，列表那一行只在回复记下后更新一次（看网络请求 `latest` 的次数）；
  - 气泡下的时间正确；
  - 打电话、收起、挂断、再拨号，行为和改动前一致。
- [x] 在 `frontend/` 下运行 `npm test` 和 `npm run typecheck`，全部通过。有 lint 脚本的话也跑一遍。
- [x] 按 TDD 做：先写失败的测试，再实现。

## Comments

### 2026-09-28 实现记录

**做了什么**
- `LiveConversation` 改为 `new LiveConversation(characterId, ports)`，构造时自己打开：用 `listConversations` 取最新的一个，没有就 `createConversation`，再 `listMessages`。快照加了 `status: "opening" | "open" | "failed"`，"打开中"就看它；打开失败的原因（包括 `signedOut`）放进 `failure`。打开完成前、以及开新对话的过程中，`submit` 和 `startCall` 直接忽略，因为还没有对话可发。
- `startNewConversation()` 搬了进来：回合进行中或通话中不做；成功后换成新对话，清空日志，`callFrom` 归零，`call` 回到 `idle`，清掉 `failure`；失败时原对话保持打开，原因写进 `failure`。输入框的草稿和只看文字保留不动。旧实现是把整个实例重建，草稿会被清空；草稿不是按对话计的状态，这算一个小的行为差异。
- Ports 新增 `listConversations`、`createConversation`、`listMessages` 和 `onListChanged`。`onListChanged` 只在两处调用：一是收到 `done`（文字回合和通话里的回合都经过 `turnEvent()`），二是新建了对话（打开时新建和开新对话都经过 `started()`）。失败或被撤回的回合不调用。
- 快照新增 `collapsed` 和 `pickingMic`，方法有 `collapse()`、`expand()`、`openMicPicker()`、`closeMicPicker()`。规则统一放在 `update()` 里：`call` 变成 `dialing` 或 `ended` 时展开；`call.phase` 不是 `connected` 时关掉麦克风列表。`collapse()` 只在通话进行中（拨号或接通）有效，`openMicPicker()` 只在接通时有效。拨号清掉 `failure` 沿用原来的 `startCall()`。
- `Entry` 加了 `at`（ISO 格式）。`loaded` 和 `done` 用 `created_at`；`submitted` 和 `user` 这两个 `LogAction` 带 `at`（类型上必填），由 `LiveConversation` 用 `ports.now` 盖上。后端接住一条打出去的话（`user` 确认未确认的回合）时，保留提交时的时间。
- `ConversationView` 删掉了 `opened`、`pageError`、`isCollapsed`、`isPickingMic` 这几个 state，以及打开对话的 effect、两个 phase effect、`seen` 计数刷新和 `useEntryTimes`。现在只用一个 effect 按 `character.id` 建实例，卸载时 `dispose()`。`useShownCall`、目录的 `setCall` 镜像 effect、`isFullScreen`、`isReducedMotion` 和 `<audio>` 的接线照旧。`CallLayer`、`MicSheet`、`CallNote` 没有改动。

**留给实现者的两个决定**
1. 打开过程中 dispose，而对话已经新建：**仍然调用 `onListChanged`**。对话已经在后端建好，列表里她那一行应该变成「新的对话」；页面本身不再收到任何快照更新。同样，离开页面后仍在进行的文字回合收到 `done` 时，也会调用 `onListChanged`，因为回合确实记下了。这两种情况都有测试覆盖。
2. 进行中回复的 `at`：**用开始的时刻**，也就是和用户那条同一个时间，这样 `Entry.at` 可以保持为必填的 `string`。页面上进行中的回复本来就不显示时间，`done` 之后换成后端的 `created_at`。

**偏差和说明**
- 快照里的"打开中"用 `status` 三态表示，没有另加一个布尔值，所以"打不开"的空状态直接判断 `status === "failed"`。
- 开发模式下 React StrictMode 会让 effect 跑两次，新用户第一次进入角色页时会建出两个对话（手动验证时看到了两次 `POST /api/conversations`）。改动前也是这样：旧 effect 的 `cancelled` 只拦住了 setState，拦不住 `createConversation`。生产构建不会重复执行 effect，这里没有处理。

**测试结果**
- `npm test`：17 个文件、217 个测试全部通过，其中 `liveConversation.test.ts` 和 `conversationLog.test.ts` 共 92 个。新测试先写，跑出 79 个失败后才开始实现。
- `npm run typecheck` 通过。`package.json` 里没有 lint 脚本。
- 手动验证：在本地起后端（:8010）和前端（:3010），用 playwright-core 驱动 Chromium，使用假麦克风。新用户进入櫻木真乃的页面，会自动新建对话。发一句话，提交后 1 秒内 `GET /api/conversations/latest` 的次数不变，回复流结束时正好多一次。气泡下显示 9:35，和后端记下的 `created_at`（01:35 UTC）一致。电话能接通；收起后出现便利贴和「回到通话」，点它会展开；挂断后变回电话键，再拨号时通话层直接展开。"收起时因故结束会自动展开"和"麦克风列表自动关上"这两条没有手动验证，由单元测试覆盖。

### 2026-09-28 review 后的决定

用户看过实现记录后决定：
1. **开新对话时清空草稿**，和改动前一致。上一条记录里"草稿保留"的差异已经取消，并补了测试。
2. **对话没打开时，发送键和电话键都禁用**。开新对话的过程中，`status` 回到 `opening`（去掉了内部的 `starting` 标记），成功后变回 `open`；失败时也变回 `open`，原对话保留，原因写进 `failure`。页面上发送键跟着 `ChatComposer` 的 `isDisabled` 禁用，电话键用 `IconButton` 的 `isDisabled`，两者的条件都是 `status !== "open"`。`LiveConversation` 里 `submit` 和 `startCall` 的忽略保护保留。开新对话时旧对话的消息留在原处，不换成加载圈；只有首次打开、还没有任何消息时才显示加载圈。补了测试：开新对话的过程中快照是 `opening`，发送和拨号都不会发出。
3. **StrictMode 下建出两个对话不处理。**

`npm test`：17 个文件、219 个测试全部通过。`npm run typecheck` 通过。

### 2026-09-28 代码审查后的修改

1. **离开页面后不再新建对话**：打开过程中，如果 `listConversations` 返回时页面已经 dispose，而她又没有对话，就不再调用 `createConversation`，也不会调用 `onListChanged`。如果 dispose 发生在新建的途中，维持原来的决定：对话已经在后端建好，仍然调用 `onListChanged`。两种情况各有一条测试，其中后一条改为先等 `createConversation` 开始后再 dispose。
2. **通话层规则抽成纯函数**：新建 `withCallScreenRules(before, next)`，拨号或因故结束时展开，不在 `connected` 时关掉麦克风列表。`update()` 只调用它。
3. **打开状态改成带标签的联合类型**：快照的 `status` 改为 `conversation: OpenState`，其中 `OpenState = { status: "opening" } | { status: "open" } | { status: "failed"; failure }`。"打不开"的原因只挂在 `failed` 上。打开以后的错误（回合失败、开新对话失败、通话中的回合出错）仍然走快照的 `failure`：它们发生时对话仍是 `open`，要和对话并存显示；如果并进联合类型，`open` 也得带一个可选的 failure，打开后的错误通道会变得别扭。所以打开失败时，快照的 `failure` 是 null。组件里的 `status === "failed" && failure` 改为 `conversation.status === "failed"`，直接取 `conversation.failure`。
4. `submit` 和 `startCall` 里重复的检查合成了 `openConversationId()`：对话打开时返回它的 id，否则返回 null。
5. `ConversationView.tsx` 里 `onOpenChange` 的参数改名为 `open`，不再遮蔽外层的 `isOpen`。
6. 私有方法改名：`opened()` 改为 `showConversation()`，`started()` 改为 `createConversation()`，`turnEvent()` 改为 `applyTurnEvent()`，`stamp()` 改为 `isoNow()`，`ready()` 并进了 `openConversationId()`。这样也不再和 `conversationLog.ts` 里的 `opened()` 重名。

以下几点按审查意见维持不变：Ports 不合并，构造时就开始打开，「电话键」的叫法不改。`npm test`：17 个文件、220 个测试全部通过。`npm run typecheck` 通过。
