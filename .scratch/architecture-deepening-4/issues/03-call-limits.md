# 03: 通话的上限与收尾归 CallOutcome

**What to build:** 通话的时长上限、回合数上限、回合计数和完整的 `ended` 文案都归 `CallOutcome`（`backend/src/eidolon/call_outcome.py`）。`CallTurns`（`backend/src/eidolon/call.py`）只报告接通、记下一个回合、时间到了，在回合之间问一句到上限了没有，到了就照它给的消息挂断。浏览器收到的消息逐字不变。背景和取舍见 `../spec-03-call-limits.md`。

**Blocked by:** None (can start immediately)。只改 `backend/`，可以和 01 并行，各开一个 worktree。

**Status:** resolved

## 已定的设计（2026-10-02 grilling）

- **`CallOutcome` 构造时收下 `CallLimits`**（`Calls.start` 交给它），回合数只在这里记一份。
- **`CallTurns` 不再收 `limits`**：删掉 `_recorded`、`_time_up`、回合上限的比较和文案。
- **`CallOutcome` 的 interface**：
  - `connected()`、`turn_recorded()`、`time_up()`（新）：只报告，返回 None。
  - `time_limit: timedelta | None`：给 `CallTurns` 的计时用。
  - `limit_reached() -> LimitReached | None`：不带参数。没到上限返回 None；到了返回 `LimitReached(why, ended)`，`why` 给 `EndWorkerFrame` 当 reason，`ended` 是完整的浏览器消息，已经告知过时为 None。
  - 时间到了和回合满了同时成立，先报时间。
- **计时**：`CallTurns` 接通后照旧 `asyncio.sleep(outcome.time_limit)`，醒来调 `outcome.time_up()`，再叫醒处理回合的循环。不用 Clock 比较时间（单调时钟和墙上时钟可能差一点，判成「还没到」通话就挂不断），不注入 sleep。
- **`CallTurns` 问的时机**：一个回合完全结束之后，以及被计时任务叫醒时；拿到 `LimitReached` 就照现在 `_end` 的顺序收尾（`TurnTaking` 进入结束 → 发 `ended`（有的话）→ 推 `EndWorkerFrame`）。
- **不动的**：`TurnTaking.ending` 的外部读取、`Calls.ice_servers` 的 `maxCallSeconds`、`ended` 消息的形状和文案、`CallOutcome` 其余的规矩、前端。
- **不改 `CONTEXT.md`，不写 ADR**。更新 `CallOutcome` 和 `CallTurns` 的 docstring：上限和文案在 `CallOutcome`。

## 验收

- [x] **按 TDD**：先在 `test_call_outcome.py` 写下面的纯测试，看到它们失败，再改实现。`limiter` fixture 的 `call(...)` 要能带上限。
- [x] **新增纯测试**：
  - 回合数到上限才返回 `LimitReached`，没到返回 None；
  - `time_up()` 之后返回带「这次通话已经满 N 分钟了，先挂断啦。想接着聊可以重新拨打。」的完整消息；
  - 两个上限同时成立，先报时间；
  - 没有上限，永远返回 None；
  - 浏览器已被告知过，`ended` 为 None，`why` 照给。
- [x] **改走新的 interface，不叠加**：`test_a_call_that_reaches_its_limits_is_kept`、`test_a_call_that_reaches_its_time_before_any_turn_is_kept`、`test_the_browser_is_told_why_only_once` 改成带上限构造、报告事件，文案断言写全；和新测试重合的合成一条。
- [x] **`test_call_turns.py`**：
  - 删掉 `test_a_call_on_the_users_own_keys_alone_says_it_does_not_count_when_it_ends`；
  - 保留 `test_call_hangs_up_after_its_last_allowed_turn`、`test_call_hangs_up_when_time_is_up_once_the_reply_in_progress_is_done`、`test_a_calls_time_is_counted_from_when_it_connects`、`test_turns_that_fail_or_are_rejected_do_not_count_and_the_call_goes_on`，只断言 `reason` 和消息顺序，去掉「2 轮」「分钟」这类文案断言。
- [x] `CallTurns` 里不再有回合计数、上限的比较和任何 `ended` 文案；`CallOutcome` 是唯一数回合的地方。
- [x] `backend/` 下 `pytest` 全部通过。
- [x] **人工验收（留给用户）**：把时长上限和每通回合数临时调小，打真实电话；用户验过之后再标 `resolved`。
  - 说满回合数：最后那句念完才挂断，结束页文案和以前逐字一样，限额照常计数；
  - 到了时长：正在说的回复说完才挂断，结束页文案和以前逐字一样；
  - 只用自带密钥时，结束页说明这一通不算限额。

## Comments

### 2026-10-02 实现（agent）

- `CallLimits` 从 `call.py` 挪到 `call_outcome.py`：`call.py` 本来就引用 `call_outcome.py`，`CallOutcome` 要收下它只能放在这边，否则循环引用；`call.py` 从这里引用，测试也改从这里引用。新增 `LimitReached(why, ended)`。
- `CallOutcome(usage, user_id, exempt, limits)`；新增 `time_up()`、`time_limit`、`limit_reached()`（先看时间，再看回合；文案和 counts 都在这里）。`CallTurns` 不再收 `limits`，删掉 `_recorded`、`_time_up`、回合上限比较和文案；回合循环在每个回合结束后、以及被计时任务叫醒（`None`）时问一次 `limit_reached()`，拿到就 `_end(limit)`，顺序照旧。`_LiveCall` 也不再收 `limits`。
- TDD：先写新测试，第一次跑是收集时 ImportError（`call_outcome` 里还没有 `CallLimits`、`LimitReached`）；只挪 `CallLimits`、加上 `LimitReached` 类型并让构造函数收下 `limits` 之后再跑，新写/改写的 9 条失败、其余 15 条通过，失败原因是 `CallOutcome` 没有 `time_limit`、`time_up`，以及 `limit_reached()` 还要两个参数；实现之后全部通过。
- 旧的三条改走新 interface：「到上限算一次」拆成按回合（合并「回合到上限才返回」）和按时间（合并「回合之前时间就到」，并验证 `:g` 的分钟写法 10 和 1.5）两条；「只告知一次」合并「已告知过 `ended` 为 None、`why` 照给」。`test_call_turns.py` 删掉自带密钥那条后，`CallUnderTest` 的 `exempt` 参数没人用了，一并删掉；失败回合那条补上 `reason` 断言。
- 一个时序上的细微差别：以前回合循环在取出每个排队的回合之前先看时间到没到；现在只在回合结束后和被叫醒时问。两种写法只在「计时任务醒来」和「回合循环刚被一个新回合唤醒、还没开始跑」落在同一轮事件循环时才不同：以前那个回合被跳过，现在会先说完再挂断。
- `backend/` 下 `uv run pytest`：853 passed；`uv run pyright`：0 errors。第一次跑完整 pytest 时 `test_fish_segments.py::test_each_segment_is_voiced_in_a_session_of_its_own_announced_as_it_plays` 失败一次，单独跑 5 次都通过、再跑完整套件也通过，它不经过本次改动的代码，看作负载下的时序抖动。

### 2026-10-02 人工验收

用户在本地把单通时长临时设成 2 分钟、回合数设成 3 轮，打了真实电话，验收清单里的各项都没有问题。标为 resolved。
