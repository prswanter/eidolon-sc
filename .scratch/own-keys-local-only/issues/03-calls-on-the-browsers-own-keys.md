# 03: 通话用浏览器里存的三项 key

**What to build:** 语音合成和语音识别的自带密钥也改成先校验、再存进浏览器本地。用户打电话时，浏览器在通话预检里声明这次要自带哪几项（只带服务名、不带 key），在发起通话时带上实际的 key，通话就用用户自己的 LLM、语音识别和语音合成，没带的几项用部署者的。三项都带时不计入限额。设计见 spec 的「接口」「限额豁免」两节和「Further Notes」里关于百炼地域的说明。

**Blocked by:** 02

**Status:** done

- [x] 语音合成和语音识别各有一个只校验、不保存的接口，要登录才能调。试调规则跟原来的一样：Soniox 和 Fish 请求各自的只读接口，百炼两个地域都试一遍。百炼通过时返回判断出来的 `region`。不通过时返回 422 并带上原因。调用后数据库里不留任何记录。
- [x] 通话预检接受 `own` 查询参数，列出这次要自带的服务名。服务器据此做限额预检、返回 `callExempt`，不碰任何 key，也不再读数据库里的 key。
- [x] 发起通话的 `requestData` 接受可选的 `own_keys`，里面可以有 llm、tts、stt 三项（stt 带服务商和地域），`api_key` 用 `SecretStr`。准入、豁免和用谁的服务都以这里实际收到的为准，跟预检声明的不一致时以这里为准。重新协商和 ICE trickle 不带 key。
- [x] key 一直持有到挂断、最后一轮写记忆结束。通话中自带的 key 失败时，通话照旧结束，并说明是哪一项出了问题。
- [x] 本地存储模块支持三项，能组装预检用的服务名列表和发起通话用的 `own_keys`。
- [x] 设置页的语音合成和语音识别两节：先校验、通过后写进本地（百炼连同 `region` 一起存），照旧显示服务商和末 4 位；删除只删本地。
- [x] 设置页的豁免提示和通话结束页的「计入 / 不计入」全部改由前端根据本地存的 key 算，沿用现有的豁免判断函数和它的测试。
- [x] 测试：HTTP 层测「三项全带不计入、只带一部分照常计入、部署者没有的那项用户带了也能打、预检声明和实际带的不一致时以实际为准、百炼校验返回地域并在通话时用上」；前端测请求的组装。

## Comments

### 实现（2026-10-10）

- 后端：`POST /api/account/keys/tts/check`、`POST /api/account/keys/stt/check` 只试调不保存（`OwnKeys.check_tts`、`check_stt`），通过时 tts 返回 `{}`，stt 返回 `{"region": ...}`（Soniox 是 `null`），不通过 422「试调失败：…」。请求体的 `api_key` 都是 `Secret`，约束跟原来一样。
- `GET /api/ice-servers?own=llm,tts,stt`：只看服务名，`OwnKeys.call_exempt(services)` 借一下部署者的 key 判断能不能打（语音两项要么带、要么部署者有，否则 503）、算 `callExempt`，不碰任何 key；不认识的服务名 422。
- `/api/offer` 的 `requestData.own_keys`（`OwnKeysInput`：llm 同回合的 `OwnLLMInput`，tts `{api_key}`，stt `{api_key, provider, region}`，region 只对百炼有效）组装成 `BroughtKeys` 交给 `Admissions.call(user_id, character_id, brought)`；准入、豁免、用谁的服务都按它。重新协商（带 `pc_id`）照旧不看 `requestData`。
- 通话不再读库：`OwnKeys.kept()`、解密那一步、准入里「解不开就记一条没能接通」随之没人用，这次一起删了；回合和通话的 409 处理器（`OwnKeyFailed`）和前端 `callEnd.ts` 里 409 → `own_key` 的映射也删了。06 剩下的是删表、删列出/保存/删除接口、去掉 `EIDOLON_SECRET_KEY` 开关和 `available`、后台徽章、设置页说明。
- 前端：`localOwnKeys.ts` 加 `ownServices(keys)`；`startCall(..., userId)` 读一次本地 key，`getCallSetup(ownServices(keys))` 只带服务名，`offer` 的 `requestData` 带 `own_keys`。Pipecat 的 transport 每次重新协商都会把同一份 `requestData` 再发一遍（按引用保存），所以接通后把 `own_keys` 从这份对象里删掉，之后的重新协商不再带 key。
- 设置页语音两节：填写先 `checkOwnSpeechKey`，通过后存本地（百炼连同 `region`），显示服务商和前端算的末 4 位；删除只删本地。豁免提示改成 `limitExemption(ownServices(本地))`（`limitExemption` 的输入从 `{turns, calls}` 改成服务名列表）。通话结束页照旧用预检返回的 `callExempt`，它现在就是按本地存了哪几项算的。
- 测试：`test_own_speech_keys.py` 改写（只试不存、试调失败 422、未登录 401 和格式不对 422、百炼返回地域并在通话里用上、带了用用户的、没带的用部署者的、库里存的不再用于通话、部署者没有语音时带了也能打、预检服务名不认识 422、三项全带才不计入、预检声明和实际带的不一致时以实际为准、key 格式不对 422）；`test_own_llm.py` 通话带 LLM、库里存的 LLM 不再用于通话；`test_admission.py`、`test_own_keys.py` 的通话改成传 `BroughtKeys`，删掉「解不开」的用例，加预检豁免的用例。前端 `localOwnKeys.test.ts`（`ownServices`）、`ownKeys.test.ts`、`api.test.ts`（`checkOwnSpeechKey`、`getCallSetup` 只带服务名）。
- 代码评审后：按 CODING_STANDARDS.md「Tests」删掉重复的测试，包括通话不用库里的 LLM（语音那条已经覆盖同一条路径）、`test_own_keys.py` 里预检豁免的两条（`test_admission.py` 测同一条路径，还会看租约有没有放回）、「三项全带才不计入」（参数化的「以实际带的为准」两行已经覆盖），以及只测 pydantic 校验的 422 和未登录 401；不分支的参数行也删了。`for_call` 和 `call_exempt` 里重复的「语音两项要么带、要么部署者有」抽成 `_require_speech`。设置页语音表单改成由外层传 `onSubmit`（试调加存本地），表单本身不再知道 key 存到哪里。
- 评审里留着没改的：
  - 三个校验接口各自写 `except OwnKeyRejected → 422`。旧的保存接口还在用「试调失败，没有保存」，等 06 删掉它们再合并。
  - `Admissions.call_setup` 只转一下 `OwnKeys.call_exempt`。通话模块只认 `Admissions` 这一道门，所以留着。
  - `own` 用逗号分隔的字符串，按 spec 的 `own=llm,tts,stt` 写法。
  - 接通以后才把 `own_keys` 从 `requestData` 里删掉。如果在收到 `bot-ready` 之前就发生带 `pc_id` 的重新协商，那一次还会带上 key，不过服务器不看。初次连接失败时 `connect` 会直接失败，所以实际很难碰到。
  - 百炼的 `stt` 不带 `region` 时通话按北京连。正常流程里校验总会返回地域并一起存下，只有手改本地存储才会出现这种情况。

### 人工验证

用构建版前端（`next build` + `next start`）和本地后端：

1. 设置页「自带密钥」→ 语音合成填一把能用的 Fish Audio key，点「试调并保存」：通过后显示末 4 位；开发者工具 Application → Local Storage 里 `eidolon.ownKeys.<用户 ID>` 多了 `tts`；数据库 `own_keys` 表里没有新行。
2. 语音识别选「阿里云百炼」填一把 key：通过后本地存的 `stt` 里有 `provider: "bailian"` 和 `region`（北京或新加坡，按 key 所在地域）。再选 Soniox 填一把：`stt` 换成 Soniox，没有 `region`。
3. 故意填错一把：显示「试调失败：…」和服务商的原因，本地什么都没存。
4. 三项都填上：豁免提示是「三项都是你自己的密钥……都不计入」；删掉其中一项语音，变回「文字对话……不计入；语音通话要三项都自带才不计入」；删掉 LLM，变成都计入。
5. 三项都填上，去对话页打一通电话：Network 里 `ice-servers` 请求的地址带 `?own=llm,tts,stt`、没有 key；`offer` 的请求体 `requestData.own_keys` 里有三项；通话正常，角色说话、听得到你；挂断后结束页显示不计入。后台看板「其中 N 次全用自带密钥」加一。
6. 只留语音合成再打一通：`ice-servers` 带 `?own=tts`，通话用你的 Fish Audio、部署者的语音识别和 LLM，结束页显示计入。
7. 通话中切一次麦克风或等网络重连（如果能触发重新协商）：之后那次带 `pc_id` 的 `offer` 请求体里没有 `own_keys`。
8. 把本地存的 Fish key 改坏（在 Local Storage 里直接改 `tts.api_key`）再打：通话以「你的语音合成（Fish Audio）密钥调用失败」结束，没有改用部署者的。

### 人工验证通过（2026-10-10）

用户用构建版前端加本地后端按清单验证，没有问题。
