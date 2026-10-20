# 09: 运行记录：通话

**What to build:** 每次通话留下一条运行记录：结果（成功、没能接通、因故障中断）、时长、结束原因，以及通话里语音识别、语音合成、判断情绪的每次调用和用量；通话中的回合照常各有一条回合的运行记录，并挂在这次通话下。看板加上通话数和趋势、按角色的通话数、时长和结束原因的分布，以及每分钟自动刷新的进行中通话数。见 `../spec.md` 的「运行记录」一节。

**Blocked by:** 08

**Status:** resolved

- [x] 通话的结果与 GLOSSARY「接通」和限额的计入、退还使用同一个判断（`CallOutcome`），不另写一套。
- [x] 记下时长和结束原因（用户挂断、离开对话页、撞上时长或回合上限、被封禁、故障）。
- [x] 通话中的回合：被打断的回合、补充合并后的回合都按 GLOSSARY 判定结果；放下的那次回复不单独记。
- [x] 埋点：语音识别记音频秒数，语音合成记字符或字节，判断情绪记调用；自带密钥的调用标记出来。Pipecat 管线里的错误要能落到对应服务的出错上。
- [x] 看板接口和页面：通话数和趋势、按角色的通话数、时长分布、结束原因分布、进行中的通话数（直接取内存里的通话表，前端每分钟刷新一次）。
- [x] 测试（HTTP API + fakes，沿用 `test_voice_call.py`、`test_call_outcome.py` 的方式）：接通后正常挂断、没能接通、通话中撞上时长上限、被封禁挂断，各自的结果和结束原因正确；通话中的回合挂在这次通话下；语音合成出错时健康数据里能看到；进行中的通话数在接通和挂断后变化。

## Comments

**实现**（2026-10-07）：通话的运行记录由 `CallOutcome`（`backend/src/eidolon/call_outcome.py`）在接下报价时打开（`ActivityLog.begin("call")`，撞限额的直接记为「被拒绝」），在结算（`settle`）时用决定计入还是退还的同一组状态写结果：没接通，或接通后在第一个回合前因语音服务故障结束 → 没能接通；接通后因语音服务或自带密钥故障结束 → 因故障中断（`failed`）；其余 → 成功。时长从接通算到结算。结束原因取最先发生的那个：告诉浏览器的原因（时长或回合上限、故障），或经 `CallOutcome.ended_by` 报来的（浏览器按「挂断」时先发 `hang-up` 客户端消息 → 用户挂断；轮询发现被封禁 → 被封禁；`Accounts` 删除用户时挂断 → 用户被删除；`Calls.aclose` → 服务重启或关闭；接通超时、搭建失败、管线异常 → 故障），都没有就是离开对话页。通话里的每个回合由 `CallTurns._turn` 经 `CallOutcome.turn_begun` 开一条回合记录（`activity.Recording.turn`，随通话那条一起写入，`call_id` 指向它），结果用和文字回合共用的 `turn_outcome.turn_result`；补充后重新回复仍是同一个回合、放下的回复不单独记，被打断的回合记为成功，通话结束时还没完的回合记为用户离开；开口在有声时取 `BotStartedSpeakingFrame`，只看文字时取第一句字幕。通话里扮演角色的 LLM 和文字回合一样经 `turn_llms` 埋点（`Calls` 多了 `activity` 和 `deployer_llms` 两个参数）。语音识别和语音合成由 `call.py` 的 `CallMeter`（挂在 `PipelineWorker` 上的 Pipecat 观察者）记在通话下：语音识别每通电话一次，计费用量是送去的音频秒数，不记延迟；语音合成每个回复一次，计费用量是送去的日语（连同语气提示）的 UTF-8 字节数，延迟是第一段文字到第一段音频；`on_pipeline_error` 收到的每个 `ErrorFrame` 按来源处理器落到语音识别或语音合成的出错上（`frame_error_kind` 先看异常，再看 Pipecat 的 `ErrorCategory`）；自带密钥按 `CallKeys.own` 标记。判断情绪经 `activity.MeteredEmotionJudge` 埋点，挂在通话下而不是回合下。看板接口（`dashboard.py`）多了 `calls`（结果、自带密钥、时长中位数和九成、时长分布、结束原因）、`turns.in_calls`、趋势和按角色里的 `calls`；`active_users` 移到顶层，按回合和通话一起算。进行中的通话数是 `GET /api/admin/calls/live`（`Calls.in_progress`，取内存里的通话表，含正在接通的）。前端：`frontend/src/components/admin/AdminDashboard.tsx` 加了通话数、进行中的通话（每分钟刷新）、通话趋势（`TurnTrendChart` 改名为 `TrendChart`，按 `series` 画回合或通话）、通话结果、时长分布和结束原因；格式化在 `frontend/src/lib/dashboard.ts`（`formatDuration`、`durationRange`）；`frontend/src/lib/call.ts` 的 `Call` 分成 `hangUp`（先告诉后端是用户挂断，等 150 ms 再断开）和 `leave`（离开页面，直接断开），`liveConversation.ts` 离开页面时用后者。测试在 `backend/tests/test_call_records.py`。

偏离：
- `service_calls.latency_ms` 改为可空：语音识别是和通话一样长的流，没有延迟可言；没出声就被打断或出错的语音合成也没有。已有的库在启动时把这张表搬一次（`activity._let_latency_be_unknown`）。
- 结束原因比 ticket 多了「用户被删除」和「服务重启或关闭」，否则这两种挂断没有归属；自带密钥失败也算「故障」。
- 「离开对话页」也包括没按挂断就断网、浏览器崩溃，后端分不出来；按了挂断但 `hang-up` 消息没赶在连接关闭前送到时也会落到这里。
- 通话撞限额记为「被拒绝」（spec 要求被拒绝也记）。`for_call` 时自带密钥无法解密（409）的通话不记，浏览器在 `/api/ice-servers` 就会先遇到。
- 判断情绪超过它的超时（`settings.emotion.timeout`）被放弃时，和其他被放弃的请求一样不算出错。

留给人工验证（真实通话 + 浏览器）：
- 真实通话按「挂断」后，看板的结束原因是「用户挂断」；直接关掉标签页、在通话中切到别的页面是「离开对话页」。
- 真实 Soniox / 百炼：语音识别的音频秒数和通话时长大致相当；真实 Fish Audio：每个回复一条语音合成，延迟几百毫秒到一两秒，字节数合理；只看文字的通话没有语音合成记录。
- 用错的 Fish Audio / Soniox key 打电话：健康表里对应服务的出错类别是「密钥或余额」，不是「其他」。
- 后台封禁正在通话的用户：几秒内挂断，结束原因「被封禁」。
- 通话打到时长上限：结果成功、结束原因「撞上时长上限」，时长分布落在对应区间。
- 看板页：另一台设备接通后一分钟内「进行中的通话」变成 1，挂断后一分钟内回到 0；通话趋势、通话结果、时长分布、结束原因、按角色的通话数在电脑和手机上排版正常。
