# 语音识别可选阿里云百炼

Status: resolved

术语以 `CONTEXT.md` 为准；相关决策见 ADR-0010（语音识别服务在部署时二选一，自带密钥的用户自己选）。设计在 2026-10-02 的 grilling 中定下。

## Problem Statement

通话的语音识别目前只能用 Soniox。大陆的部署者和用户很难拿到 Soniox 的 key，想在部署时和自带密钥时都能改用阿里云百炼的千问实时语音识别（`qwen-audio-3.1-asr-flash-streaming`），和 Soniox 二选一。

## Solution

1. 部署：新增 `STT_PROVIDER=soniox|bailian`（默认 `soniox`）。百炼用 `DASHSCOPE_API_KEY`，模型由 `BAILIAN_STT_MODEL` 配置（默认 `qwen-audio-3.1-asr-flash-streaming`）。
2. 自带密钥：用户填语音识别 key 时选 Soniox 或阿里云百炼，与部署者的选择无关。
3. 自己写一个百炼的 pipecat STT 服务，在轮流说话上的表现和 Soniox 一样；参数先用真实 key 测出来再定。
4. 界面、隐私说明和文档改为两家都列。

## Decisions

### 部署

- 一个部署只用一家，不做故障时换另一家。`STT_PROVIDER` 不填为 `soniox`，现有部署不用改配置。
- 选 `bailian` 时需要 `DASHSCOPE_API_KEY`；没填则和现在没填 `SONIOX_API_KEY` 一样，照常启动、不开放通话。
- `BAILIAN_STT_MODEL` 暂时只允许 `qwen-audio-3.1-asr-flash-streaming`（默认），其他值启动报错。保留这个配置，是为了以后有新模型时好加。
  - `qwen-audio-3.0-asr-flash-streaming` 和 `fun-asr-realtime` 协议相同，但不认 `vad_model`：咳嗽会出空稿，或直接识别成「咳咳。」，达不到下面「轮流说话」的规格（ticket 01 实测，2026-10-02 定）。
  - 不支持 `qwen3-asr-flash-realtime`（另一套 OpenAI Realtime 风格的协议）。
- **地域自动判断**：先试北京，被拒（401/403）再试新加坡。用不带 WorkspaceId 的老域名：
  - 北京 `wss://dashscope.aliyuncs.com/api-ws/v1/inference`
  - 新加坡 `wss://dashscope-intl.aliyuncs.com/api-ws/v1/inference`
- 部署者的 key 在启动时试调并判断地域；两个地域都拒绝、或模型没开通，**拒绝启动**并说明原因（和对话模型启动时试调失败一样）。

### 自带密钥

- 语音识别的 key 记录多存服务商（`soniox`/`bailian`），百炼的还存地域。已有的记录没有服务商，一律视为 Soniox。
- 用户只填 key，不选模型、不选地域。百炼的模型跟部署者的 `BAILIAN_STT_MODEL` 走；部署选 Soniox 时用代码里的默认模型。
- **试调百炼 key**：连识别接口，发 `run-task`，等到 `task-started` 就发 `finish-task`，不发音频。这样同时确认 key 有效、判断出地域、确认模型已开通。模型没开通时提示「去阿里云百炼控制台开通 <模型名>」。
- 「三项都自带才不计入限额」不变，不论语音识别用的是哪家。
- 失败提示写用户 key 所属那家的名字，如「你的语音识别（阿里云百炼）密钥调用失败」。

### 轮流说话

- 补充和打断依赖 Soniox 的三条规格：第一个词出来就算开口（`ProposedUserStartedSpeakingFrame`）、说完后最多约 3 秒出终稿、没听到词时不出稿。百炼的服务要给出同样的信号：
  - 第一条**有字**的中间结果（`result-generated`，`sentence_end=false`，`text` 非空）出来时算开口，并发 `InterimTranscriptionFrame`。每句开头那条 `sentence_begin=true` 的空结果只是 VAD 听到声音，不算；`heartbeat=true` 的心跳也跳过；
  - `sentence_end=true` 时发 `ProposedUserStoppedSpeakingFrame` 和 `TranscriptionFrame`；
  - 没识别出文字的句子不出稿：终稿去掉标点和空白后为空，就不发 `TranscriptionFrame`。near 模式下实测没出过空稿，这是兜底。
- `FOLLOW_ON_TIMEOUT` 改为由各家服务自己给出，按通话实际用的服务取值（同一部署里不同用户可能不同）。
- 参数（ticket 01 实测定下）：16 kHz、16 bit、单声道 PCM，每 100 ms 一包；`language_hints: ["zh","ja"]`；`vad_model: "near_meeting_16k"`；`heartbeat: true`；`max_sentence_silence` 用默认（实测说完约 1.0–1.2 s 出终稿）；不开语义断句。百炼的 `FOLLOW_ON_TIMEOUT` 为 3.0。
- 23 秒不发数据会被服务端断开（`task-failed`，`CLIENT_ERROR`）；一直发静音则不断开。服务自己保证不断流：上游一段时间没有音频帧时补发静音。
- 用原始 WebSocket（项目已有 `websockets`）写，继承 pipecat 的 `WebsocketSTTService`，不引入 `dashscope` SDK（它是线程加回调的写法）。

### 文案

- 界面、文档、报错里统一写「阿里云百炼」，代码里写 `bailian`。「千问」只出现在模型名里。
- 隐私说明的「语音服务」改为固定文案，两家都列：声音会发给部署者选择的语音识别服务（Soniox 或阿里云百炼）；阿里云百炼不用它训练模型，但会保存一段时间，存放在中国内地或新加坡，取决于部署者的账号。自带密钥的情况由现有的那句「发到你自己选择的服务商」覆盖。
- README（中、英、日）、`docs/deploy.md`、`.env.example` 同步。

## Out of Scope

- 热词和上下文（把角色名喂给识别服务）：两家都支持，以后单独做，两家一起加。
- 一家出故障时换另一家。
- 用户自己选百炼的模型或地域。
- 带 WorkspaceId 的专属域名：等新加坡老域名下线时再处理。

## Tickets

- `issues/01-measure-bailian-turn-taking.md`：测量原型，定参数。
- `issues/02-bailian-stt-for-the-deployment.md`：百炼 STT 服务、部署配置、各家自己的 `FOLLOW_ON_TIMEOUT`。
- `issues/03-own-stt-key-picks-provider.md`：自带语音识别密钥时选服务商。
- `issues/04-docs-and-privacy-text.md`：隐私说明和文档。
