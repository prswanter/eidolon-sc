# 03: 其余服务的配置

**What to build:** 在 02 打通的路上，把其余服务也接进后台的「配置」页：提炼记忆的 LLM、语音合成、语音识别、判断模型（含情绪阈值和回忆阈值）、重排阈值。同时列出只能查看的项，并说明为什么不能改。见 `../spec.md` 的「配置覆盖」一节。

**Blocked by:** 02

**Status:** resolved

- [x] 提炼记忆的 LLM：协议、base_url、key、模型、max_tokens 可改；没有覆盖时仍沿用「不填就跟随扮演角色的 LLM」的规则，界面上说明当前值从哪里来。保存前用与扮演角色相同的探测。
- [x] 语音合成：key 和模型可改，保存前做零成本检查（复用自带密钥的检查）。新配置只影响之后接通的通话。
- [x] 语音识别：选 Soniox 或阿里云百炼，以及对应的 key 可改；保存前做零成本检查；选百炼时沿用启动时的地域探测。新配置只影响之后接通的通话。自带语音识别密钥的用户不受影响。
- [x] 判断模型：选 Jev 或 Cloudflare、key、模型（Cloudflare 的 clef / clef-flash）、情绪的最低概率和超时、回忆阈值可改。保存前：Cloudflare 复用启动检查，Jev 问一个最小的问题。回忆阈值和情绪阈值的覆盖只对当前选用的模型生效；换模型时清掉，界面上说明。
- [x] 重排：剧情和记忆的最低相关度可改；同样只对当前模型生效。
- [x] 只读项一节：管理者名单、`EIDOLON_SECRET_KEY`（只显示设没设）、OAuth（只显示配了哪几家）、域名、WebRTC/TURN、备份、各种路径、向量化的服务和模型，每一类附一句为什么不能在后台改。任何密钥都不显示原文。
- [x] 接口拒绝修改只读项。
- [x] 测试（HTTP API + 假工厂）：每项服务保存后新的回合或通话用上新配置、进行中的通话不变；各自的保存前检查试不通不保存；换判断模型后阈值覆盖被清掉；重排阈值改了以后影响下一个回合的检索结果；修改只读项被拒绝。

## Comments

**实现**（2026-10-07）：02 的路推广成按「项」的通用机制，`backend/src/eidolon/live_config.py` 仍是唯一入口：每一项是一个 `_Item`（字段、`.env` 的值、保存前怎么试、怎么生效），`LiveConfig.save(item, change)` / `restore(item)` / `start()` / `describe()` 对所有项通用；新增的项是 `memory_llm`、`tts`、`stt`、`judge`、`judge_thresholds`、`rerank`，覆盖仍存在 `config_overrides`，一字段一行。工厂 `service_clients.ServiceClients` 多了 `memory_llm`、`judge_model`（测试用 `tests/fakes.py` 的 `FakeServiceClients`，多了 `background`、`memory_keys`、`judge`、`judges_opened/closed`）；`Lease.again()` 在同一个客户端上再取一份 lease。每个回合、每次通话接通时取的 `DeployerLease`（`LiveConfig.lease()`）现在带上：扮演角色和提炼记忆的模型、语音识别和合成的 key、Fish Audio 的模型（`DeployerKeys.tts_model`，`Speech.tts` 多了 `model` 参数，`SpeechServices` 不再固定模型）、这通电话判断情绪用的判断模型（`DeployerKeys.emotions` → `CallKeys.emotions`）。后台接口统一为 `PUT/DELETE /api/admin/config/{item}`（`admin_config_api.py`，各项的输入模型在 `INPUTS`），只读项 403 并说明原因，`.env` 没配置的项（判断模型、重排）409。前端 `lib/adminConfig.ts` 按 `ITEM_SPECS` 描述每一项的表格行和表单字段，`changeOf` 换算并校验（返回第一处问题），`readOnlyValue` 格式化只读项；`components/AdminConfig.tsx` 对每一项用同一个组件渲染，最后是只读项的表格。测试在 `backend/tests/test_live_config_services.py`。

- 提炼记忆的 LLM：`.env` 里没有任何 `BACKGROUND_LLM_*`（`background_llm == chat_llm`）且后台没有覆盖时跟随扮演角色的 LLM 的生效值，接口返回 `follows_chat`，界面说明。跟随且扮演角色的 LLM 被覆盖时，提炼记忆直接用扮演角色的那个客户端（同一份 lease 再取一次）。
- 记忆是在回合结束后才写的：`TurnLLMs.hold_memory` / `Memories.begin(..., hold)` 在开始写之前再取一份提炼记忆模型的 lease、写完才放，避免被换下的客户端在写到一半时关闭（有测试）。
- 语音识别的 key 按服务分成 `soniox_api_key` 和 `dashscope_api_key` 两个字段，只切换服务时沿用那一家已有的 key（`.env` 或后台的）；百炼的地域由保存前的检查探测并和覆盖一起存下，重启时重新探测。
- 判断模型：字段是服务、key、模型、Cloudflare 账号 ID（Cloudflare 需要，ticket 没列）、情绪判断的超时；Jev 的 base_url 不在后台改（沿用 `.env` 的或默认的 OpenRouter）。保存前的试调是 `judge.try_judge_model`。换服务时 key 必须重填（除非换回 `.env` 那一家）。模型变了就删掉 `judge_thresholds` 的覆盖。
- 阈值（`judge_thresholds` 的回忆、情绪的最低概率；`rerank` 的剧情和记忆的最低相关度）和设置时的模型一起存（`for_model`）；之后模型变了（包括改 `.env` 重启），这项覆盖显示为「没有生效」并说明原因，不删。`.env` 的 `JUDGE_EMOTION_MIN_PROBABILITY` 仍算进 `.env` 的值。
- 偏离：检索用的判断模型和重排阈值按「回合」取（每次提问时取当时生效的判断模型并在回答期间持有它），通话中的回合也一样；按「通话」固定的是情绪判断（模型、最低概率、超时）、语音和扮演角色/提炼记忆的模型。所以通话中途换了判断模型，这通电话之后的回合检索用新模型、情绪仍用接通时的。要让通话里的检索也固定，需要把快照一路传进 `ConversationEngine.turn` 和 `Retrieval`，改动面大，先不做。
- 偏离：`.env` 没有配置判断模型（或重排）时，这一项在后台不可用，只说明原因：检索、记忆、情绪判断是否开启在启动时就决定了，运行中开启需要重建 `Retrieval`/`Memories`，不在本张范围。
- 只读项：管理者名单（`provider:subject`）、`EIDOLON_SECRET_KEY`（只说设没设）、OAuth（配了哪几家）、域名、WebRTC/TURN（只列 URL）、备份（只列存储桶名）、路径、向量化的服务和模型，每项附原因（`live_config.READ_ONLY`）。
- 其他改动：`activity.judge_origin` 抽出来给每次提问用；`Retrieval` / `Memories` 的最低相关度改成每次使用时取；`test_assembly.py`、`test_judge_thresholds.py` 改为从 `config.lease()` 和 `live_config` 观察判断模型（原先直接看 `assembly` 里建的对象）；文字回合运行记录里提炼记忆模型的 `Origin` 改取 `config.memory_llm`。

人工验证：真实的 Fish Audio / Soniox / 百炼 key 在后台保存时的检查和地域探测；真实 Jev、Cloudflare（clef / clef-flash）的保存前试调和失败原因的文案；通话中改判断模型后表情和点头仍按接通时的模型；提炼记忆模型在后台改了以后新记忆照常写入；「配置」页各节在电脑和手机上的排版、表单校验的提示、只读项的表格。
