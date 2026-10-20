# 04: 对话列表订阅同一个 LiveConversation

**What to build:** 对话列表照旧这样：
- 通话中那位角色的一行显示「正在呼叫」或计时；
- 隐藏了那位角色时，那一行照旧留着；
- 通话中点别的角色、进设置或记忆、回列表，先问一句会不会挂断；
- 不在通话中时离开，不被拦下。

现在对话页每次转换都在 effect 里把通话状态抄一份给列表，列表读的是副本。改成对话页把 LiveConversation 交给列表一次，列表自己订阅同一份快照，`leave()` 在点击的那一刻读它。这是去掉一份重复的状态，不算修 bug：「`leave()` 读到旧值」实际几乎碰不到。

背景见 `../spec.md`（「对话列表订阅同一份快照」）。

**Blocked by:** None (can start immediately)

**Status:** resolved

## 已定的设计（2026-10-11 grilling，详见 spec）

- 对话页建好 LiveConversation 后交给列表的外壳（Directory），离开时收回。这一步和建它、dispose 它放在同一个 effect 里。
- LiveConversation 对外说明它是哪位角色的对话。
- Directory 自己订阅交来的那个 LiveConversation：列表那一行、隐藏时保留通话中的角色，都从快照里进行中的通话算出来。
- 删掉 Directory 上的 `setCall`，以及对话页里抄状态的那段 effect。
- 不由 Directory 来建 LiveConversation。
- 只改对话页交出对象的那一处和 Directory，不碰 02、03 改的地方。
- 和 01 都会改对话页里建 LiveConversation 的那段 effect，合并时手工对一下。

## 验收

- [ ] `liveConversation.test.ts` 补一条：LiveConversation 说明的角色，就是建它时给的那位。
- [ ] Directory 上没有 `setCall`，对话页没有抄通话状态的 effect。
- [ ] `vitest`、`tsc`、`sh scripts/check-discipline.sh` 通过。
- [ ] 人工验收清单写进 Comments：在构建版前端、电脑宽度下核对：
  - 拨号时列表那一行显示「正在呼叫」，接通后计时；
  - 隐藏通话中的那位角色，那一行照旧留着；
  - 通话中点别的角色，先弹确认；取消后通话照旧，确认后挂断并切过去，列表那一行恢复成平常的样子；
  - 不在通话中时点别的角色，直接切过去；
  - 窄屏下通话中点返回，同样先弹确认。

## Comments

### 实现说明（2026-10-11）

- `liveConversation.ts`：`characterId` 从 `private readonly` 改成公开的 `readonly`，对外说明这是哪位角色的对话。
- `ConversationDirectory.tsx`：`Directory` 去掉 `setCall`，换成 `handOver(live: LiveConversation | null)`（对话页建好后交给列表一次、离开时交回 null）；`DirectoryProvider` 保存交来的实例，用 `useSyncExternalStore` 订阅它的 `snapshot`/`subscribe`，`call: CallInList` 从快照里进行中的通话算出（仍暴露算好的 `call`，所以 `ConversationList` 不用改）。`leave()` 改成在点击那一刻读 `live.snapshot().call` 判断通话是否在进行。没有 LiveConversation 交来时用模块级的空快照 `NOT_OPEN` 兜底。
- `ConversationView.tsx`：在建 LiveConversation 的同一个 effect 里 `handOver(conversation)`，cleanup 里 `handOver(null)` 后再 `dispose()`；删掉原来每次转换都抄状态给列表的两个 effect。对话页自己仍保留 `live` state 供本页订阅（`setLive`），所以交出的是 `handOver`。
- `ConversationList.tsx` 未改：`call` 的形状（`CallInList`）和来源都不变，只是现在由 Directory 从快照算出来。
- 命名说明：入口原本想叫 `setLive`，但对话页自己已有一个 `setLive`（本页 state 的 setter），会撞名，故取名 `handOver`，语义是「把这通对话交给列表 / 收回」。
- 与票 01 的重合处：票 01 会在同一个建 LiveConversation 的 effect 里加 `tones` port。本票在这个 effect 里加的是 `handOver` 调用与 cleanup，合并时两处改动并存即可，不冲突。
- 不碰的部分：`CallState` 形状、`tones`、`collapsed`/通话层规则、`useCallTime` 都没动。
- 三项检查：`npm test`（52 文件 / 632 用例）通过；`npm run typecheck` 通过；`sh scripts/check-discipline.sh` 通过。

### 人工验收清单

在构建版前端（`frontend/` 下 `npm run build` 后 `npm start`）、电脑宽度（≥ 768px 双栏）下核对：

1. 打开一位角色的对话，点页首电话键拨号：左侧列表里这位角色那一行显示「正在呼叫…」。
2. 接通后：同一行变成通话计时（mm:ss），每秒走。
3. 通话进行中，右键（或长按）这一行把它隐藏；这一行照旧留在列表里（通话中的角色不因隐藏消失），显示照旧。
4. 通话中点列表里另一位角色：先弹出「会不会挂断」确认框。
   - 点「留下/取消」：确认框关掉，原通话照旧继续，列表那一行仍显示计时。
   - 点「挂断并离开」：切到新角色，原那一行恢复成平常的样子（最后一句预览，不再是计时）。
5. 不在通话中时点另一位角色：直接切过去，没有确认框。
6. 窄屏（< 768px）下通话中点页首返回键：同样先弹确认框；取消留下通话，确认则挂断回到列表。

（另：换角色、点更多菜单里的「记忆」「设置」也会经同一套 `leave()`，行为与上面第 4 条一致。）

### 代码审查后的改动（2026-10-11）

验收第一条要的测试「LiveConversation 说明的角色，就是建它时给的那位」删掉了，连同 `opening` 辅助里只给它用的 `characterId` 选项（974ad54）。它只断言构造参数原样从 `readonly characterId` 读回，是 `CODING_STANDARDS.md`「Tests」里的 Holds by construction：类型和语法已经保证，测试守不住任何行为。列表用 `live.characterId` 显示那一行，由人工验收第 1、2 条核对。用户同意不再要这条测试。
