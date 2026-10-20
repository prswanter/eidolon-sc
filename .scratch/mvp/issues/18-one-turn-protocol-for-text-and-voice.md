# 18: 文字回合和通话共用同一套回合协议

**What to build:** 让对话引擎直接产出回合的协议事件（`user → delta* → done | error`），由它统一执行输入规则和失败处理；文字回合的 SSE 和通话的 RTVI 只负责转发。顺带修掉语音转写不受输入长度上限约束的问题。

**Blocked by:** —

**Status:** resolved

## 背景（2026-09-26，架构体检候选 1）

引擎的对外接口只到 `SegmentDelta | TurnDone`，文字回合（`app.py` 的 `text_turn`）和通话（`call.py` 的 `CallTurns._turn`）各自把它映射成 `{"type": ...}` 事件、各自捕获异常并发出同一句「角色暂时无法回复，请稍后再试。」。输入长度上限 `MAX_INPUT_LENGTH` 只是引擎里的常量，引擎并不检查：

- 文字回合靠 `TurnInput` 的 pydantic 校验返回 422，但一个空格也能通过 `min_length=1`；
- 通话中打的字被静默截断（`data["text"][:MAX_INPUT_LENGTH]`）；
- **语音转写完全不检查长度**；
- 前端输入框另外写死了 `maxLength={2000}`。

另外 `CallTurns` 把失败的回合也算进单次通话的回合上限，与「失败的回合不计入限额」不一致。

## Comments

### 决定（2026-09-26，grill-with-docs）

- **加深引擎本身，不新建模块**：`ConversationEngine.turn` 就是回合的唯一入口；在它上面再包一层只会是转手。
- **一条输入规则，由引擎执行，不区分来源**：去掉首尾空白后必须在 1 到 `MAX_INPUT_LENGTH`（2000）字之间，否则拒绝，不截断。超长提示「这句话太长了，最多 2000 字。」，空白提示「没有收到要说的话。」。
- **被拒绝和失败的回合形状一样**：`user → error`。每个回合都以 `user` 开头，以 `done` 或 `error` 结束；被拒绝或失败的回合不留记录。引擎捕获异常、记日志、产出 `error`（沿用「角色暂时无法回复，请稍后再试。」），不再向调用方抛出。
- **文字回合也发 `user` 事件**，SSE 照样转发；现在的前端文字路径会忽略它，不需要改。
- **事件是带 `type` 字段的 dataclass**，`asdict(event)` 就是发出去的内容：`UserSaid`、`SegmentDelta`（加一个默认值为 `"delta"` 的 `type` 字段）、`TurnDone`、`TurnFailed`。
- **HTTP 不再返回 422**：`TurnInput` 去掉长度校验，超长或空白的请求得到 `user → error` 的事件流，并退还限额。
- **只有以 `done` 结束的回合计入单次通话的回合上限**。
- **通话仍在调用引擎前丢掉空白的转写**：那是语音噪音，不是用户说了话。
- 术语「回合 (Turn)」已写进 `CONTEXT.md`。

## Agent Brief

**Category:** refactor（含一个 bug 修复）
**Summary:** 对话引擎产出完整的回合协议事件，文字回合和通话变成只转发的适配器

**Current behavior:**
`ConversationEngine.turn` 产出 `SegmentDelta | TurnDone`，失败时抛异常；输入长度由各调用方用不同方式处理，语音转写不受限制。`text_turn` 和 `CallTurns._turn` 各有一份相同的事件映射和错误处理。

**Desired behavior:**
- 引擎的每个回合依次产出：`UserSaid(text)`（去掉首尾空白后的输入）→ 零到多个 `SegmentDelta` → `TurnDone(message)` 或 `TurnFailed(message)`，且结束事件之后不再有事件。
- 输入去掉首尾空白后为空或超过 `MAX_INPUT_LENGTH`，产出 `user → error`，不调用模型、不检索、不记录、不写记忆。
- 模型出错或回复为空时产出 `user → delta* → error`，对话里不留半个回合（与现在一致），日志记下异常。
- `text_turn`：每个事件 `asdict` 后按 SSE 发出；看到 `TurnFailed` 就退还限额。
- `CallTurns`：每个事件 `asdict` 后作为 RTVI 服务器消息发出，`ja` 的 delta 照旧送 TTS；只有以 `TurnDone` 结束的回合计入回合上限；空白转写仍在进入引擎前丢掉；不再截断通话中打的字。
- 前端不改。

**Key interfaces:**
- `engine.py`：`UserSaid`、`TurnFailed`，`TurnEvent = UserSaid | SegmentDelta | TurnDone | TurnFailed`；`turn()` 不再抛出普通异常。
- `reply_format.py`：`SegmentDelta` 增加 `type: Literal["delta"] = "delta"`。
- `app.py`：`TurnInput.text` 去掉 `min_length/max_length`。

**Acceptance criteria:**
- [x] 一句超过 2000 字的语音转写得到 `user → error`，不留记录，不计入单次通话回合上限。
- [x] 文字回合超长或只有空白时得到 `user → error` 的事件流（HTTP 200），限额被退还。
- [x] 通话中打的超长文字被拒绝而不是截断。
- [x] 成功的文字回合事件流以 `user` 开头、`done` 结尾。
- [x] 失败的回合在两条路径上都以 `error` 结束，且不留记录；文字回合退还限额。
- [x] 失败的通话回合不计入单次通话回合上限。
- [x] 协议行为（顺序、拒绝、失败）在引擎的接口上测试；`test_text_turn`、`test_call_turns` 只保留各自传输层的测试，删掉重复的。
- [x] 后端全部测试、lint 和类型检查通过。

**Out of scope:**
- 前端合并两条路径的对话记录处理（架构体检候选 6）。
- `Call.character` 与引擎各自解析角色（目的不同，不改）。
- 前端 `maxLength={2000}` 改为引用后端数值。

### 实现（2026-09-26）

- `engine.py`：新增 `UserSaid`、`TurnFailed`，`TurnDone` 和 `SegmentDelta` 都带 `type` 字段，`asdict(event)` 就是发给浏览器的事件。`turn()` 先去掉首尾空白并产出 `user`，空白或超长直接产出 `error`；其余交给 `_reply()`，其中的异常被捕获、记日志后产出 `error`。写入回合记录前先算好当地时间，记录之后不再有会失败的步骤。
- `app.py`：`text_turn` 只把事件按 SSE 转发，看到 `error` 就退还限额；`TurnInput` 去掉长度校验。
- `call.py`：`CallTurns._turn` 只转发事件，把 `ja` 的 delta 送 TTS，并返回回合是否以 `done` 结束；只有成功的回合计入单次通话的回合上限。通话中打的字不再截断；空白转写仍在进入引擎前丢掉。
- 测试：新增 `test_turns.py`，在引擎的接口上测拒绝（超长、空白）、成功回合的事件顺序、失败回合（模型出错、空回复）；`test_call_turns` 用一个测试覆盖「被拒绝和失败的回合不计入上限，通话继续」，替换原来的失败回合测试；`test_text_turn` 删掉两个与引擎测试重复的失败测试，并断言事件流以 `user` 开头；`test_rate_limit` 的退还限额测试扩展到被拒绝的回合。
- 后端 254 个测试通过，pyright 0 错误；ruff 只有原有的两处报错（`corpus.py` E741、`llm/anthropic.py` F401），与本票无关。
- 审查中讨论后保留的两点：被拒绝的超长输入在 `user` 事件里原样回显（Q7 的统一形状；浏览器前端本来就拦在 2000 字）；`SegmentDelta` 的 `type` 字段放在 `reply_format.py`（Q11）。
