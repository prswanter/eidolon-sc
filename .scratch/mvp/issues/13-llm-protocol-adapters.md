# 13: Responses 与 Anthropic 接口适配器

**What to build:** 除了 OpenAI 兼容的 Chat Completions 接口，对话模型和后台模型还可以选择 OpenAI Responses 接口或 Anthropic Messages 接口。接口类型、地址、密钥和模型名都由管理员自己配置。三种适配器都支持流式输出和工具调用；如果配置的对话模型不满足这两项要求，服务在启动时就报错。

**Blocked by:** 08

**Status:** resolved

- [x] 对话模型和后台模型都可以各自任选三种接口之一
- [x] 三种适配器都能正确解析流式返回的结构化回复（日语原文和中文字幕）以及工具调用
- [x] 契约测试：用各协议录制的真实响应（包含流式片段和工具调用）验证解析结果
- [x] 对话模型配置为不支持流式输出或工具调用时，服务启动失败，并给出明确的错误信息

## Comments

实现摘要：

- 配置：每个模型槽位用 `LLMSettings`（接口类型、地址、密钥、模型名、回复长度上限）表示，环境变量是 `CHAT_LLM_PROTOCOL` / `BACKGROUND_LLM_PROTOCOL`，取值为 `chat-completions`（默认）、`responses`、`anthropic`。后台模型没填的项沿用对话模型的设置，包括接口类型；只有 `*_LLM_MAX_TOKENS` 两个槽位各自设置，以免一个很小的对话上限把人设初稿截断。取值不合法时启动报错。
- 适配器（`eidolon/llm/`）：三种接口遵守同一个 `stream(messages, tools)` 约定：先流式产出文字片段，最后产出完整的 `ToolCall`；`tool` 消息按各自协议回传。流式事件的读取放在共用的 `sse.py` 里：HTTP 错误、网络错误、无法解析的事件，以及没有以流式返回的回复（整段 JSON），都统一报成 `LLMError`。
  - Responses：`system` 合并进 `instructions`，`store: false`。文字来自 `response.output_text.delta`。工具调用按 `output_index` 从 `output_item.added` 开始拼接参数增量，以 `output_item.done` 的完整参数为准；工具结果以 `function_call` + `function_call_output`（`call_id`）回传。`error` 和 `response.failed` 抛错，`response.incomplete` 只记警告。
  - Anthropic Messages：`system` 放在顶层；请求头带 `x-api-key` 和 `anthropic-version: 2023-06-01`。`max_tokens` 默认 16384，可通过配置调整。文字来自 `text_delta`；`tool_use` 块按块序号拼接 `input_json_delta`。同一轮的工具结果合并进紧随其后的一条 user 消息；空文本的 assistant 回合不发送。流中的 `error` 事件抛错。
  - 思考内容（Responses 的 reasoning、Anthropic 的 thinking）一律忽略，也不回传；真实测试确认工具往返不需要回传它们。
- 启动检查（`llm/providers.py` 的 `check_chat_llm`，由 `eidolon serve` 在加载角色配置之后调用）：发一次很小的流式请求，带一个 `ping` 工具。失败时再不带工具请求一次来区分原因：
  - 两次都失败，报「需要支持流式输出和工具调用，但检查请求失败」，附上服务的报错；
  - 只有带工具的请求失败（再重试一次仍失败，以排除限流、超时等偶发错误），报「不支持工具调用」。
  - 模型不调用工具不算失败；服务如果悄悄丢掉 `tools` 参数，这个检查查不出来。
- 测试：
  - `test_llm_protocols.py`：用录制的真实流做契约测试（见下），覆盖结构化回复经 `ReplyParser` 解析出的日中两段、工具调用拼接、请求体（提示词、工具定义、工具往返）、HTTP 错误、流中报错、`response.failed`、非流式回复、参数不是 JSON。
  - `test_llm_config.py`：覆盖槽位各自选接口、默认值与沿用规则、配置错误；另有三种启动失败（不以流式返回、拒绝工具、密钥错误），用本地假服务驱动 `eidolon serve`；检查的通过情形，以及偶发失败不被误判。
  - `test_openai_compat.py` 补了非流式回复的用例。

录制的真实响应（`backend/tests/recordings/`，2026-09-25）：deepseek-v4.1-flash，经 `.env` 里的代理服务，它同时提供 `/responses` 和 `/messages`。录了两种接口各一份文字回复和一份工具调用，只删掉了大部分思考增量。这个模型会流式输出思考内容，正好覆盖了适配器必须跳过的部分。没有 OpenAI、Anthropic 官方服务的录音，所以官方才有的事件（如 Anthropic 的 `ping`、`signature_delta`，OpenAI 的 `response.refusal.delta`）只是按文档忽略，没有测试覆盖。

真实服务验证（2026-09-25）：

- 条件：对话模型和后台模型都用 deepseek-v4.1-flash，三种接口都试过；Jev、硅基流动是真实服务；剧情库只导入了真乃的 W.I.N.G.編（22 段）。
- 启动：三种接口的启动检查都通过，模型都实际调用了 `ping`，启动约 5 秒。用错误的密钥启动时拒绝启动，并提示「对话模型需要支持流式输出和工具调用，但检查请求失败：模型返回 401: {"error":"Invalid API key"}」。
- 对话：三种接口的文字回合都正常，日语原文和中文字幕解析正确，首个字幕约 4–9 秒（与原来的 Chat Completions 接口相当）。回忆 W.I.N.G. 决赛的问题被 Jev 提前回顾，回答基于剧情。
- 记忆：用 Responses 和 Anthropic 接口作后台模型时，都能正常抽取记忆，例如「制作人家养了一只叫小白的猫」「制作人的猫小白现在好多了」。
- 工具往返：把 Jev 换成总是回答「不需要检索」的桩，让模型自己调用「回顾剧情」。三种接口的第二次请求都正确带上了调用和结果（`tool_calls`+`tool`、`function_call`+`function_call_output`、`tool_use`+`tool_result`）。
- 发现的问题（与适配器无关，已记为 ticket 16）：工具轮之后引擎不再提供工具，deepseek 在 Chat Completions 和 Responses 接口下把自己的原生调用标记 `<｜｜DSML｜｜ calls>…` 当成文字输出，成了角色的回复；Anthropic 接口那次正常回答。

留给后续的注意点：

- Responses 使用 `store: false`，也没有请求 `reasoning.encrypted_content`，所以 OpenAI 的推理模型在工具往返之间会丢掉推理内容（仍能正常工作，只是可能多花 token）。
- 启动检查每次启动都会请求模型一到三次（正常情况一次）。
- Anthropic 默认的 16384 超过一些旧模型（如 Claude 3 Haiku 的 4096）的输出上限，用这类模型时需要调小 `*_LLM_MAX_TOKENS`。
