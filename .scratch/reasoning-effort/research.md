# 每个模型槽位的「思考强度」：各协议、各家服务、各网关怎么表达，思考内容要不要回传

访问日期：2026-10-14。每条结论都附了一手来源：官方文档（多数页面在 URL 后加 `.md` / `.md.txt` 可以拿到原文 Markdown）、官方 API 参考、官方 SDK 源码，或开源项目带提交 SHA 和行号的源码链接。二手文章没有作为依据。标 **未确认** 的，是在一手来源里没查到的。

几点说明：

- 模型名比我们原先以为的新得多：OpenAI 已有 GPT-5.6、GPT-6 Astra / Sol / Luna、GPT-6.1 Sol；Anthropic 已有 Claude Opus 5.5、Sonnet 5.5、Haiku 5.5、Fable 5.1；Gemini 已有 3.x、4 Argon；DeepSeek 到 V4.1；Qwen 到 3.8；Kimi 到 K3；GLM 到 5.3；豆包到 Seed 2.1。下文一律以 2026-10-14 的官方文档为准。
- 引用 GitHub 源码时，链接固定到下面这些提交：

  | 仓库 | 提交 |
  |---|---|
  | openai/openai-python | `86cae50785fb7b7bf2a5d2383370b214b304acd2` |
  | BerriAI/litellm | `ff2718bcfa5266fe6da92891d7a88633a04fd5fd` |
  | router-for-me/CLIProxyAPI | `0d18d3b365be000eeaee7de4615f9da596b2059d` |
  | QuantumNous/new-api | `7de10f2c602b50122017556e8a09cb7c488c273c` |
  | yetone/magpie | `407595b2abb202a5de82e7bf1b90a5e83b28ffd0` |
  | earendil-works/pi（原 badlogic/pi-mono） | `d20c6e96625143bdb6fc533843d30601a9f6fcf8` |

## 结论先行

- **三种协议各有一个强度参数，但「关闭」的写法差别很大。**
  - Chat Completions 用 `reasoning_effort`，Responses 用 `reasoning.effort`。两者的取值都是 `none` / `minimal` / `low` / `medium` / `high` / `xhigh` / `max`，各模型只支持其中一部分。
  - Anthropic 用 `thinking`（`adaptive`、`enabled`+`budget_tokens`、`disabled`、`between_tools`）加上 `output_config.effort`（`low` 到 `max`）。
  - 「关闭」要按模型分开写：
    - GPT-6 Astra、GPT-6.1 Sol 发 `none` 会返回 400。
    - Claude Opus 5.5 和 Fable 系列根本关不掉。
    - Claude Sonnet 5.5 只能发 `between_tools`。
    - Claude 4.5 及更早的模型只认 `enabled`+`budget_tokens`，发 `adaptive` 会返回 400。
    - Claude 4.7 及以后的模型反过来，发 `enabled` 会返回 400。
- **「不设置」不等于不思考。** 新模型不传参数时大多默认开着思考，而且档位不低：GPT-5.5/5.6 是 `medium`；Claude Opus 5.5 是 `medium` 并且始终思考，Sonnet 5.5 是 `high`；DeepSeek V4 是 `high`；Kimi K3 是 `max`；GLM 5.2+ 是 `max`；Qwen3.8 是 `xhigh`；豆包 Seed 2.1 是 `high`。通话槽位要压首字延迟，就得显式设成「关闭」或「低」。
- **工具调用后不回传思考内容，有好几家会直接返回 400。** 我们的引擎恰好有一轮工具调用，下面这几家都受影响：
  - **Anthropic**：手动模式（`enabled`）下必然 400；adaptive 模式下官方写的是「Required」，但没写不传的后果（未确认）。
  - **DeepSeek**：只要请求带 `tools`，所有历史 assistant 轮次的 `reasoning_content` 都要回传，否则 400。
  - **Gemini 3/4 走 OpenAI 兼容接口**：`tool_calls[].extra_content.google.thought_signature` 必须回传，否则 400。
  - **OpenAI Responses、Kimi、GLM、Qwen、豆包**：文档要求或建议回传，但写明（或看上去）不回传不会报错，只会让效果变差。
- **我们的引擎有一个现成的隐患。** 工具调用之后的那次请求，`tools` 从 `[recall_story]` 变成了 `[]`。在 Claude Opus 5.5、Sonnet 5.5、Haiku 5.5、Fable 5.1 上，`tools` 一变，之前的 thinking 块就全部失效（2026-08-31 及以后创建的账号会直接 400），而 `tool_choice` 不在这项检查范围内。所以最后一轮应该保留 `tools` 不变，改用 `tool_choice: none`。
- **各网关的统一映射并不统一。** 拿 `high` 来说，换算成 Claude 的思考预算：LiteLLM 是 4096，pi 是 16384，CLIProxyAPI 是 24576，magpie 是 24000，OpenRouter 和 new-api 是 `max_tokens×0.8`。到了 Claude 4.6 及以后的模型，各家都改为发 `thinking:{type:"adaptive"}` 加 `output_config.effort`。
- **推荐做法：五个档位直接翻译成协议参数，各家方言交给「额外请求参数 JSON」。**
  - Chat Completions：关闭发 `reasoning_effort:"none"`，低/中/高发对应的值。
  - Responses：发 `reasoning.effort`，再加上 `include:["reasoning.encrypted_content"]`。
  - Anthropic：要一张按模型名判断的小表（adaptive 还是 budget，「关闭」怎么写）。
  - Qwen 的 `enable_thinking`、GLM 和 Kimi 的 `thinking.type`、Gemini 的 `thinking_config`、OpenRouter 的 `reasoning` 对象，都只能靠额外 JSON 写。
- **pi（`@earendil-works/pi-ai`）最值得照抄，有三点。**
  - 思考内容按「来源协议+服务商+模型」原样存成不透明签名。同一模型时原样回传；换了模型就转成普通文本，或者直接丢掉。
  - Chat Completions 的兼容差异集中在一个 `compat` 对象里，按 base_url 自动探测，同时允许按模型覆盖。
  - 预算型模型把 `max_tokens` 加大，保证正文至少还剩 1024 token。
- **关于延迟，我们没有找到任何官方的定量数据。** 官方文档只有定性说法，例如 OpenAI 建议语音场景用 `none`，Anthropic 说 `display:"omitted"` 能缩短首个文本 token 的时间。下文不引用任何数字。上线前应该在我们自己的通话日志里，按档位测一下首字延迟。

---

## 0. 项目现状

先说代码现在是什么样（main @ `9bbc418`）：

- **槽位配置。** `LLMSettings`（`backend/src/eidolon/config.py:101-110`）只有 `base_url`、`api_key`、`model`、`protocol`、`max_tokens` 这几项。
  - 协议取值见 `config.py:94`：`chat-completions`、`responses`、`anthropic`。
  - 后台保存的结构见 `admin_config_api.py:43-52`（`LLMInput`）。
  - 用户自带密钥时用的 `LLMSettings(...)` 不带 `max_tokens`，见 `own_keys.py:350`、`own_keys.py:371`。
  - 部署者的槽位有两个：chat 和 background（`config.py:111-118`）。用户自带密钥时，一份设置同时用作 `chat_llm` 和 `memory_llm`（`own_keys.py:368-375`）。
- **`openai_compat.py`**（Chat Completions）：
  - 请求固定带 `stream`、`stream_options.include_usage`；有配置时带 `max_tokens`（注意不是 `max_completion_tokens`）；有工具时带 `tools`。
  - 流里只读 `delta.content` 和 `delta.tool_calls`（`openai_compat.py:61-76`）。
  - 回传 assistant 消息时只写 `content` 和 `tool_calls`（`openai_compat.py:87-106`）。
- **`responses.py`**：
  - 请求带 `store:false`，system 放进 `instructions`，有配置时带 `max_output_tokens`。
  - 流里只处理 `output_text.delta`、`function_call` 这两种 item 和参数增量（`responses.py:58-81`）。`type:"reasoning"` 的 output item 被直接忽略。
  - 回传时只有 message 和 `function_call` item（`responses.py:96-117`）。
- **`anthropic.py`**：
  - `max_tokens` 默认 16384（`anthropic.py:15-17`），API 版本头是 `2023-06-01`。
  - 流里只处理 `tool_use` 块、`text_delta` 和 `input_json_delta`（`anthropic.py:60-76`）。`thinking_delta`、`signature_delta`、`redacted_thinking` 全部忽略。
  - 回传 assistant 消息时，按「先 text、后 tool_use」重新拼一遍（`anthropic.py:128-136`），不是照原样回传。
- **统一接口。** `ChatLLM.stream` 只会产出 `str | ToolCall` 两种东西（`llm/__init__.py:36-45`）。`ChatMessage` 里没有任何地方能放思考内容（`llm/__init__.py:26-34`）。
- **引擎的工具轮**（`engine.py:104`、`engine.py:434-460`）：
  - 第 0 步 `offered = [RECALL_STORY_TOOL]`。模型调用工具后，引擎追加一条 `ChatMessage("assistant", said, tool_calls=...)`，再追加若干 `ChatMessage("tool", result)`，最后一个工具结果末尾拼上 `LAST_ROUND_NOTE`。
  - 第 1 步 `offered = []`，也就是**第二次请求不带 tools**。
  - 历史对话都是从数据库读出的纯文本。每一轮的 system 提示词都会重建，里面有时间、检索结果等内容（`engine.py:418-424`）。
- **连通性检查。** `check_chat_llm`（`llm/providers.py:38-58`）会发一次带 `ping` 工具的探测请求。以后槽位开了思考，这次探测请求也会带上思考参数。
- 引擎对 LLM 不发 `temperature`、`top_p`、`tool_choice`。（`call.py:575` 的 `temperature` 是 TTS 的参数，和 LLM 无关。）

---

## 1. 每种协议怎么表达思考强度 / 开关

### 1.1 OpenAI Chat Completions：`reasoning_effort`

- **取值。** 官方 SDK（由 OpenAPI 生成）的类型是 `Literal["none","minimal","low","medium","high","xhigh","max"]`。Chat Completions 参数的说明原文是："Currently supported values are `none`, `minimal`, `low`, `medium`, `high`, `xhigh`, and `max`... Not all reasoning models support every value."
  来源：[shared/reasoning_effort.py L8](https://github.com/openai/openai-python/blob/86cae50785fb7b7bf2a5d2383370b214b304acd2/src/openai/types/shared/reasoning_effort.py#L8)，[chat/completion_create_params.py L233-L242](https://github.com/openai/openai-python/blob/86cae50785fb7b7bf2a5d2383370b214b304acd2/src/openai/types/chat/completion_create_params.py#L233-L242)
- **各模型支持哪些值、默认是什么**（来自模型页原文。GPT-6 Astra 的默认值以 reasoning 指南为准）：

  | 模型 | 支持的 effort | 默认 | 来源 |
  |---|---|---|---|
  | gpt-5 | minimal, low, medium, high（没有 `none`） | 页面没写 → **未确认** | https://developers.openai.com/api/docs/models/gpt-5 |
  | gpt-5.1 | none（默认）, low, medium, high | none | https://developers.openai.com/api/docs/models/gpt-5.1 |
  | gpt-5.2 / gpt-5.4 | none（默认）, low, medium, high, xhigh | none | https://developers.openai.com/api/docs/models/gpt-5.2 ，https://developers.openai.com/api/docs/models/gpt-5.4 |
  | gpt-5.5 | none, low, medium（默认）, high, xhigh | medium | https://developers.openai.com/api/docs/models/gpt-5.5 |
  | gpt-5.6-terra / luna | none, low, medium（默认）, high, xhigh, max | medium | https://developers.openai.com/api/docs/models/gpt-5.6-luna |
  | gpt-6-astra | low, medium, high, xhigh, max（没有 `none`） | 模型页没写 → **未确认** | https://developers.openai.com/api/docs/models/gpt-6-astra |
  | gpt-6.1-sol | low, medium（默认）, high, xhigh, max；不支持 none / minimal | medium | https://developers.openai.com/api/docs/models/gpt-6.1-sol |
  | gpt-6 Sol / Luna | 支持 `none`；省略时默认 medium | medium | https://developers.openai.com/api/docs/guides/reasoning （"Reasoning mode" 一节） |
  | gpt-4.1 | 非推理模型（"low latency without a reasoning step"） | — | https://developers.openai.com/api/docs/models/gpt-4.1 |

- **发了模型不支持的值。** 只有一条明文："GPT-6 Astra does not support `none` reasoning effort. Setting `reasoning.effort` (Responses) or `reasoning_effort` (Chat Completions) to `none` returns HTTP 400."（[reasoning 指南](https://developers.openai.com/api/docs/guides/reasoning#reasoning-effort)）。
  - 给 gpt-5 发 `none`、给 gpt-4.1 这类非推理模型发 `reasoning_effort` 会怎样：**未确认**，文档没写。
- **Chat Completions 上工具调用和思考的冲突**，原文见 [latest-model 指南「Update API and model parameters」](https://developers.openai.com/api/docs/guides/latest-model)：
  - "Chat Completions does not support function calling with GPT-6 Astra or GPT-6.1 Sol."
  - "GPT-6 Sol and GPT-6 Luna support function calling in Chat Completions only with `reasoning_effort: "none"`. Use Responses for reasoning with tools."

  我们的 chat 槽位需要工具（「回顾剧情」）。所以 GPT-6 系列要么改走 Responses，要么只能配 GPT-6 Sol/Luna 加「关闭」。
- **采样参数。** "When reasoning effort is not `none`, remove `temperature`, `top_p`, and `top_logprobs`. For Chat Completions, also remove `logprobs`."（同上）。我们的 LLM 请求本来就不发这些。
- **返回的思考内容。** OpenAI 官方的 Chat Completions 不返回思考内容：`ChoiceDelta`、`ChatCompletionMessage` 和 assistant 消息的入参类型里都没有 reasoning 字段。所以对 OpenAI 官方来说，没有可以回传的东西。
  来源：[chat_completion_chunk.py L101-L131](https://github.com/openai/openai-python/blob/86cae50785fb7b7bf2a5d2383370b214b304acd2/src/openai/types/chat/chat_completion_chunk.py#L101-L131)，[chat_completion_assistant_message_param.py L46-L81](https://github.com/openai/openai-python/blob/86cae50785fb7b7bf2a5d2383370b214b304acd2/src/openai/types/chat/chat_completion_assistant_message_param.py#L46-L81)
- **`max_tokens`。** 原文是 "deprecated in favor of `max_completion_tokens`, and is not compatible with o-series models"。`max_completion_tokens` 的上限包含 reasoning tokens（[completion_create_params.py L117-L133](https://github.com/openai/openai-python/blob/86cae50785fb7b7bf2a5d2383370b214b304acd2/src/openai/types/chat/completion_create_params.py#L117-L133)）。我们的适配器发的是 `max_tokens`；对 gpt-5 及以后的模型会怎样，**未确认**。

### 1.2 OpenAI Responses：`reasoning.effort` / `reasoning.summary`

- **`reasoning` 对象**（[shared/reasoning.py L18-L60](https://github.com/openai/openai-python/blob/86cae50785fb7b7bf2a5d2383370b214b304acd2/src/openai/types/shared/reasoning.py#L18-L60)）有以下字段：
  - `effort`：取值和 Chat Completions 相同。
  - `summary`：`auto` / `concise` / `detailed`。
  - `context`：`auto` / `current_turn` / `all_turns`。
  - `mode`：`standard` / `pro`。
  - `generate_summary`：已废弃。
- **默认强度。** 原文："Defaults are also model-dependent rather than universal. `gpt-5.5` defaults to `medium`"；"If you omit `reasoning.effort`, GPT-5.6 defaults to `medium` in both modes. GPT-6.1 Sol, GPT-6 Sol, and GPT-6 Luna also default to `medium`"（[reasoning 指南 L201、L220](https://developers.openai.com/api/docs/guides/reasoning.md)）。其余模型的默认值见 1.1 的表；gpt-5 的默认值**未确认**。
- **`summary`。** 不显式选择就不返回："This output will not be included unless you explicitly opt in"；`auto` 对多数模型相当于 `detailed`（[reasoning 指南「Reasoning summaries」](https://developers.openai.com/api/docs/guides/reasoning#reasoning-summaries)）。我们不展示思考过程，所以**不用发**。
- **`context`。** GPT-5.6 系列默认 `all_turns`，会把以前各轮的 reasoning 重新放进上下文；更早的模型默认 `current_turn`。原文："Persisted reasoning can be reused only within the same model family"（[reasoning 指南「Preserve reasoning across calls」](https://developers.openai.com/api/docs/guides/reasoning#preserve-reasoning-across-calls)）。
- **对话中途改强度。** GPT-6 系列可以在 input 里插一个 `configuration_update` item，不改请求级的 effort，也就不会让提示缓存失效（[reasoning 指南「Change reasoning mid-conversation」](https://developers.openai.com/api/docs/guides/reasoning#change-reasoning-mid-conversation)）。我们暂时用不上。
- **思考 token 也受 `max_output_tokens` 限制。** 原文："you could incur costs for input and reasoning tokens without receiving a visible response"，并且 "OpenAI recommends reserving at least 25,000 tokens for reasoning and outputs when you start experimenting"（[reasoning 指南「Allocating space for reasoning」](https://developers.openai.com/api/docs/guides/reasoning#allocating-space-for-reasoning)）。

### 1.3 Anthropic Messages：`thinking` + `output_config.effort`

- **两种思考模式**（[Extended thinking](https://platform.claude.com/docs/en/build-with-claude/extended-thinking)、[Thinking](https://platform.claude.com/docs/en/build-with-claude/thinking)）：
  - **adaptive**：`thinking:{type:"adaptive"}`，深浅交给 `output_config.effort` 控制。
  - **手动 extended**：`thinking:{type:"enabled", budget_tokens:N}`。原文："deprecated on the Claude 4.6 models... Claude 4.7 and later models do not support it and reject requests that use it, returning a 400 error."
- **`budget_tokens` 的约束**（[Budget rules and tuning](https://platform.claude.com/docs/en/build-with-claude/extended-thinking#budget-rules-and-tuning)）：
  - 最小 1,024。
  - 必须小于 `max_tokens`，因为思考 token 也计入 `max_tokens`。interleaved thinking 是例外。
  - 不能和 `max_tokens: 0` 一起用。
  - 预算是目标值，不是硬上限。
  - 思考用掉的 token 数看 `usage.output_tokens_details.thinking_tokens`；流式时只在最后一个 `message_delta` 里出现。
- **各模型的行为。** 下表来自 [Thinking troubleshooting「Thinking support, defaults, and rejected configurations by model」](https://platform.claude.com/docs/en/build-with-claude/thinking-troubleshooting#rejected-configurations) 和 [Thinking「Configuring thinking」](https://platform.claude.com/docs/en/build-with-claude/thinking#configuring-thinking)：

  | 模型 | 不传 `thinking` | `adaptive` | `enabled`+budget | `disabled` | `between_tools` |
  |---|---|---|---|---|---|
  | Opus 5.5 | adaptive（始终开） | ✓ | 400 | 400 | 400 |
  | Fable 5.1 / Fable 5 / Mythos 5.x | adaptive（始终开） | ✓ | 400 | 400 | 400 |
  | Sonnet 5.5 | adaptive（开） | ✓ | 400 | 400 | 关掉开头那段思考（effort 须 ≤ high） |
  | Opus 5 / Haiku 5.5 | adaptive（开） | ✓ | 400 | effort ≤ high 时关闭 | 400 |
  | Sonnet 5 | adaptive（开） | ✓ | 400 | 关闭 | 400 |
  | Opus 4.8 / 4.7 | **不思考** | ✓ | 400 | 关闭 | 400 |
  | Opus 4.6 / Sonnet 4.6 | **不思考** | ✓ | 可用（已废弃） | 关闭 | 400 |
  | Opus 4.5 / Sonnet 4.5 / Haiku 4.5 | **不思考** | **400** | ✓ | 关闭 | 400 |

- **`effort`**（[Effort](https://platform.claude.com/docs/en/build-with-claude/effort)）：
  - 写在 `output_config.effort`，取值 `low` / `medium` / `high` / `xhigh` / `max`。GA，不需要 beta 头。
  - 支持的模型：Fable / Mythos 系列、Opus 4.5 到 5.5、Sonnet 4.6 / 5 / 5.5、Haiku 5.5。Sonnet 4.5、Haiku 4.5 不在支持列表里；发了会怎样，**未确认**。
  - 默认值：原文 "Most Claude models default to high effort... Claude Opus 5.5 and Claude Haiku 5.5 default to medium"（[How effort works](https://platform.claude.com/docs/en/build-with-claude/effort#how-effort-works)）。
  - effort 影响整个回复：正文、工具调用、思考都会随之变化。
  - 在 adaptive 模式下，低档位时模型对简单问题可能完全不思考。原文："In a tool-use loop, follow-up requests that only process tool results can still skip thinking at any level"（[Effort with thinking](https://platform.claude.com/docs/en/build-with-claude/effort#effort-with-thinking)）。
  - 对聊天类场景的官方建议：
    - Sonnet 5.5："For chat and other latency-sensitive work, start with `medium` or `low`"。
    - Haiku 5.5："Use `low`... for chat"。
    - Sonnet 4.6："Explicitly set effort when using Sonnet 4.6 to avoid unexpected latency"。
- **`display`**（[Controlling thinking display](https://platform.claude.com/docs/en/build-with-claude/thinking#controlling-thinking-display)）：
  - 取值 `summarized` / `omitted` / `updates`（`updates` 是 beta）。
  - Opus 4.7 及以后的新模型默认 `omitted`；Opus 4.6、Sonnet 4.6 及更早默认 `summarized`。
  - 原文："The primary benefit is faster time-to-first-text-token when streaming"。
  - `display` 和 `disabled`、`between_tools` 一起发会 400。
- **开启思考后的其他限制**（[Limits and feature compatibility](https://platform.claude.com/docs/en/build-with-claude/thinking#limits-and-feature-compatibility)）：
  - **采样参数：** Opus 4.7 及以后、Sonnet 5 / 5.5、Haiku 5.5、Fable 系列，只要 `temperature`、`top_p`、`top_k` 不是默认值就 400，不管有没有开思考。更老的模型只在开思考时有限制：`temperature` 和 `top_k` 不能用，`top_p` 只能在 0.95 到 1 之间。
  - **tool_choice：** 手动模式只支持 `auto` 和 `none`。adaptive 模式支持强制工具，但 Opus 5.5、Sonnet 5.5、Fable 5.1、Mythos 5.1 一律拒绝强制工具（`any` / `tool`）。
  - **prefill：** Claude 4.6 及以后不管开不开思考都拒绝 prefill。
- **通过 Anthropic 的 OpenAI 兼容端点调用时，`reasoning_effort` 会被忽略**（参数表里写的是 "Ignored"）。要开思考得在 `extra_body` 里传 `thinking`，而且 OpenAI SDK 不会返回思考内容（[OpenAI SDK compatibility](https://platform.claude.com/docs/en/cli-sdks-libraries/libraries/openai-sdk)「Thinking support」一节和参数表）。

---

## 2. 工具调用时，思考内容要不要回传

### 2.1 Anthropic

- **规则**，原文见 [Preserving thinking blocks](https://platform.claude.com/docs/en/build-with-claude/thinking#preserving-thinking-blocks)：
  - "**Required:** within a tool-use turn, pass thinking blocks back. **Recommended:** across turns, pass everything back. **Allowed:** outside tool use, omit prior turns' thinking."
  - 最新那条 assistant 消息里，连续的 thinking 块必须和原始输出一致，"you can't rearrange, edit, or partially drop them. This includes `redacted_thinking` blocks"。
  - 改过的块会被拒绝，报错信息是 "`thinking` or `redacted_thinking` blocks in the latest assistant message cannot be modified"（[troubleshooting](https://platform.claude.com/docs/en/build-with-claude/thinking-troubleshooting#error-thinking-blocks-modified)）。文档列出的常见原因之一正是 "rebuilds the assistant message instead of echoing it"，而我们的 `anthropic.py:128-136` 现在就是这么做的。
- **signature 和 redacted_thinking：**
  - 每个 thinking 块都带 `signature`，签名里是完整思考内容的加密副本，回传时必须原样带回。
  - 流式时，签名以 `signature_delta` 的形式在 `content_block_stop` 之前到达（[Thinking encryption](https://platform.claude.com/docs/en/build-with-claude/thinking#thinking-encryption)）。
  - `redacted_thinking` 块的内容放在 `data` 字段里，同样要原样回传。文档原文提醒："Filtering on `block.type == "thinking"` alone silently drops `redacted_thinking` blocks"（[Redacted thinking blocks](https://platform.claude.com/docs/en/build-with-claude/thinking#redacted-thinking-blocks)）。
  - 在 `display:"omitted"` 下，thinking 文本是空串，但仍要连同签名一起回传。
- **不回传会怎样：**
  - **手动模式（`enabled`）：报错。** 原文："In extended (manual) mode, the API additionally enforces that the final assistant turn of a thinking-enabled request begins with a thinking block"（[Thinking with tool use](https://platform.claude.com/docs/en/build-with-claude/thinking#thinking-with-tool-use)、[Turn structure in manual mode](https://platform.claude.com/docs/en/build-with-claude/extended-thinking#turn-structure-in-manual-mode)）。
  - **adaptive 模式：文档没写后果。** 只写了 "Adaptive mode relaxes this: no assistant turn needs to start with one"，以及在一轮中途切换思考开关时 "the API doesn't error. Instead, it silently disables thinking for that request"。至于在 adaptive 下整轮丢掉 thinking 块，是报错、静默降级还是只影响效果，**未确认**。
  - 另有一条：原文 "If you never send thinking blocks back, the prefix check has nothing to reject, and the model gets none of its earlier reasoning"（[Preserved thinking](https://platform.claude.com/docs/en/build-with-claude/preserved-thinking)「Who needs to change anything」）。
- **Preserved thinking 的前缀检查**，和我们的引擎直接相关：
  - 从 Fable 5.1 起（包括 Opus 5.5、Sonnet 5.5、Haiku 5.5），回传的 thinking 块只有在它之前的 `system`、`tools`、`messages` 都没变时才有效。2026-08-31 及以后创建的账号默认强制检查，不满足就返回 400："Invalid `signature` in `thinking` block. The block is bound to a different conversation"（[troubleshooting](https://platform.claude.com/docs/en/build-with-claude/thinking-troubleshooting#error-thinking-block-signature)）。
  - 原文："Add, remove, rename, or edit a tool in `tools` → Invalid"。而 "`effort`, `max_tokens`, `output_config`, `tool_choice`, `metadata`... aren't part of the prefix check"（[What counts as an edit](https://platform.claude.com/docs/en/build-with-claude/preserved-thinking#what-counts-as-an-edit)）。
  - 我们第二次请求把 `tools` 改成了 `[]`，所以一旦开始回传 thinking 块，就会在这些模型上触发 400。修法是第二次请求保留同样的 `tools`，改发 `tool_choice:{type:"none"}`。
  - 另外两种办法：
    - 发 beta 头 `thinking-binding-controls-2026-08-01`，并设 `thinking.block_binding.prefix_mismatch_behavior:"drop_block"`，让服务端丢掉失效的块。代价是可能多花输出 token。
    - 用 `tool_removal` 块，需要 beta 头 `inline-tools-2026-09-15`。

    两者都是 beta，网关不一定透传。
  - 跨轮的系统提示词每轮重建，这一点不受影响：我们只在同一轮工具循环里回传 thinking，不把以前各轮的 thinking 存进数据库。
- **中途换模型：** 目标模型读不了的 thinking 块，API 会直接丢掉，不报错（[Switching models mid-conversation](https://platform.claude.com/docs/en/build-with-claude/thinking#thinking-block-preservation-by-model)）。

### 2.2 OpenAI Responses（`store:false`）

- **要不要回传。** 原文："we highly recommend you pass back any reasoning items returned with the last function call (in addition to the output of your function). If the model calls multiple functions consecutively, you should pass back all reasoning items, function call items, and function call output items, since the last `user` message"（[Keeping reasoning items in context](https://developers.openai.com/api/docs/guides/reasoning#keeping-reasoning-items-in-context)）。
- **`encrypted_content` 和 `include`。** 原文："When you create a response in stateless mode, reasoning items in the response's `output` array include an `encrypted_content` property by default. Stateless mode applies when `store` is `false`... The API still accepts the legacy `reasoning.encrypted_content` value in `include` for compatibility, but doesn't require it"（[Preserve reasoning without stored responses](https://developers.openai.com/api/docs/guides/reasoning#preserve-reasoning-without-stored-responses)）。
  - 也就是说，官方现在默认就返回加密内容。但兼容服务未必这样实现（比如 pi 在 Azure 上就碰到过漏发 `encrypted_content` 的情况，见 4.6），所以建议照旧显式发 `include:["reasoning.encrypted_content"]`。
- **流式时取哪个事件。** API 参考里 reasoning item 的说明原文："When streaming, use the completed reasoning item and its `encrypted_content` from the `response.output_item.done` event... The `encrypted_content` in `response.output_item.added` may be incomplete"（[Responses create 参考](https://developers.openai.com/api/reference/resources/responses/methods/create.md)，Reasoning object 一节）。
- **不回传的后果。** 文档只说回传 "allows the model to continue its reasoning process to produce better results in the most token-efficient manner"，**没有写会报错**。不回传具体会怎样，**未确认**；从措辞看，是效果变差或多花 token，而不是报错。
- **换模型时。** 原文："When you switch model families, the API omits incompatible reasoning from the model's context"（[reasoning 指南](https://developers.openai.com/api/docs/guides/reasoning#preserve-reasoning-across-calls)）。

### 2.3 Chat Completions 兼容服务

详见第 3 节，这里只列回传要求。

| 服务 | 思考字段 | 工具调用时回传要求 | 不回传的后果 | 来源 |
|---|---|---|---|---|
| OpenAI 官方 | 不返回 | — | — | 1.1 |
| DeepSeek | `reasoning_content` | 原文 "for requests carrying the tools parameter, the reasoning_content must be fully passed back to the API in all subsequent requests — even for turns where the model did not perform a tool call" | **400**（"If your code does not correctly pass back reasoning_content, the API will return a 400 error"） | https://api-docs.deepseek.com/guides/thinking_mode |
| Gemini 3 / 4（OpenAI 兼容） | 签名在 `tool_calls[].extra_content.google.thought_signature` | 当前这一轮里，每一步的第一个 function call 都要带签名 | **400**："Function call ... is missing a `thought_signature`"。并行调用必须按「FC1+签名, FC2, FR1, FR2」排列；交错排列也会 400。实在拿不到签名时，可以填哑签名 `"skip_thought_signature_validator"` | https://ai.google.dev/gemini-api/docs/generate-content/thought-signatures （「Validation」和「Signatures for OpenAI compatibility」两节） |
| Kimi K3 / K2.x | `reasoning_content` | K3 要求原样回传完整的 assistant message | 文档写的是「可能丢失推理上下文」，没写会报错 | https://platform.kimi.com/docs/guide/use-reasoning-effort ，https://platform.moonshot.cn/docs/api/chat |
| GLM | `reasoning_content` | 交错思考加工具时「必须显式保留」 | 写的是「效果下降或无法生效」，没写报错 | https://docs.bigmodel.cn/cn/guide/capabilities/thinking-mode |
| Qwen3.8 | `reasoning_content` | `preserve_thinking` 默认 true，要求「完整回传」 | 文档明写没有 `reasoning_content` 也不会报错 | https://help.aliyun.com/zh/model-studio/deep-thinking |
| 豆包 Seed 2.x | `reasoning_content` 加 `encrypted_content` | 「必须原样回传加密原文」 | 文档明写「未回传…不会报错」，但效果会下降 | https://www.volcengine.com/docs/82379/1449737 |

关于 Gemini 有一点要说明：签名校验写在 thought-signatures 页的通用「Validation」一节里，同一页又专门给出了 OpenAI 兼容接口下的签名写法。兼容端点上缺签名是否同样返回 400，页面没有单独写明，但我们找不到任何豁免的说法。

**两个按文档推断、尚未实测的现有问题：**

- **DeepSeek。** 我们的 chat 槽位如果接 DeepSeek V4，并且开着默认的思考模式：从第二轮起，只要请求带 `tools`（检索开着、本轮还没回顾），历史 assistant 消息里都没有 `reasoning_content`，按文档会 400。pi 的做法是给所有 assistant 消息补一个 `reasoning_content:""`（见 4.6）；这样能不能通过 DeepSeek 的校验，**未确认**。
- **Gemini 3 / 4 经 OpenAI 兼容接口。** 模型一旦调用 `recall_story`，第二次请求里的 assistant `tool_calls` 不带签名，按文档会 400。

---

## 3. 主要兼容服务商怎么开关思考（都走 Chat Completions 兼容接口）

### 3.1 Google Gemini（OpenAI 兼容接口）

- **映射表**（原文在 [OpenAI compatibility「Thinking」](https://ai.google.dev/gemini-api/docs/openai#thinking)，对应 `.md.txt` 第 93-99 行）：

  | `reasoning_effort` | 3.1 Pro（线上 HTML 已改为 4 Argon） | 3.1 Flash-Lite | 3 Flash | 2.5（`thinking_budget`） |
  |---|---|---|---|---|
  | minimal | low | minimal | minimal | 1,024 |
  | low | low | low | low | 1,024 |
  | medium | medium | medium | medium | 8,192 |
  | high | high | high | high | 24,576 |

- **不传：** 用模型默认的档位或预算。
- **关闭：** 原文 "you can set `reasoning_effort` to `"none"` for 2.5 models. Reasoning cannot be turned off for Gemini 2.5 Pro or 3 models"。
  - 原生文档另外写明 3.x 不能完全关掉，而且 `minimal` 也不保证一点不思考（https://ai.google.dev/gemini-api/docs/generate-content/thinking ）。
  - 给 3.x / 4 发 `none`、给 3.8 Flash 发 `minimal` 会返回什么，**未确认**。原生文档对 3.8 Flash 的 `minimal` 标的是 "Not supported (error)"。
- **各模型的默认值**（https://ai.google.dev/gemini-api/docs/thinking ）：
  - gemini-4-argon、3.8-flash、3.6-flash：medium。
  - 3.5-flash-lite：minimal。
  - 3.x-pro-preview、3-flash-preview：high。
  - 2.5 Pro：开，预算 128–32768，关不掉。
  - 2.5 Flash：开，预算设 0 可以关。
  - 2.5 Flash-Lite：默认不思考。
- **原生写法 `extra_body.google.thinking_config`：**
  - 字段有 `thinking_level`、`thinking_budget`、`include_thoughts`（https://ai.google.dev/gemini-api/docs/openai#extra-body ）。
  - 直接发 HTTP 时，请求体里要有一个字面上就叫 `"extra_body"` 的键（看 REST 示例）。
  - 原文："`reasoning_effort` and `thinking_level`/`thinking_budget` overlap functionality, so they can't be used at the same time"。同时发会返回什么错误，**未确认**。
- **思考摘要放在哪里：** `include_thoughts` 打开后，摘要出现在 OpenAI 格式响应的哪个字段，官方没写，**未确认**。
- **签名回传：** 见 2.3。

### 3.2 DeepSeek

- **当前模型：** `deepseek-flash`（V4.1-Flash）和 `deepseek-v4-pro`。旧名 `deepseek-chat`、`deepseek-reasoner` 计划于 2026-07-24 停用（https://api-docs.deepseek.com/quick_start/pricing ，https://api-docs.deepseek.com/updates ）。
- **参数**（https://api-docs.deepseek.com/api/create-chat-completion ）：
  - `thinking:{type:"enabled"|"disabled"}`，默认 enabled。
  - `reasoning_effort` 可取 `none` / `low` / `high` / `max`，默认 high，`none` 就是关闭。
  - 兼容映射：`minimal` 当作 low；`medium`、`xhigh` 当作 high。
- **思考模式下的其他限制**（https://api-docs.deepseek.com/guides/thinking_mode ）：
  - `temperature`、`presence_penalty`、`frequency_penalty` 不报错，但不起作用；`top_p` 实际下限是 0.95。
  - `tool_choice` 设成 required 或指定函数会返回 400（API 参考）。
- **思考字段：** `reasoning_content`，和 `content` 同级；流式时在 delta 里。
  - 请求不带 `tools` 时，历史里的 `reasoning_content` 会被忽略。
  - 请求带 `tools` 时，必须全部回传，见 2.3。
- **不认识的参数会怎样：** **未确认**。

### 3.3 阿里云百炼 Qwen

- **默认开关**（https://help.aliyun.com/zh/model-studio/deep-thinking ）：
  - 默认开：qwen3.5 到 3.8 的商业版（max / plus / flash 等）和 qwen3.5 开源版。
  - 默认关：`qwen-plus`、`qwen-flash`。
  - 不能关：qwen3.8-2.4t-a95b、qwen3.7-max-preview。
- **`enable_thinking` / `thinking_budget`**（https://help.aliyun.com/zh/model-studio/qwen-api-via-openai-chat-completions ）：
  - 这两个都不是 OpenAI 标准参数。直接发 HTTP 时放在请求体顶层；用 Python SDK 时放进 `extra_body`。
  - `thinking_budget` 的默认值是模型的最大思维链长度，qwen3.8 是 131072。
- **`reasoning_effort`：**
  - 只有 qwen3.8 系列和 qwen3.8-omni-flash 支持，默认 xhigh。
  - 有效值是 low / medium / xhigh；`high` 和 `max` 当作 xhigh，`minimal` 当作 low，`none` 等于 `enable_thinking=false`。
  - 发其他值会报错；和 `thinking_budget` 同时设置也会报错。
  - 给 3.8 以外的模型发 `reasoning_effort` 会怎样，**未确认**。
- **流式：** 部分开源版只支持流式调用（"parameter.enable_thinking only support stream call"）。我们本来就是流式，不受影响。
- **工具：** 思考模式下 `tool_choice` 不能用 required 或对象形式（https://help.aliyun.com/zh/model-studio/qwen-function-calling ）。

### 3.4 Kimi / Moonshot

- **当前模型：** kimi-k3、kimi-k2.7-code、kimi-k2.6。kimi-k2.5 和 moonshot-v1 已在 2026-08-31 下线（https://platform.kimi.com/docs/models ）。
- **各模型怎么控制思考**（https://platform.kimi.com/docs/api/models-overview ，https://platform.kimi.com/docs/guide/use-thinking-models ）：
  - **K3**：始终思考，不支持 `thinking` 参数。顶层 `reasoning_effort` 可取 low / high / max，默认 max。
  - **k2.7-code**：始终思考，只接受 `thinking:{type:"enabled", keep:"all"}`，传别的会报错。
  - **k2.6**：`thinking.type` 可取 enabled（默认）或 disabled。不支持 `reasoning_effort`。
- **采样参数是固定值，传别的值会报错。** k2.6 思考时 temperature 固定为 1.0，不思考时为 0.6（models-overview）。
- **思考字段：** `reasoning_content`，流式时一定先于 `content` 出现。
- **没查到的：** K3 收到 `medium` 或 `none`、k2.6 收到 `reasoning_effort` 会怎样，都**未确认**。

### 3.5 智谱 GLM

- **默认开关**（https://docs.bigmodel.cn/cn/guide/capabilities/thinking-mode ，https://docs.bigmodel.cn/cn/guide/capabilities/thinking ）：
  - GLM-5.3、5.2、5.1、5、4.7 默认开；4.6 自动判断要不要思考。
  - 5.3 和 5.3-Flash 关不掉，传 disabled 会报错。
  - 两页文档在「哪些模型能关」上说法不一致。
- **参数**（https://docs.bigmodel.cn/api-reference/模型-api/对话补全 ）：
  - `thinking.type` 可取 enabled / disabled，默认 enabled。
  - `reasoning_effort` 只有 5.2 及以上支持，默认 max。
    - 5.3 只接受 low / high / max，其他值报错。
    - 5.2 上 `none` / `minimal` 等于不思考，low / medium 当作 high，xhigh 当作 max。
- **历史思考：** `clear_thinking` 默认 true，即丢掉历史各轮的思考内容。

### 3.6 豆包 / 火山方舟

来源都是 https://www.volcengine.com/docs/82379/1449737 （2026-10-09 更新）。

- **`thinking.type`：** 文档定义了 enabled / disabled / auto 三个值，但目前列出的模型（seed-2.1 / 2.0、character、deepseek-v4.x、glm-5-2）都只写了 enabled（默认）和 disabled。
- **`reasoning_effort`：**
  - 支持的模型接受全部 7 档。
  - 默认值：seed-2.1 是 high；seed-2.0 和 character 模型是 medium。
  - seed 系列的 `minimal` 就是关闭思考，`none` 当作 minimal。
- **思考内容：** 返回 `reasoning_content`（摘要）和 `encrypted_content`（加密原文），回传要求见 2.3。

### 3.7 汇总

| 服务商 | 用什么参数控制 | 关闭方式 | 不传时 | 我们发标准 `reasoning_effort` 能不能用 |
|---|---|---|---|---|
| OpenAI | `reasoning_effort` | `none`（GPT-6 Astra / 6.1 Sol 没有这个值） | 看模型，见 1.1 | 能 |
| Gemini | `reasoning_effort` 或 `extra_body.google.thinking_config` | 只有 2.5 Flash / Flash-Lite 能用 `none` | 开 | 能用低 / 中 / 高；关闭基本做不到 |
| DeepSeek | `thinking.type`、`reasoning_effort` | `disabled` 或 `none` | 开，high | 能（中会被当作 high） |
| Qwen | `enable_thinking`、`thinking_budget`、`reasoning_effort`（只有 3.8） | `enable_thinking:false` | 3.5–3.8 开；qwen-plus / qwen-flash 关 | 只有 3.8 能；其他模型要靠额外 JSON |
| Kimi | K3 用 `reasoning_effort`；k2.6 用 `thinking` | 只有 k2.6 能 `disabled` | 开（K3 是 max） | 只有 K3 能，且没有「中」和「关闭」 |
| GLM | `thinking.type`、`reasoning_effort`（5.2 及以上） | `disabled`（5.3 关不掉） | 开（effort max） | 只有 5.2 及以上能；关闭要靠额外 JSON |
| 豆包 | `thinking.type`、`reasoning_effort` | `disabled`，或 effort 设为 `minimal` / `none` | 开 | 能 |

---

## 4. 网关 / 聚合项目怎么做统一映射

### 4.1 LiteLLM（BerriAI/litellm）

- **预算常量**，都可以用同名环境变量覆盖：
  - `DEFAULT_REASONING_EFFORT_{LOW,MEDIUM,HIGH,XHIGH,MAX}_THINKING_BUDGET` 依次是 1024 / 2048 / 4096 / 8192 / 16384（[constants.py L317-L323](https://github.com/BerriAI/litellm/blob/ff2718bcfa5266fe6da92891d7a88633a04fd5fd/litellm/constants.py#L317-L323)）。
  - `minimal` 默认 128（[L297-L299](https://github.com/BerriAI/litellm/blob/ff2718bcfa5266fe6da92891d7a88633a04fd5fd/litellm/constants.py#L297-L299)）。Gemini 2.5 另有单独的 minimal 值：Flash 1，Pro 128，Flash-Lite 512（[L267-L276](https://github.com/BerriAI/litellm/blob/ff2718bcfa5266fe6da92891d7a88633a04fd5fd/litellm/constants.py#L267-L276)）。
  - `ANTHROPIC_MIN_THINKING_BUDGET_TOKENS = 1024`（[L586-L588](https://github.com/BerriAI/litellm/blob/ff2718bcfa5266fe6da92891d7a88633a04fd5fd/litellm/constants.py#L586-L588)）。
- **`reasoning_effort` 怎么转成 Anthropic 参数**，见 `AnthropicConfig._map_reasoning_effort`（[anthropic/chat/transformation.py L1315-L1373](https://github.com/BerriAI/litellm/blob/ff2718bcfa5266fe6da92891d7a88633a04fd5fd/litellm/llms/anthropic/chat/transformation.py#L1315-L1373)）：
  - `none`：把 `thinking` 和 `output_config` 都删掉，**不发 `disabled`**（[L1667-L1699](https://github.com/BerriAI/litellm/blob/ff2718bcfa5266fe6da92891d7a88633a04fd5fd/litellm/llms/anthropic/chat/transformation.py#L1667-L1699)）。这意味着在默认开思考的新 Claude 上，`none` 关不掉思考。
  - adaptive 模型（看模型表里的 `supports_adaptive_thinking` 标志，[common_utils.py L860-L869](https://github.com/BerriAI/litellm/blob/ff2718bcfa5266fe6da92891d7a88633a04fd5fd/litellm/llms/anthropic/common_utils.py#L860-L869)）：发 `thinking:{type:"adaptive", display:"summarized"}` 加 `output_config.effort`。minimal 当作 low，其余值原样（[L274-L281](https://github.com/BerriAI/litellm/blob/ff2718bcfa5266fe6da92891d7a88633a04fd5fd/litellm/llms/anthropic/chat/transformation.py#L274-L281)）。
  - 其他模型：发 `enabled` 加上面常量里的 `budget_tokens`。
- **调用方直接传 Anthropic 的 `thinking` 时，会按目标模型改写**（[common_utils.py L889-L965](https://github.com/BerriAI/litellm/blob/ff2718bcfa5266fe6da92891d7a88633a04fd5fd/litellm/llms/anthropic/common_utils.py#L889-L965)）：
  - 发给 4.7 及以后的 `enabled`+budget，改写成 adaptive，effort 按预算区间换算：≥8192 → xhigh，≥4096 → high，≥2048 → medium，更小 → low。
  - 发给 4.6 以前模型的 `adaptive`，降成 medium 档的预算。
- **`reasoning_effort` 怎么转成 Gemini 参数**（[vertex_and_google_ai_studio_gemini.py L890-L978](https://github.com/BerriAI/litellm/blob/ff2718bcfa5266fe6da92891d7a88633a04fd5fd/litellm/llms/vertex_ai/gemini/vertex_and_google_ai_studio_gemini.py#L890-L978)）：
  - 2.5：转成 `thinkingBudget`；`none` / `disable` 转成 `thinkingBudget:0`。
  - 3：转成 `thinkingLevel`；`none` / `disable` 改成最低档，同时设 `includeThoughts:false`，因为 Gemini 3 关不掉思考。
- **思考内容的暴露和回传：**
  - Anthropic 的 thinking / redacted_thinking 块会原样放进 `message.thinking_blocks`（带签名），文本拼成 `reasoning_content`（[transformation.py L2244-L2335](https://github.com/BerriAI/litellm/blob/ff2718bcfa5266fe6da92891d7a88633a04fd5fd/litellm/llms/anthropic/chat/transformation.py#L2244-L2335)）。
  - 回传时读 assistant 消息的 `thinking_blocks`，放在 content 最前面。源码注释原文是 "IMPORTANT: ADD THIS FIRST, ELSE ANTHROPIC WILL RAISE AN ERROR"（[factory.py L2613-L2616](https://github.com/BerriAI/litellm/blob/ff2718bcfa5266fe6da92891d7a88633a04fd5fd/litellm/litellm_core_utils/prompt_templates/factory.py#L2613-L2616)）。
  - 如果整段对话都没带 thinking_blocks，并且开了 `modify_params`，LiteLLM 会在这一轮删掉 `thinking`（[transformation.py L1993-L2012](https://github.com/BerriAI/litellm/blob/ff2718bcfa5266fe6da92891d7a88633a04fd5fd/litellm/llms/anthropic/chat/transformation.py#L1993-L2012)）。
  - Gemini 的签名放在 `tool_calls[].function.provider_specific_fields.thought_signature`（[L1646-L1655](https://github.com/BerriAI/litellm/blob/ff2718bcfa5266fe6da92891d7a88633a04fd5fd/litellm/llms/vertex_ai/gemini/vertex_and_google_ai_studio_gemini.py#L1646-L1655)）。
- **对我们的影响：** 用户把 base_url 指向 LiteLLM 代理时，我们发的 `reasoning_effort` 能正常转换。但思考内容要回传，就得把 LiteLLM 的非标准字段 `thinking_blocks` 原样带回。

### 4.2 OpenRouter

来源：[Reasoning Tokens](https://openrouter.ai/docs/guides/best-practices/reasoning-tokens)、[Parameters](https://openrouter.ai/docs/api/reference/parameters)。

- **统一参数：**
  - `reasoning:{effort | max_tokens（二选一）, exclude（默认 false）, enabled}`。
  - effort 可取 `max` / `xhigh` / `high` / `medium` / `low` / `minimal` / `none`，`none` 表示完全关闭。
  - 只写 `enabled:true` 相当于 medium。
  - Parameters 页也把顶层 `reasoning_effort`（"OpenAI-style"）列为可选参数。顶层 `reasoning_effort` 和 `reasoning` 对象同时出现时谁优先，**未确认**。
- **effort 换算成 Anthropic 预算：**
  - 公式 `budget_tokens = max(min(max_tokens × ratio, 128000), 1024)`。
  - ratio：max / xhigh 0.95，high 0.8，medium 0.5，low 0.2，minimal 0.1。
  - 对 Claude 4.6 及以后，是不是改发 adaptive 加 effort，**未确认**。
- **Gemini 3：** effort 直接对应 `thinkingLevel`，xhigh 降成 high。
- **默认行为：** 每个模型是否默认开思考，看 `GET /api/v1/models` 返回的 `reasoning.default_effort`、`default_enabled`、`mandatory`。`mandatory=true` 的模型不能发 `none`。
- **回传：**
  - 返回两种形式：`message.reasoning`（字符串，`reasoning_content` 是它的别名）和 `message.reasoning_details`（数组）。流式时对应 `delta.reasoning_details`。
  - 加密或摘要类的思考必须用 `reasoning_details` 回传，原文 "the entire sequence of consecutive reasoning blocks must match the outputs generated by the model during the original request; you cannot rearrange or modify"。

### 4.3 CLIProxyAPI（router-for-me/CLIProxyAPI）

- **模型名后缀：** 写成 `model(value)`，比如 `gemini-2.5-pro(8192)`、`gpt-5.2(high)`。后缀优先于请求体里的参数（[suffix.go L23-L44](https://github.com/router-for-me/CLIProxyAPI/blob/0d18d3b365be000eeaee7de4615f9da596b2059d/internal/thinking/suffix.go#L23-L44)，[apply.go L136-L137](https://github.com/router-for-me/CLIProxyAPI/blob/0d18d3b365be000eeaee7de4615f9da596b2059d/internal/thinking/apply.go#L136-L137)、[L466-L497](https://github.com/router-for-me/CLIProxyAPI/blob/0d18d3b365be000eeaee7de4615f9da596b2059d/internal/thinking/apply.go#L466-L497)）。
- **档位和预算互换**（[convert.go](https://github.com/router-for-me/CLIProxyAPI/blob/0d18d3b365be000eeaee7de4615f9da596b2059d/internal/thinking/convert.go)）：
  - 档位 → 预算：none 0，auto -1，minimal 512，low 1024，medium 8192，high 24576，xhigh 32768，max 128000（[L11-L22](https://github.com/router-for-me/CLIProxyAPI/blob/0d18d3b365be000eeaee7de4615f9da596b2059d/internal/thinking/convert.go#L11-L22)）。
  - 预算 → 档位按区间换算（[L49-L97](https://github.com/router-for-me/CLIProxyAPI/blob/0d18d3b365be000eeaee7de4615f9da596b2059d/internal/thinking/convert.go#L49-L97)）。
  - 档位 → Claude effort：minimal 当作 low；xhigh / max 在模型支持时映射为 max，否则 high（[L115-L134](https://github.com/router-for-me/CLIProxyAPI/blob/0d18d3b365be000eeaee7de4615f9da596b2059d/internal/thinking/convert.go#L115-L134)）。
- **怎么读用户的意图：** 分别从 Claude、Gemini、OpenAI 三种请求格式里取（[apply.go L716-L899](https://github.com/router-for-me/CLIProxyAPI/blob/0d18d3b365be000eeaee7de4615f9da596b2059d/internal/thinking/apply.go#L716-L899)），再按模型注册表里的能力换算成目标模型能接受的值（[validate.go L86-L190](https://github.com/router-for-me/CLIProxyAPI/blob/0d18d3b365be000eeaee7de4615f9da596b2059d/internal/thinking/validate.go#L86-L190)）。
- **写进 Claude 请求**（[claude/apply.go L84-L167](https://github.com/router-for-me/CLIProxyAPI/blob/0d18d3b365be000eeaee7de4615f9da596b2059d/internal/thinking/provider/claude/apply.go#L84-L167)）：
  - 关闭：发 `disabled`。
  - 支持档位的模型：发 adaptive 加 effort。
  - 其他模型：发 `enabled` 加 budget，并把 budget 压到 `max_tokens-1` 以内。
- **写进 Gemini 请求**（[gemini/apply.go L81-L165](https://github.com/router-for-me/CLIProxyAPI/blob/0d18d3b365be000eeaee7de4615f9da596b2059d/internal/thinking/provider/gemini/apply.go#L81-L165)）：按模型能力发 `thinkingLevel` 或 `thinkingBudget`。
- **思考内容：** Claude 的 `thinking_delta` 转成 OpenAI 格式的 `reasoning_content`，**签名不暴露**（[claude_openai_response.go L192-L195](https://github.com/router-for-me/CLIProxyAPI/blob/0d18d3b365be000eeaee7de4615f9da596b2059d/internal/translator/claude/openai/chat-completions/claude_openai_response.go#L192-L195)）。回传的 `reasoning_content` 只在兼容端点模式下才变回 thinking 块，而且没有签名（[claude_openai_request.go L203-L210](https://github.com/router-for-me/CLIProxyAPI/blob/0d18d3b365be000eeaee7de4615f9da596b2059d/internal/translator/claude/openai/chat-completions/claude_openai_request.go#L203-L210)）。所以经它用 Chat Completions 调 Claude 时，我们没办法正确回传 thinking 块。
- 模型注册表里每个模型的具体能力值没有查，**未确认**。

### 4.4 new-api（QuantumNous/new-api；Calcium-Ion/new-api 会重定向到同一个仓库）

- **模型名后缀：**
  - 新语法 `model@effort:high@thinking:on|adaptive|off|<预算>`（[reasoning/suffix.go L39-L112](https://github.com/QuantumNous/new-api/blob/7de10f2c602b50122017556e8a09cb7c488c273c/relaykit/relayconvert/reasoning/suffix.go#L39-L112)）。
  - 旧语法 `-thinking`、`-nothinking`、`-thinking-<预算>`、`-high` 等（[L12-L16](https://github.com/QuantumNous/new-api/blob/7de10f2c602b50122017556e8a09cb7c488c273c/relaykit/relayconvert/reasoning/suffix.go#L12-L16)、[L223-L275](https://github.com/QuantumNous/new-api/blob/7de10f2c602b50122017556e8a09cb7c488c273c/relaykit/relayconvert/reasoning/suffix.go#L223-L275)）。
  - 后缀会覆盖请求体里的参数（[relay/helper/reasoning_suffix.go L25-L122](https://github.com/QuantumNous/new-api/blob/7de10f2c602b50122017556e8a09cb7c488c273c/relay/helper/reasoning_suffix.go#L25-L122)）。
- **Claude：**
  - 按模型名前缀判断能力：4.6+ 走 adaptive，Sonnet 5.5 的「关闭」发 `between_tools`，Opus 5.5 / Fable / Mythos 关不掉（[reasoning/claude.go L45-L113](https://github.com/QuantumNous/new-api/blob/7de10f2c602b50122017556e8a09cb7c488c273c/relaykit/relayconvert/reasoning/claude.go#L45-L113)）。
  - 预算 = `max(max_tokens × 百分比, 1024)`，并压到 `max_tokens-1` 以内。百分比：minimal 5%，low 20%，medium 50%，high 80%，xhigh / max 95%（[L345-L349](https://github.com/QuantumNous/new-api/blob/7de10f2c602b50122017556e8a09cb7c488c273c/relaykit/relayconvert/reasoning/claude.go#L345-L349)、[L476-L497](https://github.com/QuantumNous/new-api/blob/7de10f2c602b50122017556e8a09cb7c488c273c/relaykit/relayconvert/reasoning/claude.go#L476-L497)）。
- **Gemini：**
  - 2.5 的档位 → 预算照搬 Google 自己的 OpenAI 兼容映射：minimal / low 1024，medium 8192，high 24576（[reasoning/gemini.go L479-L495](https://github.com/QuantumNous/new-api/blob/7de10f2c602b50122017556e8a09cb7c488c273c/relaykit/relayconvert/reasoning/gemini.go#L479-L495)）。
  - Gemini 3 的「关闭」改成最低档（[L176-L209](https://github.com/QuantumNous/new-api/blob/7de10f2c602b50122017556e8a09cb7c488c273c/relaykit/relayconvert/reasoning/gemini.go#L176-L209)）。
- 回传路径没有看，**未确认**。

### 4.5 yetone 的 magpie

- **怎么找到的：** 在 `gh api users/yetone/repos --paginate`（共 636 个仓库）里只找到 `magpie` 和 `magpie-releases` 两个相关仓库；`gh search repos magpie --owner yetone` 的结果也一样。yetone 所在的组织里没有别的 magpie。
- **结论：** 确认是 **LLM 网关**，用 Go 写，在本地运行。仓库描述："Every agent's model. One place. Codex on DeepSeek, Claude Code on Kimi, from the menu bar."（https://github.com/yetone/magpie ）
- **内部的统一表示：**
  - 思考设置统一成 `Effort`（low–max）、`Thinking`、`ThinkOff` 三个字段（[ir.go L155-L160](https://github.com/yetone/magpie/blob/407595b2abb202a5de82e7bf1b90a5e83b28ffd0/internal/gateway/ir.go#L155-L160)）。
  - minimal 和 none 都当作 low（[L684-L694](https://github.com/yetone/magpie/blob/407595b2abb202a5de82e7bf1b90a5e83b28ffd0/internal/gateway/ir.go#L684-L694)）。只有 Chat 入口的 `reasoning_effort:"none"` 会另外把 `ThinkOff` 设上（[chat.go L75-L83](https://github.com/yetone/magpie/blob/407595b2abb202a5de82e7bf1b90a5e83b28ffd0/internal/gateway/chat.go#L75-L83)）。
- **Anthropic：**
  - 预算表 `budgetOf`：low 4096，medium 10000，high 24000，xhigh / max 32000（[ir.go L731-L743](https://github.com/yetone/magpie/blob/407595b2abb202a5de82e7bf1b90a5e83b28ffd0/internal/gateway/ir.go#L731-L743)）。
  - 发请求时（[anthropic.go L876-L911](https://github.com/yetone/magpie/blob/407595b2abb202a5de82e7bf1b90a5e83b28ffd0/internal/gateway/anthropic.go#L876-L911)）：
    - 关闭：发 `disabled`。
    - Claude ≥4.6（按模型名判断）：发 adaptive，加 `display:"summarized"` 和 effort（[L403-L418](https://github.com/yetone/magpie/blob/407595b2abb202a5de82e7bf1b90a5e83b28ffd0/internal/gateway/anthropic.go#L403-L418)）。
    - 其他模型：发 `enabled`，预算取 `min(budgetOf, max_tokens-1024)`。
- **Gemini 兼容接口**（[chat.go L459-L474](https://github.com/yetone/magpie/blob/407595b2abb202a5de82e7bf1b90a5e83b28ffd0/internal/gateway/chat.go#L459-L474)、[L731-L756](https://github.com/yetone/magpie/blob/407595b2abb202a5de82e7bf1b90a5e83b28ffd0/internal/gateway/chat.go#L731-L756)）：
  - 发 `reasoning_effort`；「关闭」发 minimal。
  - 需要看思考内容时，改用 `extra_body.google.thinking_config`。
- magpie 原生调用 Gemini / Vertex 的那条路径没有看，**未确认**。

### 4.6 pi 的协议适配层（earendil-works/pi 的 `packages/ai`）

**先核实名字。** `badlogic/pi-mono` 已经改名为 **`earendil-works/pi`**：`gh api repos/badlogic/pi-mono` 返回的 `full_name` 是 `earendil-works/pi`。npm 包 `@mariozechner/pi-ai` 已标为弃用，弃用说明是 "please use @earendil-works/pi-ai instead"，最后一个版本 0.73.1。仓库里现在的包名是 `@earendil-works/pi-ai@1.2.0`（[package.json L2-L3](https://github.com/earendil-works/pi/blob/d20c6e96625143bdb6fc533843d30601a9f6fcf8/packages/ai/package.json#L2-L3)）。下文链接的前缀都是 `https://github.com/earendil-works/pi/blob/d20c6e96…/packages/ai/`。

**一、统一档位和预算**

- **档位：**
  - `THINKING_LEVELS = minimal/low/medium/high/xhigh/max`，再加上一个 `off`（[model-schema.ts L3-L4](https://github.com/earendil-works/pi/blob/d20c6e96625143bdb6fc533843d30601a9f6fcf8/packages/ai/src/providers/model-schema.ts#L3-L4)）。
  - 每个模型有一个 `thinkingLevelMap`，把档位映射成这家的原生值；映射值为 `null` 表示不支持该档（[model-schema.ts L14-L15](https://github.com/earendil-works/pi/blob/d20c6e96625143bdb6fc533843d30601a9f6fcf8/packages/ai/src/providers/model-schema.ts#L14-L15)）。
  - 请求的档位不支持时，**先往高找**最近的可用档，找不到再往低找（[models.ts L1228-L1261](https://github.com/earendil-works/pi/blob/d20c6e96625143bdb6fc533843d30601a9f6fcf8/packages/ai/src/models.ts#L1228-L1261)）。
  - pi 的「不设置」等同于 off：`options?.reasoning ?? "off"`（[simple-options.ts L42](https://github.com/earendil-works/pi/blob/d20c6e96625143bdb6fc533843d30601a9f6fcf8/packages/ai/src/api/simple-options.ts#L42)）。**这一点和我们打算的「不设置就什么都不发」不同**：pi 是编程代理，默认关掉思考；我们要照顾各家模型自己的默认行为。
- **预算**（[simple-options.ts L68-L108](https://github.com/earendil-works/pi/blob/d20c6e96625143bdb6fc533843d30601a9f6fcf8/packages/ai/src/api/simple-options.ts#L68-L108)）：
  - `MIN_ANSWER_TOKENS = 1024`。
  - `DEFAULT_THINKING_BUDGETS = {minimal:1024, low:2048, medium:8192, high:16384}`；xhigh / max 按 high 算。
  - 调整规则：`maxTokens = min(调用方 maxTokens + budget, 模型上限)`；如果 `maxTokens ≤ budget`，就把 budget 压到 `maxTokens − 1024`。也就是说，**在用户设的正文长度上限之外，再额外加上思考预算**。

**二、各协议实际发什么**

- **Anthropic**（[anthropic-messages.ts](https://github.com/earendil-works/pi/blob/d20c6e96625143bdb6fc533843d30601a9f6fcf8/packages/ai/src/api/anthropic-messages.ts)）：
  - off：只要模型的 `thinkingLevelMap.off` 不是 `null`，就发 `thinking:{type:"disabled"}`；是 `null`（比如 fable-5）就什么都不发（[L1297-L1299](https://github.com/earendil-works/pi/blob/d20c6e96625143bdb6fc533843d30601a9f6fcf8/packages/ai/src/api/anthropic-messages.ts#L1297-L1299)）。
  - adaptive 模型（`compat.forceAdaptiveThinking`）：发 `thinking:{type:"adaptive", display}` 加 `output_config:{effort}`。minimal / low 都映射为 low（[L941-L959](https://github.com/earendil-works/pi/blob/d20c6e96625143bdb6fc533843d30601a9f6fcf8/packages/ai/src/api/anthropic-messages.ts#L941-L959)、[L1283-L1288](https://github.com/earendil-works/pi/blob/d20c6e96625143bdb6fc533843d30601a9f6fcf8/packages/ai/src/api/anthropic-messages.ts#L1283-L1288)）。哪些模型算 adaptive，由生成脚本按模型 ID 判断（[generate-models.ts L615-L634](https://github.com/earendil-works/pi/blob/d20c6e96625143bdb6fc533843d30601a9f6fcf8/packages/ai/scripts/generate-models.ts#L615-L634)）。
  - 旧模型：发 `enabled` 加 `budget_tokens = min(budget, maxTokens−1024)`（[L991-L1008](https://github.com/earendil-works/pi/blob/d20c6e96625143bdb6fc533843d30601a9f6fcf8/packages/ai/src/api/anthropic-messages.ts#L991-L1008)），同时加 interleaved beta 头（[L1141-L1148](https://github.com/earendil-works/pi/blob/d20c6e96625143bdb6fc533843d30601a9f6fcf8/packages/ai/src/api/anthropic-messages.ts#L1141-L1148)）。
  - `display` 默认 `summarized`（[L260-L271](https://github.com/earendil-works/pi/blob/d20c6e96625143bdb6fc533843d30601a9f6fcf8/packages/ai/src/api/anthropic-messages.ts#L260-L271)）。
  - 支持对话中途改 effort 的模型：发 `block_binding:{prefix_mismatch_behavior:"drop_block"}`（[L1269-L1278](https://github.com/earendil-works/pi/blob/d20c6e96625143bdb6fc533843d30601a9f6fcf8/packages/ai/src/api/anthropic-messages.ts#L1269-L1278)）。
- **Responses：**
  - 开启：发 `reasoning:{effort, summary:"auto"}` 和 `include:["reasoning.encrypted_content"]`。
  - 关闭：发 `reasoning:{effort: map.off ?? "none"}`。gpt-5 的 `off` 映射为 `null`，也就是不发（[openai-responses.ts L363-L380](https://github.com/earendil-works/pi/blob/d20c6e96625143bdb6fc533843d30601a9f6fcf8/packages/ai/src/api/openai-responses.ts#L363-L380)，[generate-models.ts L455-L468](https://github.com/earendil-works/pi/blob/d20c6e96625143bdb6fc533843d30601a9f6fcf8/packages/ai/scripts/generate-models.ts#L455-L468)）。
- **Chat Completions：**
  - 默认格式：开启时发 `reasoning_effort`；关闭时只有当 `map.off` 是字符串才发，而且前提是 `compat.supportsReasoningEffort` 为真（[openai-completions.ts L969-L977](https://github.com/earendil-works/pi/blob/d20c6e96625143bdb6fc533843d30601a9f6fcf8/packages/ai/src/api/openai-completions.ts#L969-L977)）。
  - 各家方言见下面第四部分。
- **Google 原生：**
  - Gemini 3 发 `thinkingLevel`，2.5 发 `thinkingBudget`。2.5-pro 的预算表是 128 / 2048 / 8192 / 32768（[google-generative-ai.ts L431-L471](https://github.com/earendil-works/pi/blob/d20c6e96625143bdb6fc533843d30601a9f6fcf8/packages/ai/src/api/google-generative-ai.ts#L431-L471)）。
  - off：发 `thinkingBudget:0`；关不掉的模型改发最低档（[google-shared.ts L102-L111](https://github.com/earendil-works/pi/blob/d20c6e96625143bdb6fc533843d30601a9f6fcf8/packages/ai/src/api/google-shared.ts#L102-L111)）。

**三、工具调用时怎么存、怎么回传**

- **存储结构：** 内部类型是 `ThinkingContent {thinking, thinkingSignature?, redacted?}`。`thinkingSignature` 是**通用的不透明字段**，每家往里存的东西不同；`ToolCall.thoughtSignature` 专给 Google 用；`AssistantMessage` 记录了 `api`、`provider`、`model`（[types.ts L414-L444](https://github.com/earendil-works/pi/blob/d20c6e96625143bdb6fc533843d30601a9f6fcf8/packages/ai/src/types.ts#L414-L444)、[L565-L577](https://github.com/earendil-works/pi/blob/d20c6e96625143bdb6fc533843d30601a9f6fcf8/packages/ai/src/types.ts#L565-L577)）。
- **Anthropic：**
  - thinking 块存 `signature`；redacted 块把 `data` 存进 thinkingSignature（[L737-L815](https://github.com/earendil-works/pi/blob/d20c6e96625143bdb6fc533843d30601a9f6fcf8/packages/ai/src/api/anthropic-messages.ts#L737-L815)）。
  - 回传时原样写回。没有签名的块（比如流被中断）改成普通 text（[L1449-L1485](https://github.com/earendil-works/pi/blob/d20c6e96625143bdb6fc533843d30601a9f6fcf8/packages/ai/src/api/anthropic-messages.ts#L1449-L1485)）。
- **Responses：**
  - 在 `output_item.done` 时，把**整个 reasoning item 序列化成 JSON** 存进 thinkingSignature（[openai-responses-shared.ts L688-L693](https://github.com/earendil-works/pi/blob/d20c6e96625143bdb6fc533843d30601a9f6fcf8/packages/ai/src/api/openai-responses-shared.ts#L688-L693)）。Azure 的 `output_item.done` 有时缺 `encrypted_content`，就从最终 response 里补上（[L534-L556](https://github.com/earendil-works/pi/blob/d20c6e96625143bdb6fc533843d30601a9f6fcf8/packages/ai/src/api/openai-responses-shared.ts#L534-L556)）。
  - 回传时把 JSON 解析回来，原样放进 input（[L255-L330](https://github.com/earendil-works/pi/blob/d20c6e96625143bdb6fc533843d30601a9f6fcf8/packages/ai/src/api/openai-responses-shared.ts#L255-L330)）。
- **Chat Completions：**
  - 依次检查 `reasoning_content`、`reasoning`、`reasoning_text`，用第一个非空的字段，并把**字段名**存进 thinkingSignature（[openai-completions.ts L607-L637](https://github.com/earendil-works/pi/blob/d20c6e96625143bdb6fc533843d30601a9f6fcf8/packages/ai/src/api/openai-completions.ts#L607-L637)）。
  - OpenRouter 的 `reasoning_details` 数组整体 JSON 化后保存（[L196-L271](https://github.com/earendil-works/pi/blob/d20c6e96625143bdb6fc533843d30601a9f6fcf8/packages/ai/src/api/openai-completions.ts#L196-L271)）。
  - 回传规则（[L1310-L1392](https://github.com/earendil-works/pi/blob/d20c6e96625143bdb6fc533843d30601a9f6fcf8/packages/ai/src/api/openai-completions.ts#L1310-L1392)）：
    - 写回原来的同名字段，或写回 `reasoning_details`。
    - compat 里 `requiresReasoningContentOnAssistantMessages` 为真时（DeepSeek 默认如此），**给每条 assistant 消息补上 `reasoning_content:""`**。
    - `requiresThinkingAsText` 为真时，把思考内容当纯文本拼在正文前面。
- **Gemini：** 思考 part、文本 part、functionCall part 上的签名分别存。只有服务商和模型都相同、并且签名是合法 base64 时才回传（[google-shared.ts L113-L160](https://github.com/earendil-works/pi/blob/d20c6e96625143bdb6fc533843d30601a9f6fcf8/packages/ai/src/api/google-shared.ts#L113-L160)、[L230-L276](https://github.com/earendil-works/pi/blob/d20c6e96625143bdb6fc533843d30601a9f6fcf8/packages/ai/src/api/google-shared.ts#L230-L276)）。

**三点五、中途换模型**

所有适配器发请求前都先过一遍 `transformMessages`（[transform-messages.ts L64-L235](https://github.com/earendil-works/pi/blob/d20c6e96625143bdb6fc533843d30601a9f6fcf8/packages/ai/src/api/transform-messages.ts#L64-L235)）：

- 「同一模型」的判定是 `provider`、`api`、`model` 三项都相同（[L95-L98](https://github.com/earendil-works/pi/blob/d20c6e96625143bdb6fc533843d30601a9f6fcf8/packages/ai/src/api/transform-messages.ts#L95-L98)）。
- 同一模型且带签名的块原样保留，文本为空也保留。redacted 块一旦跨模型就丢掉。跨模型时，其余思考内容**转成普通 text**，不加 `<thinking>` 标签，签名丢掉（[L101-L117](https://github.com/earendil-works/pi/blob/d20c6e96625143bdb6fc533843d30601a9f6fcf8/packages/ai/src/api/transform-messages.ts#L101-L117)）。
- 跨模型时去掉 `thoughtSignature`，并规范化工具调用 ID（[L127-L145](https://github.com/earendil-works/pi/blob/d20c6e96625143bdb6fc533843d30601a9f6fcf8/packages/ai/src/api/transform-messages.ts#L127-L145)）。
- 出错或被中断的 assistant 消息整条跳过（[L195-L203](https://github.com/earendil-works/pi/blob/d20c6e96625143bdb6fc533843d30601a9f6fcf8/packages/ai/src/api/transform-messages.ts#L195-L203)）。
- 没有结果的工具调用，补一条 `isError` 的合成结果（[L158-L186](https://github.com/earendil-works/pi/blob/d20c6e96625143bdb6fc533843d30601a9f6fcf8/packages/ai/src/api/transform-messages.ts#L158-L186)）。

**四、兼容服务商的 `compat` 对象**

- **字段定义**（[compat-schema.ts L188-L350](https://github.com/earendil-works/pi/blob/d20c6e96625143bdb6fc533843d30601a9f6fcf8/packages/ai/src/providers/compat-schema.ts#L188-L350)）中和思考相关的有：
  - `supportsReasoningEffort`
  - `maxTokensField`（`max_tokens` 还是 `max_completion_tokens`）
  - `thinkingFormat`（`openai` / `deepseek` / `zai` / `qwen` / `qwen-chat-template` / `openrouter` / `together` / `chat-template` / `string-thinking` / `ant-ling`）
  - `requiresThinkingAsText`
  - `requiresReasoningContentOnAssistantMessages`
  - `thinkingTokenBudgetField`（`thinking_budget` / `thinking_token_budget` / `thinking_budget_tokens`）
  - `chatTemplateKwargs`
- **按 base_url 自动探测**（`detectCompat`，[openai-completions.ts L1593-L1690](https://github.com/earendil-works/pi/blob/d20c6e96625143bdb6fc533843d30601a9f6fcf8/packages/ai/src/api/openai-completions.ts#L1593-L1690)）：
  - `deepseek.com` 用 `deepseek` 格式。
  - `api.z.ai`、`open.bigmodel.cn` 用 `zai` 格式。
  - `openrouter.ai` 用 `openrouter` 格式。
  - xAI、z.ai、Moonshot、Together、NVIDIA 等标为不支持 `reasoning_effort`。
  - DeepSeek、Moonshot、z.ai 等改用 `max_tokens`。
  - 模型自己写的 `compat` 会逐字段覆盖探测结果（[L1696-L1727](https://github.com/earendil-works/pi/blob/d20c6e96625143bdb6fc533843d30601a9f6fcf8/packages/ai/src/api/openai-completions.ts#L1696-L1727)）。
  - Qwen / DashScope **不按 URL 探测**，只由模型目录指定 `thinkingFormat:"qwen"`。
- **各格式的具体写法**（[openai-completions.ts L880-L985](https://github.com/earendil-works/pi/blob/d20c6e96625143bdb6fc533843d30601a9f6fcf8/packages/ai/src/api/openai-completions.ts#L880-L985)）：
  - `zai`：发 `thinking:{type:"enabled", clear_thinking:false}`，关闭时发 `{type:"disabled"}`。
  - `qwen`：顶层发 `enable_thinking: bool`。
  - `deepseek`：发 `thinking:{type}`，可以再加 `reasoning_effort`。
  - `openrouter`：发 `reasoning:{effort}`，关闭时发 `reasoning:{effort:"none"}`。
  - 预算字段：只要设了 `thinkingTokenBudgetField`，就另外发这个字段（[L979-L985](https://github.com/earendil-works/pi/blob/d20c6e96625143bdb6fc533843d30601a9f6fcf8/packages/ai/src/api/openai-completions.ts#L979-L985)）。

**其他细节**

- 开了思考的 Anthropic 请求不发 `temperature`（[anthropic-messages.ts L1245-L1253](https://github.com/earendil-works/pi/blob/d20c6e96625143bdb6fc533843d30601a9f6fcf8/packages/ai/src/api/anthropic-messages.ts#L1245-L1253)）。
- 对话里有工具历史、但这次请求不带工具时，Chat Completions 会发 `tools:[]`，原因是经 LiteLLM 转到 Anthropic 时需要这个字段（[openai-completions.ts L855-L863](https://github.com/earendil-works/pi/blob/d20c6e96625143bdb6fc533843d30601a9f6fcf8/packages/ai/src/api/openai-completions.ts#L855-L863)）。
- 各模型最终用的 `thinkingLevelMap` 和 `compat` 存在 `src/providers/data/*.json`，构建时从 models.dev 生成，**没有提交到仓库**；具体某个模型的取值只能从生成脚本推断，**未确认**。

### 4.7 各网关的预算数值对比

旧式按预算计的 Claude，以及 Gemini 2.5：

| 档位 | LiteLLM | pi | CLIProxyAPI | magpie | new-api / OpenRouter（Claude） | Google 官方兼容映射（2.5） |
|---|---|---|---|---|---|---|
| minimal | 128→1024（Claude 下限） | 1024 | 512 | 4096（当作 low） | max_tokens×5% / ×10% | 1024 |
| low | 1024 | 2048 | 1024 | 4096 | ×20% | 1024 |
| medium | 2048 | 8192 | 8192 | 10000 | ×50% | 8192 |
| high | 4096 | 16384 | 24576 | 24000 | ×80% | 24576 |
| 关闭 → Claude | 不发 thinking | `disabled`（模型关不掉时不发） | `disabled` | `disabled` | `disabled`（Sonnet 5.5 发 `between_tools`） | — |

---

## 5. 结论与建议

### 5.1 推荐映射：我们的档位 → 实际发什么

「不设置」：三种协议都**什么都不发**，模型按自己的默认行为来，见结论先行第二条。

**Chat Completions**（OpenAI、DeepSeek、豆包、Gemini、OpenRouter、LiteLLM、new-api、CLIProxyAPI 等）

| 关闭 | 低 | 中 | 高 |
|---|---|---|---|
| `reasoning_effort:"none"` | `"low"` | `"medium"` | `"high"` |

这样发的理由：

- 这是各家兼容层和网关最普遍认的写法。DeepSeek 的 `none` 就是关闭，`medium` 会被当作 `high`。豆包、Qwen3.8 都认这个参数。OpenRouter 的 Parameters 页列出了 `reasoning_effort`。LiteLLM、CLIProxyAPI、magpie 也都从 `reasoning_effort` 读用户意图。
- 关闭发 `none` 而不是 `minimal`：DeepSeek、豆包、GLM 5.2、Qwen3.8 都把 `none` 解释成关闭；gpt-5.1 及以后、GPT-6 Sol/Luna 也支持 `none`。

已知的例外：

- GPT-6 Astra / 6.1 Sol 发 `none` 会 400；gpt-5 不支持 `none`。
- Gemini 2.5 Pro、3.x、4 都关不掉思考。
- Kimi K3 没有 `medium` 和 `none`。
- 经 Anthropic 的 OpenAI 兼容端点调用时，`reasoning_effort` 会被忽略。

**Responses**

| 关闭 | 低 / 中 / 高 |
|---|---|
| `reasoning:{effort:"none"}` | `reasoning:{effort:"low"/"medium"/"high"}`，并加 `include:["reasoning.encrypted_content"]` |

- 不发 `summary`，因为我们不展示思考内容。
- 例外和 Chat Completions 一样：GPT-6 Astra / 6.1 Sol 发 `none` 会 400；gpt-5 不支持 `none`。

**Anthropic adaptive 模型**（Opus 4.6+、Sonnet 4.6+、Haiku 5.5、Fable / Mythos）

| 关闭 | 低 / 中 / 高 |
|---|---|
| 按模型分三种写法，见下 | `thinking:{type:"adaptive", display:"omitted"}` 加 `output_config:{effort:"low"/"medium"/"high"}` |

关闭的写法：

- Opus 4.6–4.8、Sonnet 4.6 / 5、Opus 5、Haiku 5.5：发 `thinking:{type:"disabled"}`，不带 effort。Opus 5 和 Haiku 5.5 的默认 effort 是 high / medium，都 ≤ high，所以可以关。
- Sonnet 5.5：发 `thinking:{type:"between_tools"}`。
- Opus 5.5、Fable、Mythos：关不掉。不发 `thinking`，只发 `output_config.effort:"low"`，也就是按「低」处理，并在界面上说明这些模型不能关闭思考。

**Anthropic 预算模型**（Opus 4.5、Sonnet 4.5、Haiku 4.5 及更早）

| 关闭 | 低 | 中 | 高 |
|---|---|---|---|
| `thinking:{type:"disabled"}`，或者不发（这些模型默认就不思考） | `enabled` + `budget_tokens:1024` | `enabled` + `budget_tokens:8192` | `enabled` + `budget_tokens:16384` |

- 预算的取值是**我们的建议**，不是哪家规定的：low 取官方下限，medium 和 Google / pi / CLIProxyAPI 一致，high 和 pi 一致（见 4.7）。
- 照 pi 的做法，发的 `max_tokens` = min(槽位的 `max_tokens`（默认 16384）+ 预算, 模型上限)，保证正文的长度上限不被思考吃掉。

**Anthropic 侧的补充说明：**

- **怎么判断模型属于哪一类。** 只能按模型名用正则判断，pi、new-api、magpie 都是这么做的。网关可能给模型改名（比如 OpenRouter 的 `anthropic/claude-…`，或 new-api 的自定义别名），所以要允许用额外 JSON 覆盖。
- **为什么要显式发 `display:"omitted"`。** Opus 4.6 / Sonnet 4.6 默认是 `summarized`；新模型默认已经是 `omitted`。我们不展示思考，`omitted` 能缩短首个文本 token 的时间。
- **为什么不照 LiteLLM 那样把「关闭」做成不发 `thinking`。** 在默认开思考的新 Claude 上，不发 `thinking` 等于没关。

**额外请求参数 JSON：** 深合并进请求体，**最后合并**，所以会覆盖上面生成的思考参数。界面上提示用户：用 JSON 控制思考时，把强度选成「不设置」，免得两套参数冲突（比如 Gemini 同时收到 `reasoning_effort` 和 `thinking_config` 会报错）。

### 5.2 只能靠「额外请求参数 JSON」解决的情况

- **Qwen 3.8 以外的模型**（qwen3.5–3.7、qwen-plus 等）：用 `{"enable_thinking": false}` 或 `{"enable_thinking": true, "thinking_budget": 2048}` 开关思考、控制预算。
- **GLM 4.x 到 5.1**：用 `{"thinking": {"type": "disabled"}}` 关闭。要保留历史思考时用 `"clear_thinking": false`。
- **Kimi k2.6**：用 `{"thinking": {"type": "disabled"}}` 关闭。
- **Gemini**：要精确的预算、打开 `include_thoughts`，或者给 2.5 Pro 设最低预算时，用 `{"extra_body": {"google": {"thinking_config": {...}}}}`（请求体里字面上就有 `extra_body` 这个键）。
- **豆包**：用 `{"thinking": {"type": "auto"}}`（如果模型还支持）。
- **OpenRouter**：用 `{"reasoning": {"max_tokens": N}}` 或 `{"reasoning": {"exclude": true}}` 精确控制预算或不返回思考内容；也可以加 `provider` 路由偏好。
- **Anthropic**：
  - `display:"summarized"` / `"updates"`。
  - 自己定的 `budget_tokens`。
  - 模型名判断不出类别时，手动写 `thinking`。
  - `xhigh` / `max` 档位。
- **Responses**：`reasoning.summary`、`reasoning.mode:"pro"`、`reasoning.context`。
- **自建推理服务**（vLLM / SGLang / llama.cpp）：用 `chat_template_kwargs:{enable_thinking:false}`，或对应的预算字段（pi 的 `thinkingTokenBudgetField` 列出了 `thinking_token_budget`、`thinking_budget`、`thinking_budget_tokens`）。
- **网关的模型名后缀**（CLIProxyAPI 的 `model(high)`、new-api 的 `model@effort:high`）：这些写在模型名里，不需要 JSON；但要注意，后缀会**覆盖**我们在请求体里发的参数。

### 5.3 为了回传思考内容，三个适配器各要改什么（只描述，不写代码）

**共同的改动**

- `ChatLLM.stream` 在 `str | ToolCall` 之外，再产出一种「本轮思考记录」，内容是不透明的。引擎在工具轮里把它挂到 `ChatMessage("assistant", …)` 上，下一次请求原样带回。
- 这份记录只在同一轮工具循环里使用，不写进数据库。官方都把「本轮内回传」列为必需或强烈推荐；跨轮回传 Anthropic 和 OpenAI 都不要求。
- 记录要标明来源（协议 + base_url + 模型），学 pi 的 `transformMessages`：换了模型就丢掉。槽位在两次请求之间被替换的可能性很小，但 `Swappable` 确实可能出现这种情况。
- **引擎的改动：** 最后一轮请求保留第 0 步的 `tools`，改成「禁止调用工具」：
  - Anthropic 发 `tool_choice:{type:"none"}`；
  - Chat Completions 和 Responses 发 `tool_choice:"none"`。

  这样做是为了不触发 Anthropic 的前缀检查（2.1）；同时第二次请求仍然算「带 tools 的请求」，DeepSeek 的回传规则保持一致。`LAST_ROUND_NOTE` 可以保留。改了之后，原来那段「模型自己写出工具调用标记」的问题要重新验证，见 `engine.py:106-112` 的注释。

**`anthropic.py`**

- **请求：** 按 5.1 加上 `thinking` / `output_config`；预算模型同时调整 `max_tokens`。开着思考时不能发 `temperature` 等采样参数（我们本来就不发）。
- **流：**
  - 对每个 content block 按 index 记下类型和内容，保持原来的顺序：
    - `thinking`：累积 `thinking_delta` 和 `signature_delta`；
    - `redacted_thinking`：在 `content_block_start` 时就拿到完整的 `data`；
    - `text`；
    - `tool_use`。
  - 不能只按 `type == "thinking"` 过滤。
- **回传：** 带工具调用的 assistant 消息，如果有记录，就**按原顺序原样输出完整的 content 块列表**，不再重新拼成「先 text、后 tool_use」。
  - 没有签名的 thinking 块（比如流被打断）不要发，可以学 pi 转成 text，或者直接丢掉。
- **结束原因：** 遇到 `stop_reason:"max_tokens"` 且没有任何正文时（思考把额度用完了），给出明确的错误提示，现在只记了一条日志。
- **可选：** `thinking-binding-controls-2026-08-01` 头加 `drop_block`。这是 beta 功能，网关不一定支持，**默认不要发**。

**`responses.py`**

- **请求：** 按 5.1 加上 `reasoning` / `include`。
- **流：** 在 `response.output_item.done` 时，遇到 `item.type == "reasoning"` 就保存整个 item（包括 `id`、`summary`、`encrypted_content`），和 `function_call` item 一起记下它们的 `output_index` 顺序。不要用 `output_item.added` 里的数据，那里的内容可能不完整。
  - 可选：学 pi，`done` 里缺 `encrypted_content` 时，从 `response.completed` 的 `output` 里补上。
- **回传：** `_items()` 输出 assistant 时，先把保存的 reasoning item 按原顺序原样放回，再放 `function_call` item，最后放 `function_call_output`。
- **其他：** 开了思考后，`max_output_tokens` 太小，可能在出正文之前就 `incomplete`（1.2）。后台配置界面应该提示这一点。

**`openai_compat.py`**

- **请求：** 按 5.1 加上 `reasoning_effort`，最后合并额外 JSON。
  - `max_tokens` 和 `max_completion_tokens` 的问题见 1.1。OpenAI 官方推理模型用的是后者，pi 按 base_url 来切换（`maxTokensField`）。
- **流（都按字段名原样记下）：**
  - `delta.reasoning_content` / `delta.reasoning` / `delta.reasoning_text`：学 pi，取第一个非空的字段，并记住它的字段名。
  - `delta.reasoning_details`：OpenRouter 的数组。
  - `delta.tool_calls[i].extra_content`：Gemini 的 `google.thought_signature`。
  - LiteLLM 的 `thinking_blocks`：如果用户经 LiteLLM 调 Claude，就需要它。
- **回传：** 带 `tool_calls` 的 assistant 消息：
  - 写回同名的思考字段（或 `reasoning_details`）；
  - 每个 tool_call 写回它的 `extra_content`；
  - 写回 `thinking_blocks`。
- **DeepSeek：** 它要求所有历史 assistant 轮次都带 `reasoning_content`，而我们的历史是数据库里的纯文本。有三条路：
  1. 学 pi，给所有历史 assistant 消息补 `reasoning_content:""`（能不能通过校验，**未确认**）；
  2. 把每轮的 `reasoning_content` 存进数据库（改动大）；
  3. 在界面上提示 DeepSeek 用户把强度设为「关闭」。

  建议先实测第一条。

### 5.4 对通话首字延迟的影响

- **我们没有找到官方的定量数据**（各档位的首 token 延迟或思考 token 数），所以这里不引用任何数字。官方只有定性的说法：
  - **OpenAI** 的 effort 表：`none` 用于 "Latency-critical tasks... Common use cases include voice"；`low` 是 "Efficient reasoning with a modest latency increase"（[reasoning 指南](https://developers.openai.com/api/docs/guides/reasoning#reasoning-effort)）。延迟敏感的场景，官方还建议让模型先输出一段简短的开场白（同页 "For faster time to first visible token..."）。
  - **Anthropic**：`display:"omitted"` 是 "faster time-to-first-text-token when streaming"；降低 effort 是 "Lower cost or latency on a thinking-enabled workload: lower `effort` first"；低 effort 时，简单问题可能完全跳过思考（[Thinking](https://platform.claude.com/docs/en/build-with-claude/thinking#controlling-thinking-display)、[Effort](https://platform.claude.com/docs/en/build-with-claude/effort#effort-with-thinking)）。
- **流式也帮不上忙。** 思考阶段没有任何正文输出：我们的 `ReplyParser` 和 TTS 要等第一个文本 token 才能开始，用户听到的就是一段静默。
- **工具轮会让这段等待出现两次。** 第二次请求之前也可能再思考一遍；Anthropic 文档说只处理工具结果的后续请求「can still skip thinking」，但不保证一定跳过。
- **建议：**
  1. 通话用的 chat 槽位，默认引导用户选「关闭」或「低」。
  2. 在 `metered_llm` 或通话日志里，按「槽位 / 模型 / 档位」记录首个文本 token 的时间，上线后用真实数据来调整。
  3. 文字对话和通话目前共用同一个 chat 槽位。如果要给通话单独设一档，需要另开一个设置（不在这次调研范围内）。

### 5.5 顺带发现（和思考强度无关，但会影响实现）

- **GPT-6 系列走 Chat Completions 时用不了工具。** Astra 和 6.1 Sol 完全不支持；6 Sol 和 Luna 只在 `none` 下支持。我们的 `check_chat_llm` 会用 `ping` 工具探测，能把这种情况挡下来，但报错信息最好提示用户「改用 Responses 协议」。
- **Gemini 3 / 4 经 OpenAI 兼容接口、DeepSeek V4 默认思考模式**，这两种组合下工具轮按文档可能已经 400（2.3），值得先实测确认。
- **Anthropic 新模型拒绝强制工具调用。** Opus 5.5、Sonnet 5.5 一律拒绝 `tool_choice` 的 `any` / `tool`。我们现在不用强制工具；最后一轮改发 `none` 是允许的。

---

## 未确认清单

**OpenAI**

1. gpt-5 和 GPT-6 Astra 不传 effort 时的默认强度。
2. 给 gpt-5 发 `none`、给 gpt-4.1 这类非推理模型发 `reasoning_effort` 会怎样。
3. Chat Completions 的 `max_tokens` 对 gpt-5 及以后的模型是否会报错。
4. Responses 在 `store:false` 下不回传 reasoning item 的具体后果（文档只说回传更好、更省 token）。

**Anthropic**

5. adaptive 模式下，工具轮整轮丢掉 thinking 块会报错还是静默降级。手动模式会报错。
6. Sonnet 4.5、Haiku 4.5 收到 `output_config.effort` 会怎样。
7. 预算模型（4.5 及更早）是否接受 `display` 字段。pi 对这类模型也发，说明可能接受，但官方没写。

**兼容服务商**

8. Gemini OpenAI 兼容接口：
   - `include_thoughts` 的摘要出现在哪个字段；
   - 给 3.x / 4 发 `none`、给 3.8 Flash 发 `minimal`、同时发 `reasoning_effort` 和 `thinking_config`，各返回什么错误；
   - 兼容端点上缺 thought_signature 是否和原生接口一样 400（文档没单独写，也没有豁免说明）。
9. DeepSeek：对不认识的参数怎么处理；`thinking: enabled` 和 `reasoning_effort: none` 冲突时怎么办；给历史 assistant 消息补 `reasoning_content:""` 能否通过工具请求的校验。
10. Qwen：对 3.8 以外的模型发 `reasoning_effort`，是忽略还是报错。
11. Kimi：K3 收到 `medium` / `none`、k2.6 收到 `reasoning_effort`、K3 收到 `thinking` 时会怎样；工具调用时不回传思考内容是否报错。
12. GLM：4.5 到 5.1 收到 `reasoning_effort` 会怎样；工具调用时不回传 `reasoning_content` 是否报错。
13. 豆包：给不在 effort 表里的模型发 `reasoning_effort` 会怎样；`thinking.type:"auto"` 现在哪些模型还支持。

**网关**

14. OpenRouter：
    - 对 Claude 4.6+ 是走预算公式还是 adaptive + effort；
    - Gemini 2.5 的 effort 换算比例；
    - 顶层 `reasoning_effort` 和 `reasoning` 对象同时出现时谁优先；
    - 没给 `max_tokens` 时，按比例算预算用的是哪个基数。
15. LiteLLM：文档说 Claude 4.6+ 拒绝旧的 `enabled`，源码却对 4.6 原样转发（`supports_legacy_thinking`），两者矛盾；Gemini 3 默认档位开关 `enable_gemini_default_thinking_level_low` 的默认值。
16. CLIProxyAPI：模型注册表里各模型具体的思考能力值。
17. new-api：Responses 路径和 Claude 签名回传的路径。
18. magpie：原生调用 Gemini / Vertex 的路径怎么处理思考参数。
19. pi：
    - 各模型实际发布的 `thinkingLevelMap` / `compat`（生成数据没提交到仓库）；
    - `getEffortThinkingLevelMap` 的转换逻辑；
    - `requiresThinkingAsText` 的 schema 描述说用 `<thinking>` 分隔，代码却是不加标签的纯文本；
    - DashScope 的 URL 是否在别处被识别。

**延迟**

20. 各档位对首字延迟的影响：没有找到任何官方定量数据。
