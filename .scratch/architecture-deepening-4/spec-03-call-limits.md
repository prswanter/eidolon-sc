# 架构加深（第四轮）：通话的上限与收尾归 CallOutcome

Status: resolved

术语以 `CONTEXT.md` 为准，本轮不改词表。设计词汇（module、interface、seam、adapter、depth、locality）取自 `codebase-design` skill。这是 2026-10-02 架构审查里的候选 1，经 grilling 定下设计。只改 `backend/`，和 ticket 01、02 不碰同一个文件，可以和 01 并行。

## Problem Statement

一通电话到了时长上限或回合数上限就挂断，浏览器收到 `ended` 消息，说明原因、算不算限额（CONTEXT.md「限额」「接通」）。这条规矩现在分在 `CallTurns`（`call.py`）和 `CallOutcome`（`call_outcome.py`）两处：

- **回合数记了两份**：`CallTurns._recorded` 用来判断回合上限；`CallOutcome._recorded` 只用来判断「一个回合都没记下」，即故障时这通算不算接通了。两份在 `call.py` 里相邻两行一起加。
- **`ended` 的文案拆成两半**：前半句（「这次通话已经满 N 分钟了」「这次通话已经说了 N 轮了」）在 `CallTurns` 里拼好，作为参数交给 `CallOutcome.limit_reached(reason, why)`；后半句（「，先挂断啦。想接着聊可以重新拨打。」）和 counts 在 `CallOutcome`。
- **上限的判断在 `CallTurns`**：回合上限的比较、「时间到了」的标记都在跑 Pipecat 的那个 processor 里，只能用整条 pipeline 测：时长上限要用 0.1 秒的上限加 `SleepFrame` 去等。`test_call_outcome.py` 虽然有纯测试，测的 `why` 却是测试自己传进去的。

## Solution

上限、回合计数和完整的 `ended` 文案都归 `CallOutcome`：它构造时收下这通电话的上限，`CallTurns` 只报告发生了什么（接通、记下一个回合、时间到了），在回合之间问一句「到上限了没有」，到了就照它给的消息挂断。

## User Stories

1. 作为用户，我想通话说满回合数上限时，最后那句回复照常念完再挂断，结束页的说法和以前逐字一样。
2. 作为用户，我想通话到了时长上限时，正在进行的回复照常说完再挂断，结束页的说法和以前逐字一样。
3. 作为用户，我想通话时长从接通开始算，和通话界面上的计时一致。
4. 作为用户，我想失败或被拒绝的回合不算进回合数上限。
5. 作为用户，我想到了上限挂断的通话照常算一次限额；只用自带密钥时结束页说明它不算。
6. 作为开发者，我想回合数只记一份，这样「算不算接通」和「到没到回合上限」不会各数各的。
7. 作为开发者，我想用纯测试覆盖上限的规矩和完整的结束文案，不跑 Pipecat、不等真实时间。
8. 作为开发者，我想 `CallTurns` 不再知道上限是多少、文案怎么说，只管什么时候报告、什么时候挂断。

## Implementation Decisions

- **`CallOutcome` 收下 `CallLimits`**：构造函数多一个参数（`Calls.start` 把 `self._limits` 交给它）。回合数只在 `CallOutcome` 里记一份。
- **`CallTurns` 不再收 `limits`**：删掉 `_recorded`、`_time_up`、回合上限的比较和文案。
- **`CallOutcome` 的 interface**：
  - `connected()`、`turn_recorded()`、`time_up()`：只报告，返回 None，和现有的事件方法一个写法。`time_up()` 是新的。
  - `time_limit: timedelta | None`：这通电话可以多长，给 `CallTurns` 的计时用。
  - `limit_reached() -> LimitReached | None`：不带参数。没到上限返回 None；到了返回 `LimitReached(why, ended)`：`why` 交给 `EndWorkerFrame` 当 reason，`ended` 是发给浏览器的完整消息，浏览器已经被告知过结束原因时为 None（照常挂断，不再发消息）。
  - 时间到了和回合满了同时成立，先报时间：和现在被叫醒后的判断顺序一致。
- **时间到了是一个事件，不是用 Clock 比较**：`CallTurns` 的计时任务照旧在接通后 `asyncio.sleep`，时长从 `outcome.time_limit` 读，醒来调 `outcome.time_up()`，再叫醒处理回合的循环。不用「现在减去接通时刻」判断：`asyncio.sleep` 按单调时钟、`datetime.now` 按墙上时钟，醒来那一刻若判成「还没到」，就没人再叫醒循环，通话会一直不挂断。不注入 sleep，不用 fake clock。
- **`CallTurns` 什么时候问**：一个回合完全结束之后，以及被计时任务叫醒时，调 `outcome.limit_reached()`；拿到 `LimitReached` 就照现在的 `_end` 收尾（先让 `TurnTaking` 进入结束，再发 `ended`，再推 `EndWorkerFrame`）。
- **不动的**：
  - `TurnTaking.ending` 照旧由处理回合的循环从外面读，用来跳过已经排进队列、通话却在结束的回合。挪进 `TurnTaking` 会让 `_turn` 等不到回合结束而卡住，而且它和上限无关。
  - `Calls.ice_servers` 报的 `maxCallSeconds`：只是读同一份 `CallLimits`。
  - `ended` 消息的形状和文案逐字不变，前端不动。
  - `CallOutcome` 其余的规矩（拿走和退还限额、只告知一次、故障时算不算接通）。

## Testing Decisions

- 好的测试经由 `CallOutcome` 的 interface 断言：构造（带上限）、报告事件、看 `limit_reached()` 返回什么、看限额有没有退还。照现有 `test_call_outcome.py` 的 `limiter` fixture 写，fixture 的 `call(...)` 要能带上限。
- **`test_call_outcome.py` 新增纯测试**：
  - 回合数到上限才返回 `LimitReached`，没到返回 None；
  - `time_up()` 之后返回带「这次通话已经满 N 分钟了」的完整文案；
  - 两个上限同时成立，先报时间；
  - 没有上限，永远返回 None；
  - 浏览器已被告知过（比如语音服务先出了故障），`ended` 为 None，`why` 照给。
- **改走新的 interface**：现有把 `why` 当参数传给 `limit_reached` 的三条测试（`test_a_call_that_reaches_its_limits_is_kept`、`test_a_call_that_reaches_its_time_before_any_turn_is_kept`、`test_the_browser_is_told_why_only_once`），改成带上限构造、报告事件，文案断言写全。「只告知一次」那条里，告知过之后的 `limit_reached()` 断言改成 `ended` 为 None。上面「已被告知过」那条新测试若与它重合，合成一条，不叠加。
- **`test_call_turns.py`**：
  - 删掉 `test_a_call_on_the_users_own_keys_alone_says_it_does_not_count_when_it_ends`：exempt 不计数是 `CallOutcome` 的规矩，已有纯测试。
  - 保留下面四条作为接线测试，只断言 `reason` 和消息顺序，不再断言文案字句：最后一个回合念完才挂断、时间到了在当前回合结束后挂断、时长从接通开始算、失败的回合不计数。
- 先写会失败的测试（`/tdd`），再改实现。`backend/` 下 `pytest` 全部通过。

## Out of Scope

- `TurnTaking.ending` 的读取方式、`maxCallSeconds` 的换算。
- 前端和 `ended` 消息的形状、文案。
- 上限的配置（`UsageLimits.call_minutes`、`turns_per_call`）。
- 审查里的候选 4（数据库 module）等其他候选。
- 不改 `CONTEXT.md`，不写 ADR。

## Further Notes

- 人工验收清单见 ticket 03。
