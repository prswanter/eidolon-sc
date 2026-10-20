# 02: 部署者可以选阿里云百炼做语音识别

**What to build:** 百炼的 pipecat STT 服务，以及 `STT_PROVIDER=bailian` 的部署配置。部署者选百炼后，所有没有自带语音识别密钥的用户，通话都由百炼识别，补充和打断照常。背景见 `../spec.md`，参数来自 ticket 01 的 Answer。

**Blocked by:** 01。只改 `backend/`。

**Status:** resolved

## 要做的

- **拆开 `SonioxFishSpeech`**：语音识别和语音合成分开，语音识别按服务商有两个实现（Soniox、百炼），Fish Audio 不变。`Speech` port 的形状可以改，但 `Calls` 那边仍然不区分是谁的 key。
- **`FOLLOW_ON_TIMEOUT` 由语音识别服务给出**：`CallTurns` 从通话实际用的那家拿，不再是 `call.py` 里的全局常量。Soniox 保持 4.0；百炼 3.0（ticket 01）。`test_call_turns.py` 里 monkeypatch 这个常量的地方跟着改。
- **百炼 STT 服务**：继承 `WebsocketSTTService`，用 `websockets` 直连，不引入 `dashscope` SDK。
  - 协议：`run-task`（`language_hints: ["zh","ja"]`、`vad_model: "near_meeting_16k"`、`heartbeat: true`，见 ticket 01 的 Answer）→ 等 `task-started` → 二进制音频帧 → `result-generated` → 结束时 `finish-task`、等 `task-finished`。`task-failed` 当作服务出错。
  - 音频重采样到 16 kHz 单声道 PCM。
  - 第一条**有字**的中间结果出来时 `ProposedUserStartedSpeakingFrame` + `InterimTranscriptionFrame`；`sentence_begin` 的空结果和 `heartbeat=true` 的心跳跳过；`sentence_end=true` 时 `ProposedUserStoppedSpeakingFrame` + `TranscriptionFrame`；空稿（去掉标点和空白后为空）不发 `TranscriptionFrame`，细则见 ticket 01 的 Answer。
  - 麦克风静音期间不能让服务端 23 秒超时把通话断掉：开 `heartbeat`，上游一段时间没有音频帧时补发静音。浏览器静音时 pipecat 是否继续送音频帧，实现时确认。
  - key 被拒等不可恢复的错误让处理器不可用，照现有的 `ProcessorUnusablePolicy.CANCEL` 结束通话。
- **地域**：给一个 key，先连北京、被拒再连新加坡（老域名，见 spec）。
- **配置**：`config.py` 加 `STT_PROVIDER`（`soniox`|`bailian`，默认 `soniox`，其他值启动报错）、`DASHSCOPE_API_KEY`、`BAILIAN_STT_MODEL`（默认 `qwen-audio-3.1-asr-flash-streaming`，暂时只允许它，其他值启动报错）。`DeployerKeys.stt` 取所选那家的 key。
- **启动时试调**：选百炼且填了 key 时，用 `run-task`/`finish-task` 试调并判断地域；两个地域都拒绝或模型没开通，拒绝启动并说明原因（`去阿里云百炼控制台开通 <模型名>` 之类）。没填 key 照常启动、不开放通话。
- `SERVICE_LABELS["stt"]` 和自带密钥的部分本 ticket 不动（ticket 03）。

## 验收

- [x] **按 TDD**：先写测试看到红，再写实现。
- [x] 百炼 STT 服务的单元测试：用一个假的 WebSocket 服务端回放 `task-started`、几条 `result-generated`、`task-finished`，断言发出的帧和顺序；`sentence_begin` 空结果和心跳不算开口；空稿不出 `TranscriptionFrame`；`task-failed` 和握手 401 让服务不可用。
- [x] 地域判断的测试：北京 401 时改连新加坡；两边都 401 时报错。
- [x] 配置测试：默认 `soniox`；`bailian` 时用 `DASHSCOPE_API_KEY`；非法的 `STT_PROVIDER`、`BAILIAN_STT_MODEL` 启动报错。
- [x] `CallTurns` 按通话所用服务的 `FOLLOW_ON_TIMEOUT` 等待补充，现有的补充和打断测试全部照常通过。
- [x] `backend/` 下 `pytest` 全部通过，`pyright` 0 errors。
- [x] **人工验收（留给用户）**：`STT_PROVIDER=bailian` 起本地后端和前端，打一通电话：
  - 中文、日语都能识别，字幕和回复正常；
  - 角色说话时开口能打断，角色没开口前补一句能并入；
  - 咳嗽一声不会打断、不会多出空回合；
  - 静音麦克风 30 秒以上，通话不断；
  - 填一个错的 `DASHSCOPE_API_KEY`，后端拒绝启动并说明原因。

## Comments

### 2026-10-02：实现说明

自动化的验收项都做完了。全量 `pytest` 894 passed，`pyright` 0 errors。人工验收留给用户。

**结构**

- 新模块 `backend/src/eidolon/bailian.py`：
  - `BailianSTTService` 继承 `WebsocketSTTService`，直接用 `websockets` 连，没有引入 `dashscope` SDK。
  - `find_region` 是试调：`run-task` → `task-started` → `finish-task`，不发音频，顺带判断地域。部署者启动时用它；ticket 03 保存用户的 key 时也可以直接用。
- 语音识别的 key 改成带服务商的 `SttKey(provider, api_key, region)`，定义在 `config.py`：
  - `Settings.stt_key` 是部署者那把，服务商按 `STT_PROVIDER` 取。
  - `DeployerKeys.stt` 和 `CallKeys.stt` 都改成 `SttKey`。
  - **用户自带的语音识别 key 在 03 之前一律当作 Soniox**（`OwnKeys.for_call`）。不这样做的话，部署选百炼后，用户已经存下的 Soniox key 会被发给百炼。
- `Speech.stt(key)` 返回 `Hearing(stt, follow_on_timeout)`。`_LiveCall` 把 `follow_on_timeout` 交给 `CallTurns`，取代了原来的全局常量 `FOLLOW_ON_TIMEOUT`：Soniox 是 `SONIOX_FOLLOW_ON_TIMEOUT = 4.0`，百炼是 `bailian.FOLLOW_ON_TIMEOUT = 3.0`。
- `SonioxFishSpeech` 改名为 `SpeechServices`：按 key 的服务商造 Soniox 或百炼的 STT，Fish Audio 不变。**语音识别和语音合成没有拆成两个类。** `Speech` port 已经按服务商把 STT 分开，再拆一层只会多一个只做转发的类。03 如果要按服务商分开试调，可以那时再拆。
- 地域：部署者的 key 在 `__main__` 里启动时试调。判断出的地域写进 `Settings.dashscope_region`，通话直接连那个地域。地域未知时（只有测试里会出现），服务每次连接都先试北京、被拒再试新加坡。
- 启动时拒绝的三种情况：两个地域都 401/403；模型没开通（提示「去阿里云百炼控制台开通 <模型名>」）；连不上阿里云百炼。最后一种 ticket 没写，比照对话模型试调连不上就拒绝启动的做法。

**协议细节**

- 音频重采样到 16 kHz，攒够 100 ms 一包再发。
- 保活：用 pipecat 自带的 keepalive，1 秒没有音频就补发 100 ms 静音（先把攒着的音频补零凑成一包），再加 `heartbeat: true`。
- 下面几种情况都让服务不可用，由 `ProcessorUnusablePolicy.CANCEL` 结束通话：
  - 握手 401/403；
  - `task-failed`；
  - 通话开始时就连不上（比如 5xx、网络不通）。这一条比 pipecat 的 Soniox 严格：Soniox 遇到这种情况只记一个错，通话继续，用户对着听不见的服务说话。
- 正常结束（EndFrame）时发 `finish-task`，最多等 3 秒 `task-finished`。被 cancel 时（生产中挂断都走这条路）也发 `finish-task`，但不等。
- 断线重连成功时，如果断线前那句话已经开口，会补发 `ProposedUserStoppedSpeakingFrame` 把它收掉。这条没有单测：pipecat 重连的退避至少 4 秒，测起来太慢。

**浏览器静音时 pipecat 还送不送音频帧**

- 前端静音用的是 `track.enabled = false`。浏览器这时一般还会发静音的 RTP。
- 如果 RTP 真的停了，pipecat 的 SmallWebRTC 输入一帧都不送（`recv()` 每 2 秒超时一次，什么也不往下发）。
- 服务的保活看的是「上次收到音频的时间」，两种情况都不会触发 23 秒超时。真实浏览器静音 30 秒以上不断线，放在人工验收里确认。

**测试**

- `tests/fakes.py` 的 `FakeDashScope`：本机上的真 WebSocket 服务端，两个地域各一个路径，key 只在自己的地域通过，其他地域握手返回 401；设 `down` 时所有握手返回 503。
- `tests/test_bailian_stt.py`（21 个）：
  - 帧和顺序；
  - `sentence_begin` 空结果和心跳不算开口；
  - 空稿和只有标点的终稿不出稿；
  - `run-task` 的参数；
  - 100 ms 分包和重采样；
  - 补发静音；
  - 北京被拒改连新加坡；
  - 401、`task-failed`、模型没开通、服务挂了都让服务不可用；
  - cancel 时也发 `finish-task`；
  - `find_region` 的各种结果。
- `tests/test_stt_provider.py`：配置；启动试调（判断出地域、拒绝启动的提示、没填 key 不试调）；按服务商造服务和等补充的时间。
- `test_call.py` 新加一条：通话按识别服务给的时间等补充。把 `_LiveCall` 改成写死 4.0，这条测试会红。
- 手工变异：
  - 空稿判断改成 `strip()`：2 条红；
  - 不管状态码一律改试下一个地域：5 条红；
  - 分包大小改成 20 ms：2 条红；
  - 去掉开始时连不上就不可用：1 条红。
- code review 后改了这些：
  - cancel 时也发 `finish-task`；
  - 开始时连不上就不可用；
  - 重连时收掉没结束的开口；
  - 去掉只给测试用的 `urls` 参数，统一靠 monkeypatch `REGION_URLS`；
  - 消息拼装函数改名为 `_finish_task_message`，抽出 `_failure`；
  - `push_error` 的文案统一用英文（只进日志，用户看到的是 `CallOutcome` 的固定文案）。

### 2026-10-02：人工验收

用户用 `STT_PROVIDER=bailian` 起本地后端和构建版前端，打电话验收通过。启动时用用户的 DashScope key 试调百炼也通过了。ticket 标为 resolved。
