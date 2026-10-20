# 02: 文字回合用浏览器里存的 LLM key

**What to build:** 用户在设置页填自己的 LLM 时，服务器先试调一次，但只校验、不保存；通过以后由浏览器按当前用户存进本地。之后每发一个文字回合，浏览器都在请求体里带上这把 key，这一回合（包括之后的后台写记忆）就用用户自己的 LLM，而且不计入限额。这是贯穿前后端的第一条路径，设计见 spec 的「接口」「前端：本地存的自带密钥」「限额豁免」几节。

过渡期说明：这一票合进来后、03 合进来前，通话里的 LLM 仍用服务器上存的那份，或者部署者的。分支要等全部做完才部署，这个中间状态可以接受。

**Blocked by:** 01

**Status:** done

- [x] 有一个只校验、不保存的 LLM 接口，要登录才能调。试调规则跟原来保存时的一样：公开部署要求 https 加公网地址，要能流式输出、能调工具，失败时不带工具再试一次以区分原因。通过时返回规范化后的 `base_url` 和 `model`，不通过时返回 422 并带上服务商的原因。调用后数据库里不留任何记录。
- [x] 文字回合的请求体接受可选的 `own_llm`（`api_key`、`base_url`、`model`、`protocol`），字段约束跟原来的保存接口一样，`api_key` 用 `SecretStr`。带了就用它扮演角色、写这一回合的记忆；没带就用部署者的。不再从数据库读用户的 LLM。
- [x] 文字回合带了 `own_llm` 就不计入限额。限额为零的用户没带时被拒，提示去设置页填。自带的 LLM 失败时，回合照旧失败，不回退到部署者的。
- [x] 公开部署每次连接都检查公网地址，相关的现有测试照旧通过。
- [x] 前端有一个本地存储模块，按用户 ID 分开存，键为 `eidolon.ownKeys.<userId>`，值是明文 JSON。它能读、写、删某一项，清空某个用户，组装文字回合要带的 `own_llm`，并且每次发请求都现读。这一票只需要用到 LLM 这一项，但存储格式要能放下三项。
- [x] 设置页的 LLM 一节：填写时先校验、通过后写进本地；照旧显示「模型 · 服务地址」和末 4 位（末 4 位由前端算）；删除只删本地。
- [x] `sendTurn` 在请求体里带上本地存的 `own_llm`。
- [x] 设置页的豁免提示里，「文字对话计不计入」按本地有没有 LLM 来判断。
- [x] 测试：HTTP 层测「带了用用户的、没带用部署者的、校验只试不存、限额为零没带被拒」；前端测本地存储模块（stub `localStorage`）和 `sendTurn` 的请求体。

## Comments

### 实现（2026-10-10）

- 后端：`POST /api/account/keys/llm/check` 只试调不保存（`OwnKeys.check_llm`），通过时返回去掉首尾空白的 `base_url`、`model`，不通过 422「试调失败：…」。回合请求体 `TurnInput.own_llm`（`OwnLLMInput`，`api_key` 是 pydantic 的 `Secret[...]`，带原来的长度和字符约束，repr 和 traceback 里是 `**********`），组装成 `BroughtKeys(llm=...)` 交给 `Admissions.turn(user_id, character_id, brought)`；回合不再读库，回合那条「解不开」的 409 随之消失（通话那条还在，06 删）。
- `/api/account` 多返回 `id`，浏览器按它分开存 key。
- 过渡期保留：`PUT /api/account/keys/llm` 和 `GET /api/account/keys` 里服务器存的 LLM 还在，只给通话用（03 换掉，06 删接口）；前端不再调 `PUT`。`GET /api/account/keys` 的 `exempt.turns` 前端不再看。
- 前端：新模块 `src/lib/localOwnKeys.ts`（键 `eidolon.ownKeys.<userId>`，明文 JSON，三项的形状都定好了，读的时候逐项校验，存错的那项当没有；try/catch 包住）。`sendTurn(conversationId, text, userId)` 每次现读 `turnOwnLLM(userId)` 放进 `own_llm`。用户 ID 由对话外壳（`ConversationDirectory`，本来就先问 `getAccount`）放进 context，对话页传给 `ConversationView`。
- 设置页 LLM 一节：填写先 `checkOwnLLM`，通过后 `keepOwnKey` 存本地；显示「模型 · 服务地址」和前端算的末 4 位；删除只删本地。豁免提示里文字对话按本地有没有 LLM 算；通话仍取服务器的 `exempt.calls`，但本地没有 LLM 时不显示「都不计入」（03 改成全按本地算）。
- 代码评审后删掉两条重复测试（`test_own_speech_keys.py` 里回合带 LLM 不计入，准入层 `test_admission.py` 已测；`localOwnKeys.test.ts` 里只带 LLM，`api.test.ts` 已测），`OwnLLMInput.settings()` 改名 `normalized()`。
- 测试：`test_own_llm.py` 改写（只试不存且库里没有记录、试调失败 422、带了用用户的没带用部署者的、写记忆也用用户的、失败不回退、库里存的 LLM 不再用于回合、格式不对 422 且不试调）；限额为零没带被拒沿用 `test_user_limits.py`，改成在回合里带 key；`test_admission.py` 的回合用例传 `BroughtKeys`，删掉回合「解不开」那条；`test_sign_in.py` 断言同一身份同一 `id`、两个身份不同。前端 `localOwnKeys.test.ts`，`api.test.ts` 测 `sendTurn` 只给存了 LLM 的用户带 `own_llm`。

### 人工验证

用构建版前端（`next build` + `next start`）和本地后端：

1. 设置页「自带密钥」→ LLM 填一组能用的接口地址、模型、key，点「试调并保存」：通过后显示「模型 · 服务地址」和末 4 位，开发者工具 Application → Local Storage 里有 `eidolon.ownKeys.<你的用户 ID>`，里面是这组 LLM；服务器数据库 `own_keys` 表里没有新的 llm 行。
2. 故意填错 key：显示「试调失败：…」和服务商的原因，本地什么都没存。
3. 豁免提示变成「文字对话用的是你自己的 LLM，不计入每小时限额……」；删掉以后变回计入，本地那一项没了。
4. 去对话页发一个回合：Network 里这个请求的请求体带 `own_llm`，回复正常；后台看板「用自带密钥的回合」加一。删掉本地 LLM 再发：请求体只有 `text`，用部署者的。
5. 开两个标签页，在一个里改了 LLM，另一个不刷新直接发回合：请求体里是新的那组。

### 人工验证通过（2026-10-10）

用户用构建版前端加本地后端按清单验证，没有问题。
