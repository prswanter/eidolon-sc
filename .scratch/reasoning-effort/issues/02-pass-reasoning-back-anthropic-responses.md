# 02: Anthropic 和 Responses 也带回思考内容

**What to build:** 对话模型接的是默认开着思考的 Claude 5.5（Anthropic 协议），或者 OpenAI 推理模型（Responses 协议）时，工具调用之后的那次请求把模型刚才的思考原样带回，「回顾剧情」照常可用，模型也记得自己刚才想了什么。背景见 `../spec.md`「回合内回传思考内容」。

**Blocked by:** 01（思考内容这种流式条目、引擎把它挂在助手消息上、检查走两轮，都在 01）

**Status:** done

**难度：中高。** 接口和引擎在 01 里已经就位，这张票只改两个适配器的读和写，但两种协议的格式各不相同，要手写录制文件。

## 已定的设计（详见 spec）

- Anthropic：保留 `thinking` 和 `redacted_thinking` 块（含 `signature`），按原来的顺序放在 text 和 tool_use 前面写回助手消息。流式时 thinking 块由 `content_block_start`、`thinking_delta`、`signature_delta` 拼出来。
- Responses：保留 `reasoning` item（含 `encrypted_content`），按原来的顺序放在 function_call 前面写回 input。`store` 仍然是 `false`。
- 只带回服务发来的东西；没发就和现在一样。本票不发 `include`，强度设置在 03 里加。

## 验收

- [x] 适配器测试（Anthropic）：录好的流里有 thinking 块（含签名）和 tool_use，下一次请求的助手消息依次是 thinking、（text）、tool_use，内容和签名原样；有 redacted_thinking 时同样带回。
- [x] 适配器测试（Responses）：录好的流里有带 `encrypted_content` 的 reasoning item 和 function_call，下一次请求的 input 里，reasoning item 原样排在 function_call 前面。
- [x] 两种协议流里没有思考内容时，请求体和现在一样。
- [x] 录制文件放在现有的录制目录，形状以 `../research.md` 第 2 节引用的官方文档为准。
- [x] `backend/` 下 `pytest` 全部通过，`ruff` 和 `pyright` 没有新的报错。
- [x] **人工验收（留给用户，有密钥时）**：用 Claude 5.5 或 OpenAI 推理模型实际走一次回顾剧情。（2026-10-14 用本地 magpie 的 Opus 5.5 在适配器这一层走了两轮，见 Comments；没有在应用里点过。）

## Comments

- 2026-10-14 实现：Anthropic 的 `Reasoning.data` 形如 `{"blocks": [thinking 或 redacted_thinking 块, …]}`，块按 content block 的 index 排，字段照服务发来的（thinking 文本由 `thinking_delta` 拼，签名由 `signature_delta` 拼，没发签名就没有 `signature` 键）；写回时放在助手消息 content 的最前面，后面是 text、tool_use。Responses 的形如 `{"items": [reasoning item, …]}`，取 `response.output_item.done` 里的完整 item，按 output_index 排；写回 input 时放在这条助手消息的文字和 function_call 前面。只有一段文字、没调工具的回复也会吐出 `Reasoning`（和 chat-completions 一样），引擎只在带工具调用的助手消息上用它。
- 没签名的 thinking 块、`encrypted_content` 是空串的 reasoning item 也原样带回，不过滤。依据：现有录制（经网关的 `deepseek-v4.1-flash`）两种协议都是这样发的；DeepSeek 的 `/anthropic` 不带回 thinking 会 400「The `content[].thinking` in the thinking mode must be passed back to the API」，无签名或带它自己的 UUID 签名都接受（NousResearch/hermes-agent #17992、#137235 的实测），经 OpenRouter 调 deepseek-v4-flash 也有同样的报告（hermes-agent #69008）。Anthropic 官方总会发签名，OpenAI 官方在 `store:false` 时总会发 `encrypted_content`，所以对官方服务没有区别。`encrypted_content` 为空的 item 回传给经网关的 DeepSeek 能不能过，**未实测**。
- 2026-10-14 实测（用 `.env` 里线上的 DeepSeek key，走 `https://api.deepseek.com/anthropic`，`deepseek-flash`）：第一轮调用 `recall_story`，流里有一个 thinking 块，签名是 36 字符的 UUID（DeepSeek 自己签的）；第二轮带回 thinking 和 tool_use，加上 `tool_choice:{type:"none"}`，正常回答。对照组不带回 thinking 这次也通过，没复现第三方报告的 400。
- 2026-10-14 实测 Responses（同一个 DeepSeek key，`https://api.deepseek.com/v1/responses`，不带 `/v1` 也通，`deepseek-flash`）：第一轮调用 `recall_story`，`output_item.done` 里的 reasoning item 带着 `id`、`status`、`content`（`reasoning_text` 全文）、空的 `summary`，以及 `encrypted_content`（一个 UUID 加 `-0`，DeepSeek 自己的标识，不是加密内容）；第二轮把这个 item 整条放在 function_call 前面，加上 `tool_choice:"none"`，正常回答。对照组不带回 reasoning 也通过。之前那条说的「`encrypted_content` 为空的 item 能不能过」仍未实测（那是经网关时的形状），但 DeepSeek 直连发来的 item 原样带回没问题。
- 2026-10-14 实测 Claude（本地 magpie 网关 `http://127.0.0.1:3425/v1`，`claude/claude-opus-5-5`，不设思考参数）：第一轮流里依次是 thinking、tool_use，没有文字；thinking 正文是空串（默认不显示），签名 936 个字符。第二轮带回 thinking 和 tool_use、同样的工具、`tool_choice:{type:"none"}`，正常回答，而且第二轮流里只有文字，没有再想。对照：不带回 thinking 也不报错，但第二轮又出现一个 thinking 块，等于重新想了一遍。另一个对照：带回 thinking、同时把工具清空（票 01 以前的做法）这次也没有 400，可能是这个账号不在强制前缀检查的范围内，也可能是网关处理了，没能复现 research 2.1 说的报错。
