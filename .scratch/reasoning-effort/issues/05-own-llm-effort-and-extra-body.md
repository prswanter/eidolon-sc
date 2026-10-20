# 05: 自带 LLM 的思考强度和额外请求参数

**What to build:** 自带 LLM 的用户可以在设置页给自己的 LLM 设文字、通话两项思考强度，填一段额外请求参数 JSON。这些和密钥一样只存在浏览器里，随每个回合和通话发给服务器。检查自己的密钥时一起检查。背景见 `../spec.md`「用户自带的 LLM」。

**Blocked by:** 03（强度和额外参数的链路、额外参数的校验在 03 里）

**Status:** done

**难度：中。** 前后端都要动：浏览器本地存储的解析、设置页表单、自带密钥的检查接口、回合和通话的请求体，以及服务器为文字回合、通话和提炼记忆各选哪一档。不碰部署者那边，可以和 04 并行。

## 已定的设计（详见 spec）

- 本地存的自带 LLM 加三项：文字强度、通话强度、额外请求参数。旧数据没有这几项就当作不设置。
- 文字回合用文字强度；通话里的回合用通话强度；提炼记忆一律用文字强度。所以通话时，对话和提炼记忆是两份设置。
- 额外请求参数用 03 的同一份校验：检查接口拒绝并说明原因；回合和通话的请求里带了非法额外参数，服务器拒绝这个回合或这通电话，不照发。
- 服务器不保存这些项（ADR-0017）。
- 设置页的档位、提示和后台一致；选 Anthropic 时不列「极低」。

## 验收

- [x] 前端 `localOwnKeys` 测试：解析带新字段和不带新字段的旧数据；回合和通话的请求体带上这三项。
- [x] 端到端测试（自带 LLM）：文字回合带文字档；通话的回合带通话档、通话里提炼记忆带文字档；非法额外参数被拒。
- [x] 检查接口测试：两档不同各检查一次，报错前缀写明是哪一项；非法额外参数返回原因。
- [x] 实测：在本地构建版的设置页，用 `.env` 里的 DeepSeek 密钥当作自带 LLM，设通话「关闭」，检查通过并保存；刷新后设置还在。
- [x] `backend/` 下 `pytest`、`frontend/` 下 `npm test` 全部通过，`ruff`、`pyright`、`tsc` 没有新的报错。

## Comments

- 票 03 留下的：额外请求参数的校验是 `config.checked_extra_body`（抛 `ValueError`，说明原因），档位校验是 `config.effort_problem(effort, protocol)`；自带 LLM 的检查已经把 `settings.reasoning_effort` 传给 `check_chat_llm`，现在 `own_keys` 拼 `LLMSettings` 时还没带上这两项。前端的档位、「不设置」、Anthropic 不列「极低」、额外参数的 JSON 解析在 `src/lib/reasoningEffort.ts`（`effortChoices`、`effortOf`、`parseExtraBody`、`extraBodyText`），文案在 `copy.reasoningEffort`；后台表单的提示在 `copy.admin.config.formHints`，设置页要的话挪到共用处。
- 2026-10-14 用户决定：自带 LLM 的用户以后还能另配一个「提炼记忆的 LLM」（新功能 `own-background-llm`，分支 `feat/own-background-llm`，等这边合进 main 再做）。这张票里「提炼记忆一律用文字强度」照做；本地存储、请求体、检查接口的形状写成能再加一个同样形状的模型，别把「只有一个 LLM」写死。
- 票 04 留下的：部署者那边的做法可以照搬。`config.ChatModelSettings(text, call_effort)` 是「一个模型、文字一档、通话一档」，`.call` 派生出通话那份设置；`llm.providers.check_chat_models(models, settings)` 两档相同只查一次、不同各查一次，前缀「文字的」「通话的」（底下是 `check_chat_llm(llm, effort, whose)`）；`open_chat_models` 让两份共用一个客户端。通话拿哪一份在 `own_keys.OwnKeys._llms(..., call=True)`：现在只对部署者的模型生效（`DeployerKeys.call_llm`），自带 LLM 那支还是同一个 `_OwnLLM`，这张票在那里按 `call` 选通话强度，提炼记忆那份用文字强度。测试替身 `FakeServiceClients` 有 `efforts`、`efforts_checked`、`refused_efforts`；自带 LLM 走的是 `FakeLLMService`，要的话照样加。
- 2026-10-14 实现：后端请求体里一个自带模型的形状是 `account_api.OwnLLMInput`（连接四项加 `reasoning_effort`、`extra_body`，每次请求都用 `config.checked_extra_body`、`effort_problem` 校验，非法就 422，回合、通话、检查接口都一样）；扮演角色的那个是它的子类 `OwnChatLLMInput`，多一项 `call_reasoning_effort`。`BroughtKeys.llm` 改成 `config.ChatModelSettings`（`OwnLLMSettings` 删了），`OwnKeys._llms` 通话的回合用 `.call`，提炼记忆一律用 `.text`，每份各开一个 `_OwnLLM`。请求体转成设置是 `OwnChatLLMInput.chat_settings()`。检查接口走 `LLMService.check(ChatModelSettings)`，底下是 `check_chat_models`，所以前缀「文字的」「通话的」和部署者那边一样。测试替身 `FakeLLMService` 的检查跑的是真的 `check_chat_models`，多了 `efforts`、`efforts_checked`、`refused_efforts`。
- 前端：本地存储里一个自带模型是 `LocalModel`（解析在 `localOwnKeys.localModel`，旧数据没有、或存错了的强度和额外参数当作不设置），LLM 是 `LocalLLM = LocalModel & { call_reasoning_effort }`，不设置的项不写进存储和请求。档位的名字（`effortLabel`、`EFFORT_ITEMS`）从 `AdminConfig.tsx` 挪进 `lib/reasoningEffort.ts`，两个字段做成共用件 `components/app/ReasoningEffortFields.tsx`（`EffortField`、`ExtraBodyField`），后台和设置页都用它，提示和填错的提示挪进 `copy.reasoningEffort.hints`、`.problems`，后台的 `formHints`、`problems` 引用它们（后台的强度提示多一句 max_tokens）。设置页修改已存的 LLM 时，key 一栏留空就沿用存着的那把，免得只改档位也要重填密钥。
- 给 `own-background-llm`：再加一个自带的提炼记忆模型时，后端在 `OwnKeysInput` 加一项 `OwnLLMInput`，`OwnKeys._llms` 的记忆那份换成它；前端加一项 `LocalModel`，用 `localModel()` 解析。
- 2026-10-14 实测（本地构建版，Playwright）：设置页用 `.env` 的 DeepSeek（`deepseek-flash`，chat-completions）当自带 LLM，通话设「关闭」、文字不设置，试调通过并保存，摘要多一行「思考强度：文字 不设置，通话 关闭（none）」，刷新后还在，本地存储里是 `call_reasoning_effort: "none"`、没有另外两项。额外参数填 `{"model": "x"}` 时试调被拒，提示「额外请求参数不能包含 「model」：……」。接口类型换成 Anthropic 后下拉框不列「极低」。验完删掉了这个自带 LLM。
