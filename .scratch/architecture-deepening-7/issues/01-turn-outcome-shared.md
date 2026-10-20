# 01: 回合结果一处判定，文字回合和通话回合共用

**What to build:** 一个回合一份 `TurnOutcome`，文字回合和通话回合（`CallTurns`）都把事件喂给它，由它判定成功、失败、被拒绝、离开，记下「开口」，只收尾一次。引擎对空输入、太长的输入改发 `TurnRejected`，被拒绝不再靠比较提示文字。

对用户和管理者没有变化：结果、限额、浏览器收到的事件、看板都和现在一样；只是输入为空或太长的回合，即使改了提示文字也始终记为被拒绝。背景见 `../spec.md`。

**Blocked by:** None (can start immediately)

**Status:** resolved

## 已定的设计（2026-10-08 grilling，详见 spec）

- **`TurnOutcome`** 每个回合一份。构造时给它这个回合的运行记录，和收尾时把结果交给谁：文字回合交给 `Admission.settle`，通话回合交给回合记录的 `finish`。
  - `see(event)`：完成为成功，`TurnRejected` 为被拒绝，`TurnFailed` 为失败；以最后一个结果为准（补充后重新回复的回合）。不再因 `SegmentDelta` 自己记开口。
  - `began_speaking()`：只算第一次，记下「到开口」（运行记录的 `spoke()`）。
  - `over(cut_short_by_failure: bool)`：有结果用结果；没有的，`cut_short_by_failure` 为真记失败，否则记离开。只收尾第一次。
- **文字回合**：照旧包住整个回合，回复的第一句出现时调 `began_speaking()`，结束时（包括还没开始就离开）调 `over(False)`。
- **通话回合**：`CallTurns` 每个回合造一份 `TurnOutcome`（经 `CallOutcome.turn_begun`），把回合事件喂给它；不再自己存 `_result`。被截断时暂时仍用 `CallOutcome.turn_cut_short()` 得出 `cut_short_by_failure`（02 再换掉）。「开口」暂时仍在原来两处（`BotStartedSpeakingFrame`、只看文字的 `SegmentDelta`），只是改为调 `began_speaking()`（03 再换掉）。
- **`TurnRejected`**：进入 `TurnEvent`，发给浏览器时和 `TurnFailed` 一样是 `type: "error"` 加 `message`。
- 删掉独立的 `turn_result()`。

## 验收

- [x] `TurnOutcome` 有新的纯单元测试，表驱动：各种事件序列 × 是否因故障截断 → 结果；最后一个结果为准；只收尾一次（第二次 `over` 不起作用、不再交结果）；开口只记第一次，没开口的没有「到开口」。
- [x] 引擎对空输入、太长的输入发 `TurnRejected`，浏览器收到的仍是 `{"type": "error", "message": ...}`，文字和现在相同。
- [x] 文字回合和通话回合里，被拒绝的回合记为被拒绝、不计入限额；代码里不再有比较 `BLANK` / `TOO_LONG` 字符串来判定结果的地方。
- [x] 现有测试的断言不改就全部通过；如果哪条必须改，在 Comments 里写明原因。
- [x] `backend/` 下 `pytest` 全部通过，`ruff` 和 `pyright` 没有新的报错。
- [x] **人工验收（留给用户）**：本地起服务，确认：
  - 文字回合正常回复；发一段超长的话，提示「这句话太长了」，看板记为被拒绝；
  - 通话里说几句、打断一次，看板上回合的结果和「到开口」照常记录。
