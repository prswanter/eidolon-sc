# 20: 通话 module：信令、归属、限额和管线藏到一个 interface 后面

**What to build:** 把 `app.py` 里的通话逻辑（peer 连接注册表、归属检查、通话限额的扣除与退还、`Call` 构造、`SmallWebRTCRequestHandler`、ICE servers 与 TURN 凭证）和 `call.serve_calls` 收进一个 `Calls` module；测试 seam 从 `CallStarter` 下移到真正的外部服务 STT 与 TTS（`Speech` port），补上从 `/api/offer` 到落库消息的端到端测试。

**Blocked by:** —

**Status:** resolved

## 背景（2026-09-26，架构体检候选 5）

候选 1、2、3（ticket 18、记忆 module、ticket 19）合入之后：

1. `app.py` 仍持有 `calls` 注册表、归属、`usage.take/give_back`、`Call` 构造和 WebRTC handler；ticket 19 明确把这些留给候选 5。
2. seam 在 `CallStarter`，`FakeCalls` 停在那里：RTVI 经 data channel 的收发从未被自动化测试覆盖（ticket 04 只手动冒烟过），也没有测试确认语音回合看得到检索和记忆。
3. ticket 14 的已知缺口：通话在 SDP 应答之后才失败（ICE 不通、Soniox / Fish 连不上）时计数不退还。
4. 服务停止时正在进行的通话没人等：`webrtc.close()` 只异步触发 `worker.cancel()`，回合可能在 Store 和记忆关闭后才写入。

可行性验证（离线、进程内）：aiortc 浏览器 ↔ 真实 `SmallWebRTCRequestHandler` 经 loopback host candidate 约 35ms 接通，`STTService` / `TTSService` 的假子类接进原样管线，`user`/`delta`/`done` 经 data channel 到达浏览器，打字的 `user-text` 被接下，落库、挂断干净；30 次无失败。

## Comments

### 决定（2026-09-26，grill-with-docs）

- **边界**：`Calls` 拥有注册表、归属、通话限额、`Call` 构造、管线启动、WebRTC handler 生命周期、ICE servers 与 TURN 凭证。`app.py` 不再 import `aiortc` / `pipecat`，只做鉴权、`conversation_or_404`，并把领域异常翻译成状态码。
- **interface**：`ice_servers(user_id)`、`start(user_id, conversation, character, CallOptions(muted, quality, device_timezone), offer) -> answer`、`renegotiate(user_id, pc_id, offer, restart) -> answer`、`add_candidates(user_id, pc_id, candidates)`、`aclose()`。异常：`CallsUnavailable` → 503、`CallNotFound`（不存在或不是你的）→ 404、`CallFailed`（信令失败，计数已退还）→ 500、`OverLimit` → 429。`Backend.calls` 始终存在，未配置语音时由它抛 `CallsUnavailable`（与记忆 module 的 null 实现同一思路），`require_voice` 消失。
- **seam**：一个 `Speech` port 成对给出 `stt() -> STTService` 与 `tts(voice_id, sample_rate) -> TTSService`；生产实现 Soniox + Fish Audio 在两个 key 都有时才构造得出来（「两者都配置才能通话」住在这里）。`build(speech=...)` 取代 `build(call_starter=...)`；`CallStarter`、`serve_calls`、`FakeCalls` 删除。`CallLimits` 由 `Calls` 从 Settings 读。
- **接通与限额**（`CONTEXT.md`「接通」）：offer 时先扣。退还：连接在 connected 之前就 closed / failed；30 秒仍未 connected（主动断开，清掉注册表条目）；因服务不可用结束（`ProcessorUnusablePolicy.CANCEL`）且一个回合都没记下。其余都计数：用户挂断、达到上限、服务停止。
- **关闭**：`Calls.aclose()` 取消所有通话并等它们结束、再关闭 WebRTC handler，排在记忆关闭之前；进行中的回合按失败处理，不留记录。lifespan 里单独的 `webrtc.close()` 去掉。
- **测试**：新增端到端（aiortc 浏览器 + 真实 loopback WebRTC + `FakeSpeech` + 带检索和记忆的完整 engine）：说话、打字、`X-Timezone`、检索与记忆、落库；限额的三种退还（连不上、服务故障且零回合、有回合不退）。`test_voice_call` 改用 `FakeSpeech`，用例全保留。`test_call_turns` 只留静音、空白、打断、两种上限、失败回合不计入上限、一个回复一次 TTS 响应；「打字和说话进同一条对话」「设备时区」挪到端到端。测试里把 Pipecat 的 NLTK 断句器换成按「。！？」切分，保持离线（生产镜像已下载 `punkt_tab`）。
- **范围外**：「每位用户同时只能有一个通话」不做。
- `CONTEXT.md` 新增「通话」「接通」（已提交）；不写 ADR（都容易撤回）。

### 实现（2026-09-26）

- `eidolon/call.py`：`Calls`（`ice_servers / start / renegotiate / add_candidates / aclose`），异常 `CallsUnavailable / CallNotFound / CallFailed`，值类型 `CallOptions / SessionDescription / IceCandidate`；`Speech` port 与 `SonioxFishSpeech.from_settings`；`_LiveCall` 管一个通话的管线、接通判定（transport 的 `on_client_connected`，`CONNECT_TIMEOUT` 30 秒）、服务故障判定（worker 的 `on_pipeline_error` 里处理器变为不可用）和计数退还。`CallTurns.recorded` 记下本次通话已记录的回合数。`serve_calls`、`CallStarter` 删除。
- `start` 时语音服务构造失败（Pipecat 只记日志、照样给出 answer）也按 `CallFailed` 处理：断开已协商的连接、退还计数。挂断发生在管线启动之前时直接结束，不再启动管线。
- `assembly.build(speech=...)`；`Backend.calls` 取代 `call_starter`，`calls.aclose` 最后登记、最先关闭（在记忆之前）。`create_app` 不再 import `aiortc` / `pipecat`，lifespan 只调 `backend.aclose()`；PATCH `/api/offer` 用自己的 pydantic 模型，JSON 形状不变。
- 测试：`tests/browser.py`（aiortc 浏览器：静音麦克风 + RTVI data channel，`call / connect / type / turn / hung_up`，`until_gone` 用 PATCH 变 404 判断后端已放下通话）；`FakeSpeech / FakeSTT / FakeTTS`（`fakes.py`），`speech` fixture 顺带把 NLTK 断句器换掉；conftest 里两个角色有了各自的 `voice_id`。新增 `test_call.py`（9 个：说话 + 打字 + 设备时区 + 只送日语 + 落库；检索与记忆；对话、角色音色、静音按请求；连不上、服务构造失败、服务故障且零回合都退还；有回合后故障、用户挂断都计数；服务停止挂断通话、进行中的回合不留记录）。`test_voice_call` / `test_rate_limit` 改用 `Browser` + `FakeSpeech`；`test_call_turns` 删去挪到端到端的三个。
- 验证：`pytest` 268 passed，`pyright` 0 errors；通话相关 35 个测试连跑 10 次无失败（每次约 4 秒）。变异检查：去掉「未接通退还」「零回合服务故障退还」、改成「有回合也退还」、不在关闭时挂断通话、不检查服务是否构造成功，各自有一个测试失败（关闭那条原本会挂住，测试加了兜底挂断后改为 10 秒超时失败）。
- 前端和 wire 协议没有变化。

### 评审（2026-09-26，code-review）

- 修复：`CallTurns.recorded` 改为收到 `TurnDone` 时就加一（engine 在发出 `TurnDone` 前已落库），关闭「回合已记下、服务随即故障、计数仍被退还」的窄窗口。
- 新增测试：通话因自身回合上限结束仍计数。
- 测试辅助收拢：`browser` fixture 移入 conftest，`open_browser()` 取代各处手写的临时浏览器；补上缺失的 docstring；`assembly.py` 记忆关闭顺序的注释更新。
- 保留不改：服务故障之外的异常（含 `error.fatal` 与我们自己的 bug）在零回合时也退还计数，对用户更友好；`SessionDescription`、`IceCandidate` 的分层与命名；未配置语音时 PATCH 仍是 404（与改动前一致）。
- `pytest` 270 passed，`pyright` 0 errors。

### 真实服务验证（2026-09-26）

真实对话模型、Soniox、Fish Audio（`s2.1-pro-free`，真乃的音色）、SiliconFlow 与 Jev，`eidolon serve` 本机运行，`EIDOLON_CALLS_PER_HOUR=1`、`EIDOLON_TURNS_PER_CALL=2`；浏览器是 aiortc 脚本，「麦克风」播放一段用 Fish Audio 合成的中文问句，同时统计收到的角色语音帧。

- 发出 offer 但不接收 answer：计数立即占用（此时再拨返回 429），约 30 秒后退还，下一通电话被接受。
- 真实通话：接通约 1 秒后 `bot-ready`；说出的话经 Soniox 转写成 `user`，约 18 秒后回复 `done`（日语 + 中文字幕），3 秒内开始收到角色语音；通话中打字经 data channel 接下并回复；第 2 轮后收到「这次通话已经说了 2 轮了，先挂断啦……」，最后一段回复播完才挂断（共收到约 2900 帧有声音频）。两个回合都记入对话。
- 再拨：429「这一小时的语音通话次数已经用完了（每小时 1 次）」，`usage` 表里只有一次通话。
- 服务停止正常结束，日志里没有 ERROR。
- 本地起服务前需要手动把 NLTK 的 `punkt_tab` 下到 `~/nltk_data`（NLTK 自带的下载器拒绝经代理下载；Docker 镜像构建时已下载）。
- Soniox 把合成语音「你好真乃」听成了「ミホちゃん」：是用日语音色合成中文句子造成的识别偏差，与本次改动无关。这次对话没有产生记忆（没有透露用户自己的信息），检索与记忆在语音回合里的接线由端到端测试覆盖。
