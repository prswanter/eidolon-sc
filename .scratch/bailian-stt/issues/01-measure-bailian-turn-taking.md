# 01: 测量百炼实时识别在轮流说话上的表现

**Type:** prototype

**What to build:** 一个一次性的测量脚本，用真实的百炼 key 连 `qwen-audio-3.1-asr-flash-streaming`，把录好的音频按实时速度推过去，记下每条事件和它到达的时间。脚本和录音放在 `.scratch/bailian-stt/prototype/`，不进 `backend/src`；结论写进本文件的 `## Answer`。背景见 `../spec.md`。

**Blocked by:** None (can start immediately)。需要用户在 `.env` 里填 `DASHSCOPE_API_KEY`（北京地域，已开通 3.1），并录几段音频（见下）。

**Status:** resolved

## 要回答的问题

1. **出终稿要多久**：从说完最后一个字（录音里的时刻）到收到 `sentence_end=true`，各要多久？`near_meeting_16k` 和 `far_field_meeting_16k` 各测一遍。由此定百炼的 `FOLLOW_ON_TIMEOUT`（Soniox 是 4.0：最长端点延迟 3 秒加余量）。`max_sentence_silence` 对 3.1 是否生效，顺带测一下。
2. **开口多快被发现**：从开口到第一条中间结果要多久？这决定打断的反应速度。
3. **没听到词时出不出稿**：咳嗽、清嗓、键盘声、短暂的「嗯」，会不会出 `sentence_end=true` 的空稿或乱码稿？如果出，长什么样（空字符串？标点？）。
4. **中日混说**：`language_hints: ["zh","ja"]` 下，纯中文、纯日语、一句里中日混说（如「真乃ちゃん今天好可爱」）、角色名（「櫻木真乃」「風野灯織」）的识别效果。和不填 `language_hints` 对比一次。
5. **静音保活**：持续发静音 30 秒以上，会不会被断开（23 秒超时说的是「不发数据」还是「没有语音」）？要不要开 `heartbeat`？
6. **试调能不能不花钱**：`run-task` → `task-started` → `finish-task`、不发音频，控制台账单上是否为 0；模型没开通时返回什么（用一个没开通的模型名试，如 `fun-asr-realtime`，如果它没开通的话）；北京的 key 连新加坡返回什么。
7. **中间结果的形态**：`stash` 和 `fixed` 怎么变化，`text` 是累积的还是增量的；一段话里会不会出多个 `sentence_end`。

## 录音（用户提供）

16 kHz 单声道 WAV，用通话时会用的那种麦克风录，放 `.scratch/bailian-stt/prototype/audio/`：

- 一句中文、一句日语、一句中日混说、一句带角色名的话；
- 两句话中间停顿约 1 秒（看会不会被切成两句）；
- 咳嗽、清嗓、「嗯……」；
- 30 秒以上的安静。

录音不提交（`.scratch/bailian-stt/prototype/audio/` 加进 `.gitignore`）。

## 验收

- [x] 上面 7 个问题都在 `## Answer` 里有答案，附测量数据。
- [x] 给出 ticket 02 要用的参数：`FOLLOW_ON_TIMEOUT`、`vad_model`、是否填 `language_hints`、保活方式、空稿怎么过滤。
- [x] 如果测出来百炼做不到 Soniox 的三条规格（比如出终稿要 6 秒以上，或者咳嗽必出空稿），在 Answer 里写明，并回到 grilling，不直接开始 02。

## Answer

2026-10-02 用用户的北京 key 实测。脚本 `prototype/measure.py`（按实时速度推音频，每包 100 ms，记下每条事件到达时距第一包的秒数，即录音时刻），汇总脚本 `prototype/analyze.py`，原始事件在 `prototype/results/*.jsonl`。录音末尾都补 8 秒数字静音。各句的起止取自 ffmpeg `silencedetect=noise=-40dB:d=0.3`：

- `01.wav` 四句：1.80–3.82、4.78–6.50、8.43–11.27、12.94–14.32 s
- `02.wav` 两句：0.74–3.00、4.12–5.45 s（中间停 1.12 s）
- `03.wav` 六段：0.40–0.54、1.06–1.84、3.50–3.92 是咳嗽和清嗓；5.26–5.54、6.50–6.93、7.99–8.31 是「嗯」类（用户确认）

**结论：`qwen-audio-3.1-asr-flash-streaming` 加 `vad_model: near_meeting_16k` 满足 Soniox 的三条规格，可以开始 02。另外两个模型（3.0、`fun-asr-realtime`）不认 `vad_model`，咳嗽会出空稿，或直接识别成「咳咳。」，达不到规格。** 回到 grilling 后用户定下：保留 `BAILIAN_STT_MODEL` 这个配置，但允许的值暂时只有 3.1（spec 和 ticket 02 已改）。

### 1. 出终稿要多久

3.1，`language_hints: ["zh","ja"]`，单位秒：

| 场景 | 说完（录音） | 收到终稿 | 说完→终稿 | 最后一条中间结果→终稿 |
|---|---|---|---|---|
| 01 near #1 | 3.82 | 4.86 | 1.04 | 1.02 |
| 01 near #2 | 6.50 | 7.66 | 1.16 | 0.70 |
| 01 near #3 | 11.27 | 12.30 | 1.03 | 1.61 |
| 01 near #4 | 14.32 | 15.34 | 1.02 | 1.25 |
| 02 near #1 | 3.00 | 4.05 | 1.05 | 1.00 |
| 02 near #2 | 5.45 | 6.47 | 1.02 | 1.13 |
| 02 far #1 | 3.00 | 4.30 | 1.30 | 1.30 |
| 02 far #2 | 5.45 | 7.14 | 1.69 | 1.00 |

- near 说完到出终稿稳定在 1.0–1.2 s；「最后一条中间结果→终稿」最长 1.61 s（`CallTurns` 的补充计时就是从最后一次听到用户算起的）。far 稍慢，01 里还把相隔 0.96 s 的两句并成了一句。
- **`max_sentence_silence` 对 3.1 生效**：02 near 设 500 时 0.75 / 0.71 s；默认（1300）约 1.0 s；设 3000 时两句并成一句，说完 3.25 s 后才出稿。

### 2. 开口多快被发现

- 开口后 0.1–0.4 s 先来一条 `sentence_begin: true`、`text: ""` 的中间结果。这只是 VAD 判断有声音，还没有字。
- 第一条**有字**的中间结果，near 下在开口后 0.28–0.48 s：01 是 0.34 / 0.36 / 0.41 / 0.28，02 是 0.48 / 0.32。
- Soniox 是「第一个词出来」才算开口，对应的是第一条有字的中间结果，不是 `sentence_begin`。

### 3. 没听到词时出不出稿

- **3.1 + near**：三段咳嗽、清嗓**没有任何输出**（连 `sentence_begin` 都没有）；三段「嗯」类识别成「嗯。」「哦。」「啊。」，是用户有意说的，算正常识别。
- **3.1 + far**：开始推流就出 `sentence_begin`。咳嗽出了两条 `sentence_end: true`、`text: ""` 的空稿；其中一条先出过「嗯」的中间结果，终稿却是空的。空稿带一个 `stash` 字段（`{"sentence_id": 下一句, "text": "", "begin_time": -1, ...}`）。
- **3.0 + near**（不认 `vad_model`，表现同 far）：咳嗽出两条空稿，一条先有中间结果；「嗯」类识别成「#うん。」「#あ。」，带 `#`。
- **`fun-asr-realtime` + near**：两段咳嗽都识别成文字「咳咳。」。另外 01 里「真乃」认成「真奶」，「聞こえてますか」认成「听得到吗」。

### 4. 中日混说

01 near 下各设置的终稿：

| | `["zh","ja"]` | 不填 | `["ja"]` |
|---|---|---|---|
| 中文 | 晚上好，听得见吗？ | 同左 | 同左 |
| 日语 | 聞こえてますか？ | 同左 | 同左 |
| 混说 | 晚上好，こんにちは，聞こえてますか？ | 晚上好，こんにちは。聞こえてますか？ | 晩上好、こんにちは、聞こえてますか？ |
| 角色名 | 你是樱木真乃吗？ | 同左 | 同左 |

- 三种设置都认对了。只填 `ja` 时把中文的「晚」写成了日文汉字「晩」。
- 角色名「櫻木真乃」出成简体「樱木真乃」，所有设置都一样，算对。「風野灯織」录音里没有，没测。
- 选 `["zh","ja"]`。

### 5. 静音保活

- **一包都不发**：`task-started` 后正好 23.0 s 收到 `task-failed`，`error_code: CLIENT_ERROR`，`error_message: "request timeout after 23 seconds."`。23 秒说的是「不发数据」。
- **一直发静音**：不开 `heartbeat`，纯零 60 s、底噪 60 s、纯零 300 s，都没被断开。
- **开 `heartbeat: true`**：同样不断开，另外每约 55 s（60、115、170、225、280 s）回一条心跳：`result-generated`，`sentence: {sentence_id: 0, text: "", sentence_end: false, heartbeat: true}`。这条**必须跳过**，不然会被当成中间结果。
- 文档说不开 `heartbeat` 时「持续发静音也会在一段时间后超时」，实测 5 分钟内没发生。

### 6. 试调能不能不花钱

- `run-task` → `task-started`（约 0.3 s）→ `finish-task` → `task-finished`。`task-finished` 的 `payload` 是 `{"output": {}}`，不带 `usage`。
- 正常识别时，终稿带 `usage: {"duration": 秒, ...}`，是到这句为止的累计计费时长，比如 02 是 3、6。
- 不发音频的握手大概率不计费，**但控制台账单要等用户事后看**，脚本里确认不了。
- 不存在的模型返回 `ModelNotFound`（见上面的 Comments）。「存在但没开通」的错误码测不了：这个 key 下三个模型都已开通。
- 北京的 key 连新加坡，WebSocket 握手就是 HTTP 401（同上）。

### 7. 中间结果的形态

- **`text` 是本句到目前为止的全文（累积），不是增量**，比如 「现」→「现在」→「现在这里是」→「现在这里是第一句」→ 终稿「现在这里是第一句话。」。
- `sentence_id` 从 1 递增，每句先来一条 `sentence_begin: true` 的空中间结果；`begin_time`、`end_time` 是相对任务开始的毫秒数。
- `words[]` 每个词带 `fixed: true/false`，表示这个词已经定下来。顶层没有 `fixed`；`stash` 只在 far 模式的空稿上见到，不用管。
- **一个回合可能出多个 `sentence_end`**：near 下停顿约 1 s（01 里 0.96 s，02 里 1.12 s）就切成两句，每句各一个终稿。

### 给 ticket 02 的参数

- **模型**：只用 `qwen-audio-3.1-asr-flash-streaming`（`BAILIAN_STT_MODEL` 保留，允许列表只有它）。
- **`run-task` 参数**：`format: pcm`、`sample_rate: 16000`、`vad_model: "near_meeting_16k"`、`language_hints: ["zh","ja"]`、`heartbeat: true`；`max_sentence_silence` 不填（默认 1300，实测出稿约 1.0–1.2 s）；不开 `semantic_punctuation_enabled`。
- **`FOLLOW_ON_TIMEOUT` = 3.0**：最后一条中间结果到终稿实测最长 1.61 s，按默认断句阈值 1.3 s 加处理延迟，留一倍左右余量。
- **开口**：第一条 `text` 非空的中间结果才发 `ProposedUserStartedSpeakingFrame` + `InterimTranscriptionFrame`。`sentence_begin` 的空结果、`heartbeat: true` 的心跳一律跳过；之后每条有字的中间结果都发 `InterimTranscriptionFrame`。
- **终稿**：`sentence_end: true` 时，去掉标点和空白后为空就不发 `TranscriptionFrame`。如果这句之前发过开口，仍发 `ProposedUserStoppedSpeakingFrame`，没有补上的稿交给 `FOLLOW_ON_TIMEOUT` 收场；没发过开口就什么都不发。near 下实测没出过空稿，这是兜底。
- **保活**：开 `heartbeat: true`，并且服务自己保证不会 23 秒不发数据。上游有一段时间没有音频帧时（比如 1 s），补发 100 ms 的零。浏览器麦克风静音时 pipecat 会不会继续送音频帧没验证，02 实现时确认。
- **空稿过滤**、**心跳跳过**、**`task-failed` 的 `CLIENT_ERROR` 超时**都要有单元测试。

## Comments

### 2026-10-02：key 已填，做了试调握手

用户的 `DASHSCOPE_API_KEY` 已经填进 `.env`，是 `sk-ws-` 开头的新格式。用老域名、不带 WorkspaceId 的握手如下：

- **北京** `dashscope.aliyuncs.com`：
  - 模型列表 200；
  - `qwen-audio-3.1-asr-flash-streaming`、`qwen-audio-3.0-asr-flash-streaming`、`fun-asr-realtime` 三个模型都是 `run-task` → `task-started`（约 0.3 s）→ `finish-task` → `task-finished`，`output` 为空。
- **新加坡** `dashscope-intl.aliyuncs.com`：模型列表 401 `InvalidApiKey`，WebSocket 握手 HTTP 401。「北京被拒才试新加坡」反过来也成立：可以靠 401 判断地域。
- **不存在的模型**：`task-started` 之前就返回 `task-failed`，`error_code=ModelNotFound`。
- **还没测**：
  - 「存在但没开通」的错误码。这个 key 下三个模型都已开通，没法测。
  - 不发音频的握手是否计费，要等控制台账单更新后再看。

`run-task` 的报文：`header: {action: run-task, task_id: <32 位 hex>, streaming: duplex}`，`payload: {task_group: audio, task: asr, function: recognition, model, parameters: {format: pcm, sample_rate: 16000}, input: {}}`。

### 2026-10-02：录音已备好

`.scratch/bailian-stt/prototype/audio/` 下的文件。原始录音是用户录的 m4a（AAC，48 kHz 立体声），已用 ffmpeg 转成 16 kHz、单声道、s16 的 WAV。测量用 WAV：

| 文件 | 内容 | 来源 | 时长 |
|---|---|---|---|
| `01.wav` | 一句中文、一句日语、一句中日混说、一句带角色名的话 | 用户录音 | 16.06 s |
| `02.wav` | 两句话，中间停顿约 1 秒 | 用户录音 | 6.98 s |
| `03.wav` | 咳嗽、清嗓、「嗯……」 | 用户录音，峰值 -4.7 dB | 9.07 s |
| `04-silence.wav` | 纯数字静音 | 合成 | 35 s |
| `05-room-noise.wav` | 很轻的粉红噪声，平均 -64.7 dB，模拟真实麦克风的底噪 | 合成 | 35 s |

- **静音保活（问题 5）**：两种静音都测。浏览器麦克风静音时推过来的是纯零还是底噪，取决于实现。
- **各句的起止时刻**：录音里没有标注，测量时要先从波形（或用 ffmpeg `silencedetect`）找出来，作为算「说完到出终稿」的起点。
- 整个目录已加进 `.gitignore`。
