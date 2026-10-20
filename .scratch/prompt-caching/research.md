# 提示缓存：各协议、各家服务怎么报缓存命中，怎么计价，`cache_control` 能不能放心加

访问日期：2026-10-14。每条结论都附了一手来源：官方文档（多数页面在 URL 后加 `.md` / `.md.txt` 可以拿到原文 Markdown）、官方 API 参考、官方 SDK 或官方仓库源码。引用 GitHub / Hugging Face 源码时链接固定到提交。二手文章没有作为依据。标 **未确认** 的，是在一手来源里没查到的；标 **推断** 的，是根据一手材料推出来、但文档没直说的。

固定的提交：

| 仓库 | 提交 |
|---|---|
| openai/openai-python | `86cae50785fb7b7bf2a5d2383370b214b304acd2` |
| deepseek-ai/DeepSeek-V4.1-Flash（Hugging Face） | `5254448103b6254fc646dacbca1cbbf20e9216c1` |
| deepseek-ai/DeepSeek-V4-Pro-0813（Hugging Face） | `72e1d3230f6c080a530b0a1d46f8eb4602340597` |
| deepseek-ai/deepseek-recipe | `8cadfede7063c896b944e7bae05daa3549ae97ea` |
| anomalyco/models.dev（原 sst/models.dev，默认分支 `dev`） | `ed048b653e6ef84645a0cd22fc5e46f82aea06e7` |

## 结论先行

- **Chat Completions 这一路，各家都把缓存命中放在 `usage.prompt_tokens_details.cached_tokens`，而且 `prompt_tokens` 一律是含缓存的总数。** OpenAI、DeepSeek、OpenRouter、Kimi、百炼、智谱、硅基流动、MiniMax 都这样。DeepSeek 和硅基流动另外还给 `prompt_cache_hit_tokens` / `prompt_cache_miss_tokens`。
- **缓存写入现在也要单独看了。**
  - OpenAI GPT-5.6 及以后，写入按输入价的 1.25 倍收费，字段是 `cache_write_tokens`（Chat Completions 在 `prompt_tokens_details` 里，Responses 在 `input_tokens_details` 里）。
  - OpenRouter、Kimi 也用 `prompt_tokens_details.cache_write_tokens`。
  - 百炼显式缓存用 `cache_creation_input_tokens`，它自己两份文档对字段放在哪层说法不一致。
- **Anthropic Messages 正相反：`input_tokens` 不含缓存。** 总输入 = `input_tokens` + `cache_creation_input_tokens` + `cache_read_input_tokens`，写入还按 5 分钟 / 1 小时拆在 `usage.cache_creation` 里。Kimi、MiniMax、百炼、DeepSeek（按其开源转换代码）的 Anthropic 兼容端点也是这个口径。
- **Anthropic 的倍率不再是统一的 0.1。** 5 分钟写入 1.25 倍、1 小时写入 2 倍没变；读取一般 0.1 倍，但 Opus 5.5 / Sonnet 5.5 是 0.05 倍，Fable 5.1 / Mythos 5.1 是 0.025 倍。所以计价应该直接用价目表里的缓存价，不要拿输入价乘固定倍率。
- **两个价目表都有缓存价。** models.dev 是 `cost.cache_read` / `cost.cache_write`（美元 / 百万 token）；OpenRouter 是 `pricing.input_cache_read` / `input_cache_write` / `input_cache_write_1h`（美元 / token，字符串）。两边 Anthropic 的写入价都是 5 分钟档；只有 OpenRouter 有 1 小时档。DeepSeek 两边都只有读取价、没有写入价。
- **第三方 Anthropic 兼容端点对 `cache_control` 的态度五花八门，但没查到哪家文档说会因此报错。**
  - DeepSeek：工具、文本块、`tool_use`、`tool_result` 上的 `cache_control` 都写明「Ignored」；`system` 块上的和顶层的没列。
  - Kimi：只认顶层 `cache_control`，`messages` 里的标记被忽略。
  - 百炼、MiniMax：认块级标记（含 `system` 块），顶层的没写。
  - OpenRouter：两种都认。
  - 智谱：没写。硅基流动：请求 schema 里 `system` 文本块是 `additionalProperties: false`，没有 `cache_control` 字段，运行时会不会拒绝 **未确认**。
- **DeepSeek V4.1 的工具定义渲染在第一条 system 内容的后面。** 加减 `tools` 不会改动 system 内容之前和之中的 token，但会改动 system 之后的一切；`tool_choice: none` 时开源编码器干脆不渲染工具。DeepSeek 的缓存只认「整段前缀单元」，所以每轮工具集合变来变去，历史对话那段前缀就接不上。OpenAI 和 Anthropic 也都把工具定义算进前缀，并且都建议用 `tool_choice: none` 代替删掉工具。

---

## 0. 项目现状

main @ `8eef645`：

- `llm/openai_compat.py:77-106`：流里最后一个 `usage` 字典覆盖前面的，只记 `prompt_tokens`、`completion_tokens`。请求里带了 `stream_options.include_usage`（`:53`）。
- `llm/responses.py:117-119`：从 `response.completed` 的 `response.usage` 记 `input_tokens`、`output_tokens`。
- `llm/anthropic.py:87-125`、`:142-150`：`message_start` 和 `message_delta` 的 `usage` 依次 `update`，最后把 `input_tokens`、`cache_creation_input_tokens`、`cache_read_input_tokens` 加起来当总输入记账。`system` 是把所有 system 消息用 `\n\n` 拼成一个字符串（`:65-66`），没有任何 `cache_control`。
- `price_catalog.py:75-81`、`:190-217`：`Listed` 只有 `input`、`output`。models.dev 读 `cost.input` / `cost.output`，OpenRouter 读 `pricing.prompt` / `pricing.completion` 再乘 1e6。
- `engine.py:429-441`：`tools` 是 `[RECALL_STORY_TOOL]`，但这一轮已经预先检索过（`retrieved.recalled`）就是 `[]`；最后一轮同样的 `tools` 加 `forbid_calls`（Chat Completions 和 Anthropic 都发 `tool_choice: none`）。
- `engine.py:531-558`：一条 system 消息，依次拼角色设定、世界、制作人（含当前时间，`producer.py:117` 起）、记忆、检索结果、格式说明。

---

## 1. 流式 usage 里的缓存字段

### 1.1 OpenAI Chat Completions

- 字段：`usage.prompt_tokens_details.cached_tokens`（「Cached tokens present in the prompt.」）和 `usage.prompt_tokens_details.cache_write_tokens`（「The unadjusted number of prompt tokens written to cache.」）。来源：[openai-python `completion_usage.py` L37-53](https://github.com/openai/openai-python/blob/86cae50785fb7b7bf2a5d2383370b214b304acd2/src/openai/types/completion_usage.py#L37-L53)。
- 是否包含在 `prompt_tokens` 里：SDK 的措辞「present in the prompt」意味着包含。Responses 那边官方给了明确的算式（见 1.2）；Chat Completions 的写入是否同样计入 `prompt_tokens`，**推断** 是同一口径，OpenRouter 文档的示例（`prompt_tokens: 194`、`cache_write_tokens: 100`）也是这样（[Usage Accounting](https://openrouter.ai/docs/use-cases/usage-accounting.md)）。
- 流式：`include_usage` 时「an additional chunk will be streamed before the `data: [DONE]` message」，这个块的 `choices` 永远是空数组，其他块的 `usage` 是 null（[`chat_completion_stream_options_param.py` L24-33](https://github.com/openai/openai-python/blob/86cae50785fb7b7bf2a5d2383370b214b304acd2/src/openai/types/chat/chat_completion_stream_options_param.py#L24-L33)）。
- GPT-5.6 及以后：写入 1.25 倍，读取 0.1 倍（GPT-6.1 Sol 0.05 倍），最小可缓存 1024 个可见输入 token，TTL 至少 30 分钟；更早的模型没有写入费，`cached_tokens` 向下取整到 128 的倍数（[Prompt caching 指南「GPT-5.6 and later」「Summary of model differences」](https://developers.openai.com/api/docs/guides/prompt-caching)）。显式断点 `prompt_cache_breakpoint` 和 `prompt_cache_options` 在 Chat Completions 里也有（[`completion_create_params.py` L192-216](https://github.com/openai/openai-python/blob/86cae50785fb7b7bf2a5d2383370b214b304acd2/src/openai/types/chat/completion_create_params.py#L192-L216)）。

### 1.2 OpenAI Responses

- 字段：`usage.input_tokens_details.cached_tokens` 和 `usage.input_tokens_details.cache_write_tokens`，两者都是必填（[`response_usage.py` L8-18](https://github.com/openai/openai-python/blob/86cae50785fb7b7bf2a5d2383370b214b304acd2/src/openai/types/responses/response_usage.py#L8-L18)）。
- `input_tokens` 包含两者。官方算式：`ordinary_input_tokens = input_tokens - cached_tokens - cache_write_tokens`（[Prompt caching 指南「Monitor cache performance」](https://developers.openai.com/api/docs/guides/prompt-caching#monitor-cache-performance)）。

### 1.3 Anthropic Messages

- 字段在 `usage` 里（流式时在 `message_start` 的 `message.usage`）：`cache_creation_input_tokens`、`cache_read_input_tokens`、`input_tokens`。`input_tokens` 是「Number of input tokens which were not read from or used to create a cache (that is, tokens after the last cache breakpoint)」，总输入 = 三者之和（[Prompt caching「Tracking cache performance」](https://platform.claude.com/docs/en/build-with-claude/prompt-caching#tracking-cache-performance)；[Messages API 参考](https://platform.claude.com/docs/en/api/messages/create)：「Total input tokens in a request is the summation of `input_tokens`, `cache_creation_input_tokens`, and `cache_read_input_tokens`.」）。
- 按 TTL 拆分：`usage.cache_creation.ephemeral_5m_input_tokens`、`usage.cache_creation.ephemeral_1h_input_tokens`；「the current `cache_creation_input_tokens` field equals the sum of the values in the `cache_creation` object」（[Prompt caching「1-hour cache duration」](https://platform.claude.com/docs/en/build-with-claude/prompt-caching#1-hour-cache-duration)）。
- 流式：`message_delta` 的 `usage`「are *cumulative*」（[Streaming](https://platform.claude.com/docs/en/build-with-claude/streaming)），官方示例里 `message_delta` 也带三个输入字段。所以现在 `usage.update(...)` 的做法是对的。

### 1.4 DeepSeek

- Chat Completions：`prompt_tokens`「equals prompt_cache_hit_tokens + prompt_cache_miss_tokens」；`prompt_tokens_details.cached_tokens`「Same as prompt_cache_hit_tokens」。示例响应三者同时出现（[Create Chat Completion](https://api-docs.deepseek.com/api/create-chat-completion)）。
- 流式：不管 `include_usage` 开不开，「the last chunk before the data: [DONE] message carries the token usage statistics … no separate usage-only chunk is emitted」，usage 挂在最后一个内容块上，那个块的 `choices` 有一个元素、带 `finish_reason`（同上）。现在的「取最后一个非空 usage」能接住。
- Responses：`input_tokens_details.cached_tokens`（[Responses API 指南](https://api-docs.deepseek.com/guides/responses_api)）。
- 缓存规则：默认开启、无需改代码；「Each cached prefix is an independent, complete unit. A subsequent request can only hit the cache if it fully matches a cache prefix unit.」每次请求在「user input 末尾」和「model output 末尾」各存一个前缀单元；检测到多次请求的公共前缀时会把它单独存成一个单元；长输入/输出按固定间隔切；数小时到数天内清除（[Context Caching](https://api-docs.deepseek.com/guides/kv_cache)）。最小 token 数、切分间隔：**未确认**（当前页面没写）。没有写入费；读取价见第 5 节。
- Anthropic 兼容端点（`https://api.deepseek.com/anthropic`）：兼容表里没有任何 usage 字段说明，**未确认**。DeepSeek 开源的协议转换代码是 `input_tokens = prompt_tokens - prompt_cache_hit_tokens`、`cache_creation_input_tokens: 0`、`cache_read_input_tokens = prompt_cache_hit_tokens`（[deepseek-recipe `anthropic/messages/response/schema.rs` L115-126](https://github.com/deepseek-ai/deepseek-recipe/blob/8cadfede7063c896b944e7bae05daa3549ae97ea/deepseek-recipe/src/protocol/anthropic/messages/response/schema.rs#L115-L126)），即与 Anthropic 口径一致。线上端点是否就跑这份代码 **未确认**。

### 1.5 OpenRouter

- Chat Completions：`usage.prompt_tokens_details.cached_tokens`（读）和 `usage.prompt_tokens_details.cache_write_tokens`（写，「only returned for models with explicit caching and cache write pricing」）。usage「is included in the last SSE message for streaming responses」，而且 `stream_options.include_usage`「deprecated and have no effect. Full usage details are now always included」（[Usage Accounting](https://openrouter.ai/docs/use-cases/usage-accounting.md)；[Prompt Caching「Usage object fields」](https://openrouter.ai/docs/features/prompt-caching.md)）。
- 同一个 usage 里还直接给了 `cost`（实际扣费）和 `cost_details.upstream_inference_cost`（同上 Usage Accounting）。
- Responses：`usage.input_tokens_details.cached_tokens` / `cache_write_tokens`（[Prompt Caching「OpenAI → Explicit prompt caching」](https://openrouter.ai/docs/features/prompt-caching.md)）。
- Anthropic 兼容（`/api/v1/messages`）：响应 schema 有 `cache_creation`、`cache_creation_input_tokens`、`cache_read_input_tokens`、`input_tokens`（[Create a message](https://openrouter.ai/docs/api/api-reference/anthropic-messages/create-a-message.md)）。`input_tokens` 是否不含缓存，schema 没写，**未确认**（按 Anthropic 语义应不含）。

### 1.6 Kimi（Moonshot）

- Chat Completions：「`usage.prompt_tokens` is always the total number of input tokens」；`prompt_tokens_details.cached_tokens`（读）、`prompt_tokens_details.cache_write_tokens`（写），「`cached_tokens`, `cache_write_tokens`, and the uncached remainder are mutually exclusive and sum to `prompt_tokens`」；示例里还有旧的顶层 `usage.cached_tokens`。流式时完整拆分「only returned in the `usage` field of the final chunk (set `stream_options.include_usage=true`)」（[Chat API](https://platform.kimi.ai/docs/api/chat)）。
- 缓存自动开启；`prompt_cache_options.ttl` 可选 `5m` / `1h`；请求里出现 `prompt_cache_breakpoint` 会 400（同上）。kimi-k3 有写入费（5m 与输入同价，1h 两倍），读取 0.1 倍；k2.x 没有写入（[Context Caching](https://platform.kimi.ai/docs/guide/context-caching)）。
- Anthropic 兼容：`input_tokens`「neither read from the cache nor used to create a cache entry」，总输入 = 三者之和，也有 `cache_creation.ephemeral_5m/1h_input_tokens`；`message_start` 和 `message_delta` 都带这些字段（[Messages API](https://platform.kimi.ai/docs/api/messages)）。

### 1.7 阿里云百炼（DashScope / Qwen）

- 隐式缓存：「在`usage.prompt_tokens_details.cached_tokens`可以查看命中缓存的 Token 数（该数值为`usage.prompt_tokens`的一部分）」（[上下文缓存](https://help.aliyun.com/zh/model-studio/context-cache)）。
- 显式缓存（请求里有 `cache_control` 就走显式，否则隐式）：API 参考在 `prompt_tokens_details` 下列了 `cached_tokens`、`cache_creation`（含 `ephemeral_5m_input_tokens`、`cache_creation_input_tokens`）和 `cache_type`（显式时为 `ephemeral`）（[OpenAI 兼容 Chat 接口参考](https://help.aliyun.com/zh/model-studio/qwen-api-via-openai-chat-completions)）；最佳实践代码却直接读 `usage.prompt_tokens_details.cache_creation_input_tokens`（[显式缓存指南](https://help.aliyun.com/zh/model-studio/explicit-cache-guide)）。两处层级不一致，解析时两处都要看。
- 流式：usage「只在`include_usage`为`true`时，在最后一个chunk显示」（同 API 参考）。
- 显式缓存规则：TTL 5 分钟、命中即重置；最少 1024 token；最多 4 个标记；向前回溯最多 20 个 content 块；工具定义上的标记被忽略；字符串形式的 `content` 要改成数组才能加标记。计价：写入「通常按输入 Token 标准单价的 125% 计费」，显式命中约 10%，隐式命中「通常按输入 Token 标准单价的 20% 计费」，qwen3.8 系列另有价格（[上下文缓存](https://help.aliyun.com/zh/model-studio/context-cache)）。
- Anthropic 兼容：`cache_read_input_tokens`「该数值不计入 `usage.input_tokens`，而是单独报告」（[上下文缓存](https://help.aliyun.com/zh/model-studio/context-cache)）。流式「`message_start` 事件的 `usage` 仅包含 `input_tokens` 和 `output_tokens`；完整 4 个字段在 `message_delta` 事件中返回」（[Anthropic 兼容 Messages](https://help.aliyun.com/zh/model-studio/anthropic-api-messages)）。

### 1.8 智谱 GLM

- 字段 `usage.prompt_tokens_details.cached_tokens`；示例 `prompt_tokens` 1075、`cached_tokens` 1024，即包含在内。只有隐式缓存，建议 500 token 以上，TTL 未公布（[bigmodel 缓存指南](https://docs.bigmodel.cn/cn/guide/capabilities/cache)；[z.ai 版](https://docs.z.ai/guides/capabilities/cache)）。
- 流式：usage「仅在最后一个chunk中出现」，示例的最后一块带 `prompt_tokens_details.cached_tokens`。`stream_options.include_usage` 是否需要，**未确认**。
- 价格：GLM-5.3 输入 ¥8 / 百万，命中 ¥2，存储限时免费（[bigmodel 价格](https://docs.bigmodel.cn/cn/guide/start/pricing.md)）；z.ai 上 $1.4 / $0.26（[z.ai 价格](https://docs.z.ai/guides/overview/pricing.md)）。

### 1.9 Gemini（OpenAI 兼容端点）

- OpenAI 兼容文档没写缓存命中放在哪个字段，**未确认**（[OpenAI compatibility](https://ai.google.dev/gemini-api/docs/openai)）。原生接口是 `usageMetadata.cachedContentTokenCount`，`promptTokenCount`「includes the number of tokens in the cached content」（[generateContent 参考](https://ai.google.dev/api/generate-content)）。
- Gemini 2.5 及以后隐式缓存默认开启；Gemini 4 Argon、3.8 / 3.6 Flash、3.1 Pro 最少 4096 token（[Caching](https://ai.google.dev/gemini-api/docs/caching)）。没有写入费；Gemini 4 Argon 起只有隐式缓存（[Pricing](https://ai.google.dev/gemini-api/docs/pricing)）。

### 1.10 硅基流动

- `prompt_cache_hit_tokens`、`prompt_cache_miss_tokens`、`prompt_tokens_details.cached_tokens` 都有；示例里 hit + miss = `prompt_tokens`（[Chat Completions 参考](https://docs.siliconflow.cn/cn/api-reference/chat-completions/chat-completions)）。流式最后一块是否带缓存字段、缓存是否隐式、TTL：**未确认**。
- Anthropic 兼容 `/v1/messages`：usage 有 `cache_read_input_tokens`、`cache_creation_input_tokens`；`input_tokens` 是否含缓存 **未确认**（[Messages 参考](https://docs.siliconflow.cn/cn/api-reference/chat-completions/messages)）。

### 1.11 MiniMax（补充，Anthropic 兼容常见）

- OpenAI 兼容：`prompt_tokens_details.cached_tokens`；是否计入 `prompt_tokens` 文档没直说，计价示例暗示计入。被动缓存 512 token 起，写入不另收费（[Prompt caching](https://platform.minimax.io/docs/api-reference/text-prompt-caching)）。
- Anthropic 兼容：「total_input_tokens = cache_read_input_tokens + cache_creation_input_tokens + input_tokens」，字段在 `usage`（流式在 `message_start`）（[Anthropic API 兼容缓存](https://platform.minimax.io/docs/api-reference/anthropic-api-compatible-cache)）。

### 1.12 推荐的 Chat Completions 提取规则

对流里最后拿到的 `usage`（现有逻辑不变）：

1. `total = usage.prompt_tokens`。所有查到的服务都把缓存算在里面。
2. `read` 取第一个是整数的：`prompt_tokens_details.cached_tokens` → `prompt_cache_hit_tokens`（DeepSeek、硅基流动）→ `usage.cached_tokens`（Kimi 旧字段）。都没有就当 0。
3. `write` 取第一个是整数的：`prompt_tokens_details.cache_write_tokens`（OpenAI 5.6+、OpenRouter、Kimi）→ `prompt_tokens_details.cache_creation_input_tokens` → `prompt_tokens_details.cache_creation.cache_creation_input_tokens`（百炼两种写法）。都没有就当 0。
4. `uncached = max(total - read - write, 0)`。三项分开记。
5. 健壮性：`prompt_tokens_details` 可能是 null 或缺失；数值可能缺失。只认 `int`，和现有 `_input_tokens` 一样。

Responses 用 `input_tokens_details.cached_tokens` / `cache_write_tokens`，同样从 `input_tokens` 里减。Anthropic 保持现在的「三项相加得总数」，另外把 `cache_read_input_tokens`、`cache_creation_input_tokens`（以及 `cache_creation.ephemeral_1h_input_tokens`，用于 1 小时价）分开记；`message_start` 先有、`message_delta` 后补的做法已经兼容百炼。

---

## 2. Anthropic：写入价、TTL、断点

来源均为 [Prompt caching](https://platform.claude.com/docs/en/build-with-claude/prompt-caching)，除非另注。

- **倍率**：5 分钟写入 = 1.25 × 基础输入价；1 小时写入 = 2 ×；读取 = 0.1 ×，例外是 Opus 5.5 / Sonnet 5.5 为 0.05 ×，Fable 5.1 / Mythos 5.1 为 0.025 ×（「Pricing」表与脚注）。这些倍率与 Batch 折扣、长上下文价叠加。Haiku 5.5 按提示长度分档（10 万 token 以上全部价格提高）。
- **TTL**：默认 5 分钟，每次命中免费续期；从「写或读这条缓存的请求开始」计时，生成时间也算在内。可选 `"ttl": "1h"`。同一请求混用时，1 小时的断点必须在 5 分钟断点之前。
- **最小可缓存长度**（不够时静默不缓存、不报错，两项缓存字段都是 0）：
  - 512：Fable 5.1、Mythos 5.1、Opus 5.5、Opus 5、Sonnet 5.5、Fable 5、Mythos 5、Haiku 5.5
  - 1024：Opus 4.8、Sonnet 5、Sonnet 4.6、Sonnet 4.5 等
  - 2048：Opus 4.7、Mythos Preview
  - 4096：Opus 4.6、Opus 4.5、Haiku 4.5
- **断点数**：最多 4 个；顶层自动缓存占其中一个。
- **回溯窗口**：每个断点最多往回查 20 个位置（含断点本身）；连续的 `tool_use` 块、连续的 `tool_result` 块各算一个位置。回溯只能找到**以前请求在断点处写过**的条目，不会把断点前的稳定内容自动存起来。
- **前缀顺序**：`tools` → `system` → `messages`。改工具定义使全部缓存失效；改 `tool_choice` 只让 messages 部分失效；思考参数和 `output_config.effort` 一改，messages 必失效，tools / system 是否失效看模型（「What invalidates the cache」表）。
- **块级 vs 顶层**：
  - 块级：`cache_control` 放在具体内容块上。`system` 要用 `TextBlockParam` 数组才能加（API 参考里 `system` 是「string or array of TextBlockParam」）。写入只发生在断点处。
  - 顶层：请求体顶层一个 `cache_control`，「automatically applies a cache_control marker to the last cacheable block in the request」（[Messages API 参考](https://platform.claude.com/docs/en/api/messages/create)），随对话往后挪。
  - 两者可以同时用。边界情况：最后一块已有同 TTL 的显式标记则自动缓存什么也不做；**TTL 不同则 400**；**已有 4 个显式断点再加顶层则 400**；最后一块不可做断点时往回找，找不到就跳过。
  - 顶层自动缓存在旧版 Amazon Bedrock（Opus 4.6 及以前）集成上会 400，其他平台都可用。
  - 官方提醒：最后一块每次都变（比如时间戳或新消息）时，断点放在它上面只会每次写、永远不读，自动缓存也会掉进这个坑；应把断点放在「最后一个跨请求不变的块」上。

---

## 3. 第三方 Anthropic 兼容端点对 `cache_control` 的态度

| 端点 | `system` 块上的 `cache_control` | 顶层 `cache_control` | 文档里有没有说会拒绝 |
|---|---|---|---|
| DeepSeek `/anthropic` | 未列出（`system` 一行是「Fully Supported」；tools、text、tool_use、tool_result 上的 `cache_control` 全是「Ignored」） | 未列出 | 没有 |
| OpenRouter `/api/v1/messages` | 支持（schema 里 `system` 是 `AnthropicTextBlockParam` 数组，带 `cache_control`） | 支持（schema 顶层有 `cache_control`）；路由到 Anthropic、Vertex、Azure、Bedrock 时生效，Bedrock 上转成尾部断点 | 没有 |
| Kimi `/anthropic` | 「only effective at the top level; `cache_control` markers inside the `messages` array are ignored」；`system` 和 `tools` 上的没单独说 | 支持，`ttl` 可为 `5m` / `1h` | 没有（忽略，不拒绝） |
| 百炼 `/apps/anthropic` | 支持（`system` 文本块、text、tool_use、tool_result），只含 `type: ephemeral` | 未写 | 没有；工具定义上的标记被忽略 |
| MiniMax `/anthropic` | 支持（tools、system、text、tool_use、tool_result），5 分钟，最多 4 个 | 未写 | 没有 |
| 智谱 `/api/anthropic` | 未写 | 未写 | 只说「某些场景下智谱与 Claude 接口仍存在差异」 |
| 硅基流动 `/v1/messages` | schema 里 `system` 文本块只有 `text`、`type`，`additionalProperties: false` | 未写 | 运行时是否拒绝 **未确认** |

来源：[DeepSeek Anthropic API](https://api-docs.deepseek.com/guides/anthropic_api#anthropic-api-compatibility-details)；[OpenRouter Create a message](https://openrouter.ai/docs/api/api-reference/anthropic-messages/create-a-message.md)、[OpenRouter Prompt Caching「Anthropic Claude」](https://openrouter.ai/docs/features/prompt-caching.md)；[Kimi Messages API](https://platform.kimi.ai/docs/api/messages)；[百炼 Anthropic 兼容 Messages](https://help.aliyun.com/zh/model-studio/anthropic-api-messages)、[百炼上下文缓存](https://help.aliyun.com/zh/model-studio/context-cache)；[MiniMax Anthropic 兼容缓存](https://platform.minimax.io/docs/api-reference/anthropic-api-compatible-cache)；[智谱 Claude 接入](https://docs.bigmodel.cn/cn/guide/develop/claude/introduction.md)；[硅基流动 Messages](https://docs.siliconflow.cn/cn/api-reference/chat-completions/messages)。

补充：

- DeepSeek 开源转换代码把多个 `system` 文本块用 `\n\n` 拼起来（`deepseek-recipe/src/protocol/anthropic/messages/request/convert.rs` L284，同一提交），和我们现在把多条 system 拼成一个字符串的结果一致。
- OpenRouter 的 Chat Completions 也接受 Anthropic 式块级 `cache_control`，并在不同上游之间互译：块级 `cache_control` 发往 OpenAI 5.6+ 时变成 `prompt_cache_breakpoint`（丢掉 `ttl`），反之亦然（[Prompt Caching「Explicit prompt caching」](https://openrouter.ai/docs/features/prompt-caching.md)）。

---

## 4. 工具定义渲染在哪里，加减工具会不会破坏缓存前缀

### 4.1 DeepSeek V4.1-Flash（`deepseek-flash` 背后的模型）

- 官方仓库的模型卡说本次发布不附 Jinja 模板，参考实现是 `encoding/encoding.py`，生产用法指向 `deepseek-recipe`（[README L160-162](https://huggingface.co/deepseek-ai/DeepSeek-V4.1-Flash/blob/5254448103b6254fc646dacbca1cbbf20e9216c1/README.md)）。后来补的 `chat_template.jinja` 注明是从 `encoding.py` 移植的。
- **工具渲染在第一条 system 内容之后**：
  - `encoding.py` L607-616：`prompt = SYSTEM_SP_TOKEN …; prompt += reasoning_effort_prompt; … prompt += system_msg_template.format(content=content or ""); if tools: prompt += "\n\n" + render_tools(tools)`（[encoding.py L600-618](https://huggingface.co/deepseek-ai/DeepSeek-V4.1-Flash/blob/5254448103b6254fc646dacbca1cbbf20e9216c1/encoding/encoding.py#L600-L618)）。
  - deepseek-recipe：`has_tools = conversation.tool_choice != ToolChoice::None && !conversation.tools.is_empty()`，有工具时往 `messages.first_mut()` 的内容后追加 `"\n\n"` + 工具说明；没有 system 就插一条空的（[`v4/mod.rs` L214-244](https://github.com/deepseek-ai/deepseek-recipe/blob/8cadfede7063c896b944e7bae05daa3549ae97ea/deepseek-recipe-encoding/src/v4/mod.rs#L214-L244)）。
  - 测试样例开头是 `<｜begin▁of▁sentence｜><｜System｜>Reasoning Effort: 75 (…)\n\nYou are a helpful assistant.\n\n## Tools`（`encoding/tests/test_output_1.txt` L1-3，同一提交）。
- 所以：
  - 加减 `tools` **不改** system 内容之前和之中的 token；**改** system 内容之后的所有 token（工具说明夹在 system 和第一条 user 之间）。
  - 按 recipe 编码器，**`tool_choice: "none"` 时工具说明整个不渲染**，效果等同于没有工具。HF 参考 `encoding.py` 没有这个分支（**推断**：它只看 `tools`）。
  - 在 system 之前的是思考强度行：思考模式下 `Reasoning Effort: N` 在 `<｜System｜>` 和 system 内容之间（`encoding.py` L604-608），改强度或开关思考会让整段前缀从第一个 token 起就不同。
  - HF 参考里只要有工具，历史轮次的思考内容就不再丢弃（`encoding.py` L781-784：「if any message has tools defined, don't drop thinking」），思考模式下加减工具还会改变历史部分的渲染。recipe 两种情况都不丢。
- DeepSeek 文档本身没说工具是否属于缓存前缀，**未确认**（缓存指南、API 参考、工具调用指南里都没有）。结合「只能整段命中一个前缀单元」「单元存在 user 输入末尾和输出末尾」（[Context Caching](https://api-docs.deepseek.com/guides/kv_cache)），**推断**：上一轮带工具、这一轮不带（或反过来），这一轮最多只能接上「到 system 内容末尾为止」的那段，而且前提是恰好有一个前缀单元结束在那里（例如被公共前缀检测存过）；历史对话部分接不上。
- V4-Pro（`deepseek-v4-pro`）同样把工具接在 system 后面（[`encoding_dsv4.py` L280-283](https://huggingface.co/deepseek-ai/DeepSeek-V4-Pro-0813/blob/72e1d3230f6c080a530b0a1d46f8eb4602340597/encoding/encoding_dsv4.py#L280-L283)）。

### 4.2 OpenAI

- 「OpenAI caches the model's full rendered context including OpenAI-provided instructions, developer messages, tool definitions, and conversation history」；会影响前缀的设置里有 `tools`（改名称、描述、schema、顺序都算）（[Prompt caching「What is the prompt cache?」](https://developers.openai.com/api/docs/guides/prompt-caching)）。
- 官方建议：「Disable tool use for a request. Set `tool_choice` to `"none"` instead of removing the tool definitions.」；按需启用用 `allowed_tools`，保持 `tools` 列表稳定（同页「Manage tools with append-only updates」）。
- GPT-5.6 之前的模型，路由哈希也包含工具定义：「A hash of the initial tokens after the hidden OpenAI content, including tool definitions when present」（同页「Cache location」）。

### 4.3 Anthropic

- 「Prompt caching references the entire prompt: `tools`, `system`, and `messages` (in that order)」；改工具定义使全部缓存失效（[Prompt caching](https://platform.claude.com/docs/en/build-with-claude/prompt-caching)）。
- `tool_choice` 变化只让 messages 层失效，tools 和 system 层的缓存还在（同页「What invalidates the cache」）。所以「保留 `tools`、最后一轮发 `tool_choice: none`」在 Anthropic 上只损失 messages 层的命中；在 4.5 / 5.5 系列上还关系到思考块是否保留（见 `.scratch/reasoning-effort/research.md`）。

---

## 5. 价目表里的缓存价

### 5.1 models.dev（`https://models.dev/api.json`）

- 结构：顶层按服务商 id，`models` 按模型 id；`cost` 字段：`input`、`output`、`cache_read`（可选）、`cache_write`（可选）、`reasoning`、`input_audio`、`output_audio`，以及生成出来的 `tiers[]` 和旧的 `context_over_200k`。单位都是**美元 / 百万 token**（[README L298-304](https://github.com/anomalyco/models.dev/blob/ed048b653e6ef84645a0cd22fc5e46f82aea06e7/README.md#L298-L304)：「`cost.cache_read` _(optional)_: Number — Cost per million cached read tokens (USD)」「`cost.cache_write` _(optional)_: Number — Cost per million cached write tokens (USD)」；[schema.ts L73-112](https://github.com/anomalyco/models.dev/blob/ed048b653e6ef84645a0cd22fc5e46f82aea06e7/packages/core/src/schema.ts#L73-L112)）。
- 2026-10-14 的数据：8377 个有 `cost` 的模型里 5724 个有 `cache_read`，1887 个有 `cache_write`。
- DeepSeek（都没有 `cache_write`）：
  ```
  deepseek-flash   {"input": 0.15, "output": 0.6, "reasoning": 0.6, "cache_read": 0.003}
  deepseek-v4-pro  {"input": 0.66, "output": 1.98, "reasoning": 1.98, "cache_read": 0.022}
  ```
  这是非高峰价；DeepSeek 官方价目表另有工作日高峰价（翻倍），models.dev 没表达（[DeepSeek Pricing](https://api-docs.deepseek.com/quick_start/pricing)）。
- Anthropic（全部 17 条都有 `cache_write`，等于 5 分钟价 1.25 ×）：
  ```
  claude-opus-5-5    {"input": 4, "output": 20, "cache_read": 0.2, "cache_write": 5}
  claude-sonnet-5-5  {"input": 2, "output": 10, "cache_read": 0.1, "cache_write": 2.5}
  claude-haiku-5-5   {"input": 0.1, "output": 0.5, "cache_read": 0.01, "cache_write": 0.125, "tiers": [{… "tier": {"type": "context", "size": 100000}}]}
  claude-sonnet-4-6  {"input": 3, "output": 15, "cache_read": 0.3, "cache_write": 3.75}
  ```
  没有 1 小时写入价的字段。
- 其他：OpenAI gpt-5.6 / gpt-6.x 有 `cache_write`（1.25 ×）；智谱写的是 `"cache_write": 0`；kimi-k3 的 `cache_write` 等于 `input`；Google 没有 `cache_write`。

### 5.2 OpenRouter（`https://openrouter.ai/api/v1/models`）

- `pricing` 的字段：`prompt`、`completion`、`input_cache_read`、`input_cache_write`、`input_cache_write_1h`、`request`、`image`、`web_search`、`internal_reasoning`、`overrides`、`discount` 等。单位是**美元 / token**（按次的字段是美元 / 次），值是十进制字符串（[Models 指南「Pricing Object」](https://openrouter.ai/docs/guides/overview/models)：「All pricing values are in USD per token/request/unit」；[OpenAPI](https://openrouter.ai/openapi.json) `PublicPricing`）。
  - `input_cache_read`：「Price in USD per cached input token (read)」。
  - `input_cache_write`：「For providers with multiple cache TTLs (e.g. Anthropic), this is the default (5-minute) cache-write rate.」
  - `input_cache_write_1h`：「Only present for providers that price an extended (1-hour) cache TTL separately, such as Anthropic.」
  - `overrides[]`：按 `min_prompt_tokens`（长上下文）或 `utc_start` / `utc_end` / `utc_days`（时段）覆盖价格。
- 2026-10-14 的数据：667 个模型里 318 个有 `input_cache_read`，96 个有 `input_cache_write`，35 个有 `input_cache_write_1h`。
- DeepSeek（都没有 `input_cache_write`）：
  ```
  deepseek/deepseek-v4.1-flash  {"prompt": "0.00000002016", "completion": "0.000000891", "input_cache_read": "0.0000000054"}
  deepseek/deepseek-v4-pro      {"prompt": "0.000000427518", "completion": "0.000000855036", "input_cache_read": "0.0000000356265"}
  ```
- Anthropic：
  ```
  anthropic/claude-opus-5.5    {"prompt": "0.000004", "completion": "0.00002", "input_cache_read": "0.0000002", "input_cache_write": "0.000005", "input_cache_write_1h": "0.000008", …}
  anthropic/claude-sonnet-5.5  {"prompt": "0.000002", "completion": "0.00001", "input_cache_read": "0.0000001", "input_cache_write": "0.0000025", "input_cache_write_1h": "0.000004", …}
  ```
- 注意：OpenRouter 的 `pricing` 是「top provider」的价，不一定是第一方价（例如 `deepseek/deepseek-v4.1-flash` 的 `prompt` 是 $0.02016 / 百万，DeepSeek 官方 `deepseek-flash` 是 $0.15）。另外 OpenRouter 文档说 DeepSeek 的写入「charged at the same price as the original input pricing」（[Prompt Caching「DeepSeek」](https://openrouter.ai/docs/features/prompt-caching.md)），这和「缺写入价就按输入价算」一致。

---

## 6. DeepSeek 连续两条 `system` 消息

- API 参考只定义了 system 消息有 `content` 和可选 `name`，没说连续两条会怎样，**未确认**（[Create Chat Completion](https://api-docs.deepseek.com/api/create-chat-completion)）。
- 开源编码器的行为：
  - **V4.1（`deepseek-flash`）**：每条 system 各自一个 `<｜System｜>` 段，不拼接。「Mid-conversation system messages are supported via the `<｜System｜>` token.」（[encoding.py L12-18](https://huggingface.co/deepseek-ai/DeepSeek-V4.1-Flash/blob/5254448103b6254fc646dacbca1cbbf20e9216c1/encoding/encoding.py#L12-L18)，L610-613 `if index > 0: prompt += SYSTEM_SP_TOKEN`）。渲染结果是 `<bos><｜System｜>[强度行]{sys1}[\n\n工具]<｜System｜>{sys2}<｜User｜>…`：顶层工具接在**第一条** system 后面（recipe `v4/mod.rs` L234 `messages.first_mut()`）。所以第一条 system（连同其后的工具说明）的渲染不受第二条影响。recipe 会丢掉空的 system 消息（`openai/chat_completion/request/convert.rs` L343-347）。
  - **V4-Pro（`deepseek-v4-pro`）**：recipe 里 `supports_mid_conversation_system` 为 false，开头连续的 system 用 `\n\n` 拼成一条，出现在非 system 消息之后的 system 改成 user 消息（`v4/dsv4.rs` L48-53、`v4/mod.rs` L337-352）；HF 的 `encoding_dsv4.py` 则不加分隔符直接拼（L42、L280-281），两者不一致。拼接时第一条的 token 仍是前缀（**推断**：拼接点的分词可能变）。
- 线上 API 是否就跑这些编码器 **未确认**。

---

## 对本项目的含义

- **记录缓存 token**：
  - Chat Completions 适配器按 1.12 的规则从最后一个 `usage` 拆出「读 / 写 / 未缓存」三项。`prompt_tokens` 当总数，不用再加。DeepSeek、OpenRouter 不开 `include_usage` 也会给，开着无害。
  - Responses 适配器读 `input_tokens_details.cached_tokens` / `cache_write_tokens`，从 `input_tokens` 里减。
  - Anthropic 适配器已经在算总数，只需把 `cache_read_input_tokens`、`cache_creation_input_tokens` 和 `cache_creation.ephemeral_1h_input_tokens` 分开留下。`message_start` / `message_delta` 依次 `update` 的写法兼容百炼（缓存字段只在 `message_delta`）和其他家。
- **按缓存价计价**：
  - 价目表要多存两三列：`cache_read`、`cache_write`（5 分钟档），可选 `cache_write_1h`（只有 OpenRouter 有）。models.dev 直接是美元 / 百万；OpenRouter 要乘 1e6，和现在处理 `prompt` 一样。
  - 价目表缺 `cache_read` 时按输入价算（保守，不会少算）；缺 `cache_write` 时按输入价算（DeepSeek、Gemini 没有写入费，OpenRouter 也说 DeepSeek 写入按输入价）。智谱的 `cache_write: 0` 照用。
  - 不要用固定倍率推缓存价：Anthropic 读取倍率因模型而异（0.1 / 0.05 / 0.025），DeepSeek 是 1/50，百炼隐式 20%、显式 10%。
  - 价目表的局限要知道：DeepSeek 高峰价、长上下文分档（models.dev `tiers`、OpenRouter `overrides`）、OpenRouter 的「top provider」价都不是我们现在模型里有的东西。OpenRouter 的 usage 还直接给 `cost`，走 OpenRouter 时可以考虑直接用。
- **Anthropic 适配器加 `cache_control`**：
  - 最稳的形式是块级：把 `system` 改成文本块数组，在**最后一个跨请求不变的块**上加 `{"type": "ephemeral"}`，不带 `ttl`。Anthropic、OpenRouter、百炼、MiniMax 文档明确支持；DeepSeek 在其他位置写明「Ignored」、`system` 块未列；Kimi 忽略块级；智谱未写；只有硅基流动的 schema 看上去不允许多余字段（是否真会 400 **未确认**）。没有任何一家文档说会因此报错。
  - 顶层 `cache_control`：Anthropic、OpenRouter、Kimi 支持，其余未写；在 Anthropic 上和块级混用时 TTL 不一致或已有 4 个断点都会 400，旧版 Bedrock 直接 400。
  - 断点位置比形式更要紧：现在的 system 中段有逐轮变化的内容（制作人段里的当前时间、记忆、检索结果），断点打在整个 system 的末尾，每轮只会写、不会读，而写入要多付 25%。要么把稳定部分（角色设定、世界、格式说明）拆成前面的块并在那里打断点，要么在对话末尾用自动缓存；最小长度在 5.5 系列是 512，在 Opus 4.5 / 4.6、Haiku 4.5 是 4096，不到就静默不缓存。
- **总是提供回忆工具对 DeepSeek 缓存的影响**：
  - 有影响，而且方向是「总是提供更好」。DeepSeek V4.1 把工具说明接在 system 内容后面，前缀单元只能整段命中；现在预先检索过的那一轮 `tools` 为空，其后的历史对话部分就和上一轮（带工具）对不上。
  - 同理，最后一轮发 `tool_choice: none`，按 recipe 编码器工具说明会整个消失，这一轮也接不上同一用户回合里前一次请求的前缀。是否值得改要看实测命中率。
  - 若要把逐轮变化的内容拆到第二条 system 里：V4.1 会把它渲染成独立的 `<｜System｜>` 段，工具说明仍跟在第一条后面，第一段前缀稳定；V4-Pro 会把开头连续的 system 拼起来，效果是第一条仍在最前、但拼接点之后都会变。
  - OpenAI、Anthropic 也都把工具算进前缀，官方都建议用 `tool_choice: none` 代替删工具，所以「总是提供、需要时禁止调用」对三家都是同一个方向。
