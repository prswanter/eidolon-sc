# 01: 自带 LLM 的用户另配提炼记忆的 LLM

**What to build:** 自带 LLM 的用户可以在设置页另填一个「提炼记忆的 LLM」（接口类型、地址、模型名、key，加它自己的思考强度和额外请求参数）。填了，提炼记忆就用它；不填，照旧用自带的那个 LLM。只存在浏览器里，随每个回合和通话发给服务器。背景见 `../spec.md`。

**Blocked by:** 思考强度的票 05（`.scratch/reasoning-effort/issues/05-own-llm-effort-and-extra-body.md`），并且思考强度已经合进 main。这张票在新分支上从 main 开始做。

**Status:** done

**难度：中。** 前后端都要动，但每一处都照着票 05 给自带 LLM 做的样子再做一份：本地存储的解析、设置页表单、检查接口、回合和通话的请求体、服务器为提炼记忆选哪一个模型。

## 已定的设计（详见 spec）

- 只能附加在自带 LLM 上：没有自带 LLM 时设置页不显示；请求里只带它不带自带 LLM，服务器拒绝；删掉自带 LLM 时一并删掉。
- 限额和免限额密钥的规则不变，只看扮演角色的 LLM 是不是自带的。
- 它有自己的一档思考强度和额外请求参数，校验和票 05 共用一份；填了它，提炼记忆不再跟「文字」那一档走。
- 检查和自带 LLM 走同一个（带着它的强度走完两轮），报错前缀写明「提炼记忆的 LLM」。
- 服务器不保存（ADR-0017）。

## 验收

- [x] 前端 `localOwnKeys` 测试：解析带这一项、不带（旧数据）、这一项坏了只丢这一项；删掉自带 LLM 时一起删；回合和通话的请求体带上它。
- [x] 端到端测试：带了它时，提炼记忆的请求发到它、带它自己的强度和额外参数，对话的请求仍然发到自带 LLM；没带时和现在一样；只带它不带自带 LLM 被拒；非法额外参数被拒；通话里同样。
- [x] 检查接口测试：它检查失败时报错前缀写明「提炼记忆的 LLM」。
- [x] 文档：`GLOSSARY.md` 的「自带密钥」「思考强度」，设置页和隐私说明里讲自带 LLM 的文案。
- [x] 实测：本地构建版的设置页，用 `.env` 里的 DeepSeek key 当自带 LLM，再配一个提炼记忆的 LLM，检查通过、保存，刷新后还在；发一个回合，运行记录里两种调用都记成自带。
- [x] `backend/` 下 `pytest`、`frontend/` 下 `npm test` 全部通过，`ruff`、`pyright`、`tsc` 没有新的报错。

## Comments

- 2026-10-14 实现：后端请求体 `account_api.OwnKeysInput` 多一项 `memory_llm: OwnLLMInput`，强度和额外参数沿用 `OwnLLMInput` 每次请求的校验；只带它不带 `llm` 由 `OwnKeysInput` 的校验拒绝（422，回合和通话一样）。`own_keys.BroughtKeys` 多一项 `memory_llm: LLMSettings`（不在 `SERVICES` 里，`services` 和免限额都不看它），`OwnKeys._llms` 改成拿整个 `BroughtKeys`，提炼记忆那份是 `brought.memory_llm or own_llm.text`。检查接口是另开的 `POST /api/account/keys/memory-llm/check`，走 `OwnKeys.check_memory_llm`：`LLMService.check(ChatModelSettings(own, own.reasoning_effort))`，两档相同所以只查一遍；报错前缀 `MEMORY_LLM_LABEL`（「提炼记忆的 LLM：」）由 `_rejecting` 加在打码后的原因前面。
- 前端：`LocalOwnKeys.memory_llm?: LocalModel`，解析时只有 `llm` 解析成功才解析它；`keepOwnKey`、`forgetOwnKey` 改收 `OwnKeyItem`（`keyof LocalOwnKeys`），`forgetOwnKey(…, "llm")` 连带删 `memory_llm`；`turnOwnKeys` 带上它，`callOwnKeys` 原样带全部、`services` 不报它。设置页 `OwnLLMForm` 加 `kind: "chat" | "memory"`，记忆那份只有一档强度、用 `checkOwnMemoryLLM`，只在存了 LLM 时显示。
- 422 的 `detail` 里，pydantic 的模型级校验（只带 `memory_llm`、Anthropic 不能用「极低」）会把那一项连同 key 原样回显给发请求的用户。自带 LLM 那边（票 05）本来就这样，没在这张票里改。
- 2026-10-14 实测（本地构建版，Playwright，开发登录的临时用户，验完删了）：自带 LLM 用 `.env` 的 DeepSeek（`deepseek-flash`），提炼记忆的 LLM 用同一把 key 的 `deepseek-chat`、强度「关闭」，两个都试调通过、保存，摘要「思考强度：关闭（none）」，刷新后还在，本地存储里是 `llm`、`memory_llm` 两项。带着它们发一个回合成功，记下一条记忆；`service_calls` 里 `chat_llm` 和 `memory_llm` 都是 `own/own`、`own_key = 1`，`memory_llm` 的强度是 `none`（它自己的）。删掉自带 LLM 后提炼记忆那一块消失，本地存储清空。
