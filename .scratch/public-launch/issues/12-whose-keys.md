# 12: 自带密钥 module 一次回答「这个回合 / 通话用谁的钥匙」

**What to build:** 把「用自带的还是部署者的钥匙」「算不算限额」「保存的密钥解不开时怎么办」收进 `OwnKeys`。一个回合或一次通话开始时解析一次，得到这次要用的对话 LLM、记忆 LLM（以及通话用的语音识别、语音合成密钥），和是否免计入限额。Engine、Memories、Calls 只使用这个结果，不再区分哪些是自带的、哪些是部署者的。对外行为不变，唯一的改动是：保存的密钥解不开时，文字回合也在开始前就失败。

**Blocked by:** —

**Status:** done

- [x] `OwnKeys` 持有部署者的对话 LLM、记忆 LLM 和两把语音密钥；提供回合、通话两种解析，替换公开的 `chat_llm`、`speech_keys`、`exemptions`
- [x] 「记忆 LLM 跟随对话 LLM」从 engine 搬进 `OwnKeys`
- [x] 「哪几项是自带的 → 回合 / 通话免计入」只写一处，解析和设置页共用
- [x] 保存的密钥解不开：文字回合在流式开始前返回 409、不占限额；通话在 `ice-servers` 与 `start` 返回 409
- [x] `ConversationEngine` 不再持有对话 LLM，`turn` 必须传入这个回合的钥匙；`Memories` 不再持有记忆 LLM，`begin` 必须传入
- [x] `Calls` 的 `own_keys` 改为必填，不再读 `settings` 里的 Soniox / Fish 密钥；`renegotiate` 不再检查钥匙
- [x] 新测试在 `OwnKeys` 的 interface 上：回合、通话的免计入组合；LLM 与语音密钥解不开；部署者缺一项语音密钥
- [x] 现有测试除直接调 engine / memory 的几处辅助函数外不改（见「实现」），全部通过；`pyright` 0 errors

## 背景（2026-09-27，架构体检候选 1）

public-launch（ticket 07、08）合入后的架构体检发现：

1. 自带还是部署者的选择在三处各做一次：`engine.py` 的 `own_llm or self._llm`、`memory.py` 的 `background_llm or services.background_llm`、`call.py` `_speech_for` 的 `own.get("stt") or settings.soniox_api_key`。「记忆 LLM 跟随对话 LLM」由 engine 把 `own_llm` 传给 `Memories.begin` 决定。
2. 「全用自带密钥就不计入限额」写了三份：`app.py` 的 `exempt=own_llm is not None`、`Calls.start` 的 `exemptions(user_id)["calls"]`、`OwnKeys.exemptions`。`Calls.start` 每次通话读三遍自带密钥表。
3. 保存的密钥解不开（换了 `EIDOLON_SECRET_KEY`）时，语音密钥在 `ice-servers` 就报错，LLM 密钥到回合里才报；这两条路都没有测试。
4. 通话免计入只能经三个真实 aiortc 浏览器测到。

## Comments

### 决定（2026-09-27，grilling）

- **部署者的钥匙也归 `OwnKeys`**：它给出的是「这次要用的」那一套，退回部署者由它负责。Engine、Memories、Calls 不再知道「自带」。
- **两种解析**：回合一种（对话 LLM、记忆 LLM、是否免计入），通话一种（再加语音识别、语音合成密钥；两项里缺任何一项、自带和部署者都没有，就是通话不可用）。名字实现时定。
- **解不开就在解析时失败**：`OwnKeyFailed`，文字回合在流式之前由 `app.py` 现有的 handler 转成 409，不占限额；通话在 `ice-servers` 与 `start` 同样 409。`renegotiate` 是通话中、免费的，不再检查。
- **`OwnKeyFailed` 与措辞不动**：engine 照旧捕获它；通话管线里「哪个环节对应哪项服务」留在管线里。
- **与候选 2（限额）的边界**：只让 `exempt` 来自解析结果；`UsageLimiter`、`Store.take_usage` 不动。
- **Engine**：构造时不再接收 `chat_llm`，`turn` 必须传入回合的钥匙；`test_assembly.py` 直接调 `engine.turn` 的几处随之补参数，是「现有测试不改」的唯一例外。
- **Memories**：不再持有记忆 LLM，`begin` 必须传入；记忆开不开只看 embedder 与 reranker（`assembly` 仍只在检索开启时开记忆，对外不变）。部署者的记忆 LLM 总是打开（只是一个客户端，不联网），交给 `OwnKeys`。
- **设置页**：展示「是否免计入」不需要解密；「哪几项自带 → 免计入」是一条私有规则，与解析共用。
- **位置与命名**：留在 `own_keys.py`，类名仍是 `OwnKeys`；`Calls(own_keys)` 必填。`CONTEXT.md` 不加术语。
- **保持现状**：部署没有 `EIDOLON_SECRET_KEY` 时，已存的自带密钥被忽略、一律用部署者的钥匙并计入限额（和现在一样）。
- **测试**：现有测试作为安全网；新测试写在 `OwnKeys` 的 interface 上（SQLite + 假 `LLMService`），通话免计入的 aiortc 端到端测试保留。
- 不写 ADR（容易撤回）。

### 实现（2026-09-27）

- `own_keys.py`：`DeployerKeys(chat_llm, memory_llm, stt, tts)` 由 `assembly` 交给 `OwnKeys`；`for_turn(user_id) -> TurnKeys(llms, exempt)`、`for_call(user_id) -> CallKeys(llms, stt, tts, own, exempt)`。自带 LLM 同时是回合的对话 LLM 和记忆 LLM。`_decrypt` 解不开时直接抛 `OwnKeyFailed`（点名是哪项服务），`_Broken` 删除。`chat_llm`、`speech_keys` 删除；`exemptions` 留作设置页用，和解析共用私有的 `_exempt`（不解密，与解析的差别只在解不开的密钥上，而那种情况解析会直接失败）。`CallsUnavailable` 搬到这里，`call.py` 照旧导出。
- `llm/__init__.py`：`TurnLLMs(chat, memory)`，Engine、Memories、Call 只认它。
- `engine.py`：构造时不再收 `chat_llm`；`turn(conversation, text, llms, device_timezone=None)`。
- `memory.py`：不再持有记忆 LLM，`begin(conversation, timezone, llm)` 必须传入；开不开只看 embedder 与 reranker。
- `call.py`：`Call` 带 `llms`，`SpeechKeys` 与 `_speech_for` 删除；`ice_servers` 与 `start` 调 `for_call`，`renegotiate` 不再检查；`Calls(speech, own_keys)` 必填，不再读 `settings` 里的语音密钥。
- `app.py`：文字回合先 `for_turn`，再按 `keys.exempt` 取限额。
- `assembly.py`：部署者的记忆 LLM 总是打开。
- 测试：新增 `tests/test_own_keys.py`（12 个，在 `OwnKeys` 的 interface 上：回合、通话的免计入组合，LLM 与语音密钥解不开，部署者缺一项语音密钥，没有 `EIDOLON_SECRET_KEY` 时已存密钥不用）；`test_own_llm.py` 新增一个 HTTP 测试：解不开的自带 LLM 让文字回合返回 409、不计入限额（在 main 上确认它失败：200 加流里的 error）。
- **与 ticket 的出入**：要补参数的现有测试不止 `test_assembly.py`。`test_turns.py`、`test_call_turns.py` 直接调 `engine.turn` 或构造 `Call`，`test_memories.py`、`test_reembed.py` 构造 `Memories`，都只改了辅助函数，断言一行没动；`test_memories.py` 用 `writing_with` 记下每份 memories 写记忆用的模型，免得改动二十来处调用。
- 验证：`pytest` 484 passed，另有 1 个与本 ticket 无关的旧失败（`test_characters.py::test_missing_character_sheet_is_reported_with_its_path`，Windows 路径分隔符）；`pyright` 0 errors。变异检查：通话免计入改用回合规则、记忆 LLM 不跟随自带 LLM、忽略自带语音识别密钥、没有 secret key 仍读已存密钥、缺语音合成密钥不拒绝，各自至少一个测试失败。

### 评审（2026-09-27，code-review）

- 修复：`Memories.__init__` 文档字符串换行；`test_memories.begin` 补文档字符串；`test_own_keys.Deployment` 去掉没用的 `path`。
- 修复（main 上就有）：`own_llm_service` 原来排在 memory 之后加入 closers，关闭时先于 memory 关掉，关机时还在用自带 LLM 写的记忆会撞上已关闭的客户端。现在和部署者的两个 LLM 一起提前创建，memory 先关。
- 保留不改：
  - `TurnKeys` / `CallKeys` / `DeployerKeys` 里装的多是 LLM 客户端而不是密钥字符串：名字回答的是「用谁的钥匙」，与「自带密钥」一致。
  - `DeployerKeys.memory_llm` 对应配置里的 `background_llm`：配置名说的是模型用途的历史叫法，`OwnKeys` 这边按领域说「写记忆」。
  - `ice_servers` 调 `for_call` 只为让它在最早的时机失败，结果不用；打开自带 LLM 只是建一个对象，不联网。
  - `for_call` 里 stt、tts 两行同形，不抽。
  - 通话在 `ice-servers` / `start` 的 409 只在 `OwnKeys` 层测，HTTP 层靠现有的 `OwnKeyFailed` handler。
