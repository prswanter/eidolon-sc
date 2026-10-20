# 22: 前端对话记录 module：文字回合与通话共用一个 reducer

**What to build:** 把对话页里两份对话记录归约（文字回合的 `submit` 和通话的 `onCallEvent`）收进一个不依赖 React 的纯 module `conversationLog`，两条路径把同一组回合协议事件喂给它；用 `done.message` 换成落库的回复；没收到 `done` 就中断的回合从页面上撤掉；前端引入 vitest 并补上第一批测试。

**Blocked by:** —

**Status:** resolved

## 背景（2026-09-26，架构体检候选 6）

报告写于 `b564c0d`。ticket 18 之后，文字回合的 SSE 与通话的 RTVI 发出同一套回合协议 `user → delta* → done | error`；通话的回合在后端排队串行，事件不会交错。前端还是两份归约，行为不一致：

| | 文字路径（`submit`） | 通话路径（`onCallEvent`） |
|---|---|---|
| 何时插入回合 | 提交时乐观插入 | 收到 `user` 时 |
| `user` | 忽略 | 开启回合 |
| `done` | 忽略；流结束就当成功 | 只把 `pending` 设为 false |
| `error` | 撤掉，文字回填输入框 | 撤掉，不回填 |
| `done.message` | 丢掉 | 丢掉 |

两个用户看得到的问题：

1. 通话中角色正在回复时挂断或断线：引擎只在回复完整结束后才记下回合，这一回合没有记录，但页面上的半截回复停在 pending 样式里，`callTurn` 也不清空，刷新后才消失。与 `CONTEXT.md`「失败或被拒绝的回合不留记录」相悖。
2. 文字回合的事件流既没有 `done` 也没有 `error` 就结束时被当成成功，而后端没有记下它。

条目的 key 一直是 `pending-…`，内容是流式拼出的段落而不是落库的那条（目前两者一致，属于潜在问题）。前端没有任何测试。

## Comments

### 决定（2026-09-26，grill-with-docs）

- **范围**：只做纯的对话记录 module，修上面两个问题，补测试。不做 wire 事件的运行时校验，不从 OpenAPI 生成类型（事件只来自我们自己的后端，SSE / RTVI 事件也不在 OpenAPI 里）。
- **文字路径保留乐观显示**：提交时插入一个未确认的回合，`user` 事件只做确认（一条 SSE 流只有一个回合，对应没有歧义）。**通话中打的字不乐观显示**：后端排队串行，乐观插入会让新的话出现在仍在继续的上一句回复之下，之后的 `user` 也无法可靠分辨是打的字还是插进来的语音。
- **没收到 `done` 就中断的回合一律撤掉**，与 `error` 一样。断线沿用「通话已断开」（或后端 `ended` 给的理由）；用户自己挂断不提示；文字路径提示「回复中断了，请再试一次」并把文字回填输入框。
- **通话中打的字失败后不回填**（已知，接受）：输入框有 `maxLength=2000` 且会去空白，「太长」「空白」两种拒绝不会发生，只剩服务故障，这时通话多半也要断了；为此给 `user` 事件加来源或在前端按文字匹配都不划算。
- **`done.message`**：回复条目整条换成 `toEntry(done.message)`（key 变为 `m<id>`，段落用落库版本）；用户那条保留临时 key，刷新后自然变成 `m<id>`。不为此改后端协议。
- **测试**：vitest，只测 module，不测 React 组件；`npm test` 脚本；`vitest.config.ts` 把 `@/` 映射到 `src`。
- 不改 `CONTEXT.md`（对话记录是界面状态；「对话」「回合」已够用），不写 ADR（都容易撤回）。

### 实现（2026-09-26）

- 新增 `frontend/src/lib/conversationLog.ts`：`conversationLog(state, action)`、`emptyLog`、`Entry`、`Turn`、`LogAction`；`withDelta`、`toEntry` 随之移入。进行中的回合总是最后两条条目，所以新条目用插入位置做临时 key（`new-<位置>`），reducer 保持纯函数（不用 `Date.now()` / `Math.random()`）。`submitted` 与未确认回合之外的 `user` 都先撤掉进行中的回合，保证最多一个。
- 对话页改用 `useReducer`：文字路径把 SSE 事件原样喂入，流结束时既没有 `done` 也没有 `error` 就提示「回复中断了，请再试一次」；出错、抛错、中断都发 `interrupted` 并回填文字。通话路径把 `ended` 之外的事件喂入；用户挂断和 `onDropped` 都发 `interrupted`。删去 `pendingTurn`、`updateEntry`、`dropTurn`、`callTurn`。
- `api.ts`：`TurnEvent` 补上 `user`，`CallEvent = TurnEvent | ended`。
- vitest 5：`npm test`（`vitest run`），配置文件是 `vitest.config.mts` 而不是 `.ts`——`package.json` 没有 `"type": "module"`，`.ts` 会让 Vite 警告按 CommonJS 加载 ESM；`.mts` 与 Next 的 vitest 指南一致。16 个测试覆盖全部验收条目。
- `npm run typecheck`、`npm run build`、`npm test` 通过。

### 真实服务验证（2026-09-26）

真实对话模型、Soniox、Fish Audio（`s2.1-pro-free`，真乃的音色）、SiliconFlow，`eidolon serve` 与 `next dev` 本机运行；浏览器是 Playwright 驱动的**真实 Chromium**，直接经 WebRTC 接通，没有用 aiortc 脚本。「麦克风」用 `--use-file-for-fake-audio-capture` 播放 SiliconFlow CosyVoice2 合成的中文问句。

- 文字发送：用户条目与 pending 回复 48ms 内出现，流式填入，约 5.6 秒后回复换成落库版本（key 变为 `m<id>`），始终只有一组条目；刷新后一致。
- 通话中说话：`user` 到达时开启回合，回复完成后 key 变为 `m<id>`。通话中打字：提交后不乐观显示，约 100ms 后随 `user` 事件出现并回复。两个回合都落库，刷新后一致。
- 回复到一半挂断：回复条目显示「えっと…「忘」时点「挂断」，半截回复和它的用户条目立即消失，没有错误提示；刷新后也没有，库里没有这一回合。
- 文字流没有 `done` 或 `error` 就结束：用 Playwright 拦截 `/turns`，只返回 `user` 和一个 `delta` 就关闭；回合被撤掉，文字回填，显示「回复中断了，请再试一次」。
- 后端日志没有 ERROR；前端只有一个 `/favicon.ico` 404。开发模式下 StrictMode 让首次进入对话页的 effect 跑两遍、新建两个对话（页面用后一个），与本次改动无关。
- 本机准备：NLTK `punkt_tab` 需从 nltk_data 的 GitHub raw zip 手动解压到 `~/nltk_data/tokenizers/`；SiliconFlow TTS 不接受 48000Hz 采样率，按 44.1k 合成后重采样到 48k。

## Agent Brief

**Category:** refactor（含两个 bug 修复）
**Summary:** 对话页的文字回合与通话把同一组回合事件喂给一个纯的对话记录 reducer

**Current behavior:**
对话页用 `useState` 保存条目，文字回合在 `submit` 里、通话在 `onCallEvent` 里各自手写归约（辅助函数 `pendingTurn`、`withDelta`、`toEntry`，以及 `updateEntry`、`dropTurn`、`callTurn` ref）。两边对 `user`、`done`、`error` 的处理不同；`done.message` 被丢弃；通话挂断或断线时进行中的回复留在页面上；文字事件流没有结束事件时被当成成功。

**Desired behavior:**
- 一个不依赖 React 的 module 导出 reducer `conversationLog(state, action)`，状态为 `{ entries, turn }`：`entries` 是页面显示的条目，`turn` 是最多一个进行中的回合（是否已由 `user` 确认、用户条目与回复条目的 key）。
- action：
  - `{ type: "loaded", messages }`：以已记录的消息替换全部条目，清掉进行中的回合（打开或新建对话时）。
  - `{ type: "submitted", text }`：插入一个未确认的回合（用户条目 + 空的 pending 回复条目）。
  - 回合协议事件原样喂入：
    - `user`：若有未确认的回合则确认它（不新增条目）；否则撤掉任何进行中的回合，再以事件里的文字开启一个已确认的回合。
    - `delta`：按 `segment` 与 `lang` 把文字并进进行中回合的回复条目。
    - `done`：把回复条目整条换成 `done.message` 对应的已记录条目，结束回合。
    - `error`：撤掉进行中回合的两个条目，结束回合。
  - `{ type: "interrupted" }`：同 `error`，撤掉进行中的回合（挂断、断线、文字流未收到 `done` 或 `error` 就结束）。
  - 没有进行中的回合时，`delta`、`done`、`error`、`interrupted` 不改变状态。
- 对话页改用 `useReducer` 驱动这个 reducer：
  - 文字路径：提交时发 `submitted`，SSE 事件全部喂入；以 `error` 结束或请求抛错时由页面显示错误并回填文字（与现在一致）；流结束却没有 `done` 或 `error` 时发 `interrupted`，提示「回复中断了，请再试一次」并回填文字。
  - 通话路径：`user`、`delta`、`done`、`error` 喂入（`error` 照旧显示错误，不回填）；`ended` 仍由页面保存挂断理由；用户挂断和 `onDropped` 都发 `interrupted`，断线时照旧提示「通话已断开」或 `ended` 的理由。
  - 通话状态、`hearing`、静音、错误提示和输入框仍归页面。
- 前端加 vitest（`npm test`），`@/` 别名在测试中可用。

**Key interfaces:**
- `conversationLog(state, action)` 与其状态、action 类型；`Entry` 类型随之移入该 module。
- `TurnEvent`（`api.ts`）：补上 `{ type: "user"; text: string }`，与后端协议一致；`CallEvent` 相应只在其上加 `ended`。
- `package.json`：`test` 脚本与 vitest 开发依赖；`vitest.config.ts`。

**Acceptance criteria:**
- [x] 载入历史消息后，条目与消息一一对应，key 为 `m<id>`。
- [x] 提交后收到 `user`：只有一组用户条目 + 回复条目，没有重复。
- [x] 没有提交时收到 `user`（通话）：开启一个新回合。
- [x] `delta` 按段落与语言合并，两种语言交替到达时各自累加。
- [x] `done` 后回复条目换成落库版本（key `m<id>`、非 pending），进行中的回合清空。
- [x] `error` 与 `interrupted` 撤掉进行中回合的两个条目，其余条目不变。
- [x] 没有进行中的回合时，`delta`、`done`、`error`、`interrupted` 不改变状态。
- [x] 连续两个回合各自完成，互不干扰。
- [x] 通话中角色回复到一半时挂断或断线，半截回复从页面消失。
- [x] 文字事件流没有 `done` 或 `error` 就结束时，回合被撤掉、文字回填、显示「回复中断了，请再试一次」。
- [x] `npm run typecheck`、`npm run build`、`npm test` 通过。
- [x] 手动冒烟：文字发送；通话中说话与打字；回复到一半时挂断。通话若无法在环境里用真实浏览器进行，改用 ticket 20 的 aiortc 浏览器脚本，并在实现记录里写明用了哪种方式。

**Out of scope:**
- wire 事件的运行时校验与 OpenAPI 类型生成。
- 通话中打的字失败后回填输入框（见决定）。
- 通话中打的字乐观显示。
- 用户消息在 `done` 里的 id（后端协议不变）。
- React 组件测试。
- 前端 `maxLength={2000}` 改为引用后端数值。
