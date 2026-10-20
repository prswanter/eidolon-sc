# 03: 实验：在 deepseek-flash 上实测几种排法和禁止调用方式的命中数

**What to build:** 一张表，告诉用户在线上用的 `deepseek-flash` 上，动态内容怎么排、工具怎么处理，每回合各命中多少，附结论。用户据此定下 04 的排法（spec 里的 Q5）和 DeepSeek 上怎么禁止调用（Q9）。背景见 `../spec.md`「实验」，DeepSeek 缓存和编码器的规则见 `../research.md`。

**Blocked by:** None (can start immediately)

**Status:** done

**难度：小。** 一次性脚本，放在 `.scratch/prompt-caching/` 下，不进产品代码、不加测试。会花真钱：用户已同意，预计不到 $0.05，超过 $0.2 先停下问。

## 已定的设计（详见 spec）

- 用本地 `.env` 里部署者的 DeepSeek key 直接调 `deepseek-flash`（Chat Completions，流式，带 `include_usage`），记每回合 `prompt_cache_hit_tokens` / `prompt_cache_miss_tokens`。
- 提示词用真的人设、世界设定、格式说明和回忆工具定义；制作人那段带当前时间；记忆、剧情用大小相近的假内容，每回合换一份；回复用模型的真实回复接进历史。每种情况一段 10 回合左右的固定对话；同一种情况用不同角色或在开头加一句随机话，避免被前一种情况的缓存污染。
- 三种排法：
  - A 现在的（动态内容在系统提示词中间）；
  - B 动态内容作为靠后的系统消息，放在这句话前面，历史里不留；
  - C 只追加：B 的基础上，每回合的动态内容留在之后发出的历史里。
- 三种工具处理（在 B 或 C 上测，取较好的那种）：不提供；提供并 `tool_choice: none`；照常允许调用。
- 一个调了工具的回合：第二轮用 `none` 和照常允许，各命中多少；照常允许时，模型会不会只调用不说话（多试几次）。
- 两回合之间隔几秒（缓存要几秒才建好），并记下发请求的时间。

## 验收

- [x] 脚本和结果在 `.scratch/prompt-caching/` 下；结果写成 `experiment.md`：每种情况每回合的命中和未命中、合计命中率、按闲时价算的输入花费。
- [x] 结论回答三个问题：B 比 A 好多少，C 比 B 好多少（以及 C 让提示词长了多少）；预先回忆过的回合怎么处理工具最好；工具回合的第二轮用 `none` 损失多少、照常允许会不会只调用不说话。
- [x] 附推荐，交给用户定；用户的决定记进本票 Comments，并抄进 04 的 Comments。
- [x] 实际花费写在结果里。

## Comments

- 2026-10-15 用户补充：除了 `deepseek-flash`，再用用户自己的一家临时第三方服务顺带跑一遍，看结论在非 DeepSeek 的服务上站不站得住（用户担心对 DeepSeek 过拟合）。Chat Completions，`base_url` 为 `https://magpie-api.hmhnk.top/v1`，模型 `antigravity/gemini-3.8-flash`；key 在本地 `.env` 的 `EXPERIMENT_THIRD_PARTY_API_KEY`（仓库公开，key 不进仓库）。这家报不报命中、在哪个字段报都不知道，按票 01 适配器的三个候选字段（`prompt_tokens_details.cached_tokens` → `prompt_cache_hit_tokens` → `cached_tokens`）都读，都没有就记「没报」，先跑一两个回合确认再跑全套。中途系统消息、`tool_choice: none` 它接不接受，也记进结果。
- 2026-10-15 实验做完，结果和推荐见 `../experiment.md`。DeepSeek 实际花费 $0.1225（闲时段；超过预计的 $0.05，没到 $0.2），多出来的是工具回合每次都换编号全未命中，以及 review 后在 B 上补测的工具那组。第三方服务除 Gemini 外，按用户提议又测了 mimo、qwen、qfmodel（qwen 的免费额度在最后几次请求用完）。推荐 Q5 用 B（DeepSeek、mimo、qwen 上 B 拿到了大头，C 多省得很少、提示词翻倍；Gemini、qfmodel 上 A、B 都不命中，这条要用户权衡），Q9 维持 `tool_choice: none`。用户的决定见下一条。
- 2026-10-15 用户的决定：**Q5 用 B**（每回合变的内容作为靠后的系统消息，放在历史后面、这句话前面，历史里不留之前回合的）；**Q9 维持 `tool_choice: none`**（预先回忆过的回合和最后一轮都用它，不按服务区分），票 04 在禁止调用上不改代码。已抄进 04 的 Comments。
