# 02: 回忆工具每回合都提供，Anthropic 在共用固定部分打缓存断点

**What to build:** 有检索的部署里，每个回合都向对话模型提供回忆工具；这回合已经预先回忆过剧情时，和最后一轮一样提供但禁止调用。走 Anthropic 协议的对话模型，所有用户共用的固定部分（人设、世界设定）能命中缓存。走 Chat Completions 和 Responses 发出去的文本和现在逐字相同。背景见 `../spec.md`「回忆工具始终提供」「Anthropic 缓存断点」。

**Blocked by:** None (can start immediately)

**Status:** done

**难度：小到中。** 引擎改两处（工具列表、开头系统消息拆两条），三个适配器处理开头连续的系统消息。不改提示词的内容和顺序，角色表现不变。和 01 都改适配器，合并时注意。

## 已定的设计（详见 spec）

- 预先回忆过的回合：工具照样提供，`forbid_calls`。模型硬调了照旧不理。DeepSeek 上可能没有收益（`tool_choice: none` 时编码器不渲染工具），由 03 实测、04 定。
- 引擎把开头的系统内容拆成两条：共用固定部分（人设、世界设定），其余部分（制作人、记忆、剧情、格式说明，顺序不变）。
- Chat Completions、Responses：开头连续的系统消息用空行拼成一条，结果和现在逐字相同。
- Anthropic：`system` 变成文本块数组，共用固定部分那块打 `cache_control: {"type": "ephemeral"}`，不带 `ttl`；不用顶层 `cache_control`。

## 验收

- [x] 引擎测试（假 ChatLLM）：预先回忆过的回合也收到回忆工具，且禁止调用；没有检索的部署仍然不提供工具。
- [x] 引擎测试：开头两条系统消息，第一条只有人设和世界设定；两条拼起来和改动前的系统提示词逐字相同。
- [x] 适配器测试：Chat Completions、Responses 发出的系统内容是一条，文本和拼接结果相同；Anthropic 的 `system` 是两个文本块，只有第一块带 `cache_control`，请求顶层没有 `cache_control`。
- [x] 保存时的检查照常通过（检查用的请求没有共用固定部分，不受影响）。
- [x] 实测：本地构建版接真实 `deepseek-flash` 发几个回合，回复正常；问一个剧情问题触发预先回忆，回复里没有冒出工具调用的标记。若手头有 Anthropic 协议的 key（或 DeepSeek 的 `/anthropic` 端点），发两个回合确认请求成功。
- [x] `backend/` 下 `pytest` 全部通过，`ruff`、`pyright` 没有新的报错。

## Comments

- 2026-10-15 实现：`ChatMessage` 多一项 `cache_breakpoint`，引擎在第一条系统消息（人设、世界设定）上设它，第二条是其余部分（制作人、记忆、剧情、格式说明，顺序不变）。Chat Completions 把开头连续的系统消息用空行拼成一条，其余原地发；Responses 本来就把系统消息全拼进 `instructions`，没改；Anthropic 只在有系统消息带标记时把 `system` 发成文本块数组，带标记的那块加 `cache_control: {"type": "ephemeral"}`，没有标记（保存时的检查、提炼记忆等）仍发字符串。有检索时每回合都给回忆工具，预先回忆过的回合 `forbid_calls`，只有一轮。测试里读系统提示词改用 `tests/fakes.py` 的 `system_of`；靠「有没有给工具」判断是否预先回忆的测试改看 `forbidden`。
- 2026-10-15 实测（本地后端直连，没起前端；脚本验完删了）：`deepseek-flash`（Chat Completions）和真乃连发 4 个回合，后两个问剧情的触发了预先回忆，请求里 `tools: [recall_story]`、`tool_choice: "none"`、系统消息一条，回复正常、没有工具调用的标记，也答对了剧情。改走 DeepSeek 的 `/anthropic` 端点（`CHAT_LLM_PROTOCOL=anthropic`，`…/anthropic/v1`）：启动检查通过，发两个回合都成功，`system` 是两个文本块、只有第一块带 `cache_control`、顶层没有；服务报了命中（7633 里 6528、7704 里 7552）。
- 2026-10-15 补：原先保存时的检查请求里没有带标记的系统消息，要是哪家 Anthropic 兼容服务拒收 `cache_control`，检查能过、之后每个回合都失败。现在检查请求开头也是一条带 `cache_breakpoint` 的系统消息，和真实回合同形（三种协议都带；Chat Completions、Responses 上只是多一条系统消息）。DeepSeek 的 Chat Completions 和 `/anthropic` 端点实测检查都通过。
