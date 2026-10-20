# 01: 工具调用那一轮带回思考内容（chat-completions），检查走完两轮

**What to build:** 部署者或自带 LLM 的用户把对话模型接到 Gemini 3 以上（走 chat-completions）时，「回顾剧情」照常可用，不再在工具调用的第二轮返回 400；这类坏配置在保存或检查时就被拦下，而不是等用户的回合失败。背景见 `../spec.md`「回合内回传思考内容」「最后一轮保留工具」「保存时的检查」三节。

**Blocked by:** None (can start immediately)

**Status:** done

**难度：高。** 动模型接口（流式条目多一种「思考内容」、流式请求多一个「不许调用工具」的选项），引擎的工具调用循环、计量层、测试用的假模型都要跟着改；适配器这张票只做 chat-completions，另外两种协议先只接上「不许调用工具」。

## 已定的设计（详见 spec）

- 思考内容对引擎不透明，挂在助手消息上，只在一个回合之内保留，不进对话历史。
- chat-completions 只带回服务发来的：`reasoning_content` 全文、每个工具调用上的 `extra_content`。没发的不写。
- 最后一轮带着同样的工具，发 `tool_choice:"none"`（Anthropic 是 `{type:"none"}`）。
- 检查：第一轮提供 ping 工具；模型调用了就带回固定的工具结果、同样的工具、不许再调用，再请求一次；第一轮没调用就到此为止。「不支持工具」的区分逻辑保留。

## 验收

- [x] 适配器测试（chat-completions）：录好的流里带 `reasoning_content` 和带 `extra_content.google.thought_signature` 的工具调用，下一次请求的助手消息原样带回这两样；流里没有时，请求体和现在一样。
- [x] 适配器测试（三种协议）：「不许调用工具」时请求带着工具列表和对应的 `tool_choice`；不提供工具的请求不带 `tool_choice`。
- [x] 引擎测试：最后一轮带着同样的工具且不许调用；第一轮吐出的思考内容出现在第二轮的助手消息上；之后存进对话历史的仍然只有文字。
- [x] 检查测试：模型调用了 ping，就有第二轮请求，带着工具结果和 `tool_choice`；第二轮失败时检查报错；第一轮没调用工具时只发一轮。
- [x] 计量层透传思考内容，计费不变；假模型允许这种条目。
- [x] 实测：用 `.env` 里的 `GEMINI_API_KEY`，`gemini-3.1-flash-lite`（或当时可用的 Gemini 3 以上的模型）走 chat-completions 完成一次两轮的工具调用；线上用的 DeepSeek 同样完成。
- [x] `backend/` 下 `pytest` 全部通过，`ruff` 和 `pyright` 没有新的报错。

## Comments

- 2026-10-14 实测（走 chat-completions，`gemini-3.1-flash-lite` 和线上的 `deepseek-flash`）：两家都完成两轮工具调用，第二轮带 `tool_choice:"none"` 和同样的工具；保存时的检查都走了两轮。Gemini 第一轮只发了工具调用上的 `extra_content`（没有 `reasoning_content`），DeepSeek 只发了 `reasoning_content`（工具调用上没有 `extra_content`）。对照：同一请求去掉带回的签名，Gemini 第二轮返回 400，和规格里记的一致。
- 接口：流式条目多了 `Reasoning`（`eidolon.llm`，只有产生它的适配器读 `data`），`ChatMessage.reasoning` 挂在带工具调用的助手消息上；`stream()` 多了仅限关键字的 `forbid_calls`。chat-completions 的 `Reasoning.data` 形如 `{"reasoning_content": 全文, "extra_content": {调用 id: 原样}}`，没发的键不出现。票 02 给 Anthropic、Responses 接思考内容时，照这个做法各自定 `data` 的形状。
