# 01: 取消超时后，通话已经收尾，`CallTurns` 的后台任务仍在运行

**Status:** needs-triage

**发现于：** 2026-10-08，`architecture-deepening-7` grilling 时子 agent 复现（未提交的探针测试）。

## 现象

通话被取消时，`CancelFrame` 如果在 `CallTurns` 或它上游（transport input、STT、UserTurnProcessor）卡住超过 Pipecat 的取消超时（`CANCEL_TIMEOUT_SECS`，20 秒），PipelineWorker 不再等，`run` 照样返回，`_LiveCall` 接着收尾通话。这时 `CallTurns` 还没收到 `CancelFrame`，`_stop_worker` 没跑，它的 worker（以及可能进行中的回复、情绪判断）仍在运行，没有人取消。

回合结果的那一半（被截断的回合写成「离开」）由第七轮修掉：`CallOutcome` 收尾时用回合判定收掉开着的回合。这里只剩后台任务没被清理。

## 复现方式

管道 `[卡住 CancelFrame 的处理器, CallTurns]`，`cancel_timeout_secs=0.5`，LLM 回复里放 HANG，cancel 之后 settle 已经发生，而 `CallTurns` 的 worker 仍未结束。

## 待定

- 实际是否会卡住超过 20 秒（哪个上游处理器可能卡）。
- 通话收尾时是否应主动停掉 `CallTurns`，还是交给 Pipecat。
