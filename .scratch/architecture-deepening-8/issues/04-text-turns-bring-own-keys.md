# 04: 文字回合也带 `own_keys`，旧页面被拒绝

**What to build:** 「带来的 key」在线上只有一种形状。文字回合的请求体从顶层的 `own_llm` 改成和通话一样的 `own_keys`（只带 LLM），后端的文字回合和通话共用同一处解析。部署那一刻还开着的旧页面再发 `own_llm`，后端回 422 并提示刷新，不会悄悄改用部署者的 key、还计入限额。

前端的自带密钥 module 同时收齐：自带密钥的类型、LLM 协议和语音识别服务商的取值列表都只有一份（设置页的选项从这里来），一次文字回合要带的 `own_keys` 由它拼好；请求函数的文件改为从它引用类型，两者不再互相引用。

对用户：填了 LLM key 照常聊天，用的是自己的 LLM、不计入限额；存了语音 key 也不随文字回合发出去。背景见 `../spec.md`（「线上：带来的 key 只有一种形状」「前端：自带密钥 module」）。

**Blocked by:** 01（前端的请求都走同一个请求函数）

**Status:** resolved

## 已定的设计（2026-10-11 grilling，详见 spec）

- 文字回合请求体：`{ text, own_keys?: { llm? } }`；`own_keys` 和通话 offer 里的是同一种结构（`OwnKeysInput`）。浏览器只带这次用得上的：文字回合只带 LLM，没存就不带 `own_keys`。
- 后端文字回合经 `OwnKeysInput.brought()` 得到 `BroughtKeys`，删掉另外拼 `BroughtKeys` 的那一处；即使收到语音 key 也不用。
- 请求体里有旧字段 `own_llm` 时回 422，原因「页面已经更新，请刷新后再发」，没有跑任何 LLM、不计入限额。注明是过渡代码、以后可以删。
- `sendTurn` 照旧收 userId、每次现读，读出来的由自带密钥 module 拼好。
- 前后端之间的枚举不做代码生成；前端那份注明跟后端同步。

## 验收

- [x] 后端 HTTP 测试（仿 `test_own_llm.py`、`test_rate_limit.py`）：带 `own_keys: {llm}` 的文字回合跑在自带的 LLM 上、不计入限额；不带的跑在部署者的上、计入。测试辅助函数 `send_turn` 改发新形状。
- [x] 后端 HTTP 测试：带旧字段 `own_llm` 的文字回合回 422，原因是要刷新；没有调用任何 LLM，没有计入限额。
- [x] 前端自带密钥 module 的测试（仿 `localOwnKeys.test.ts`）：文字回合只带 LLM；没存 LLM 时不带；存了语音 key 也不带。
- [x] 前端请求函数的测试（仿 `api.test.ts`）：`sendTurn` 的请求体是 `own_keys` 的新形状。
- [x] 前端里语音识别服务商、LLM 协议的取值各只写一份；请求函数的文件和自带密钥 module 不再互相引用。
- [x] 后端 `pytest`、`ruff`、`pyright`，前端 `vitest`、`tsc`、`sh scripts/check-discipline.sh` 通过。
- [x] 人工验收清单写进 Comments（例如：填自带 LLM 后发文字回合，看板记为用自带密钥的回合、限额不减；删掉后发，记为部署者的；用改动前的前端发一次，看到要刷新的提示）。

## Comments

- 后端：`TurnInput` 改收 `own_keys: OwnKeysInput`，文字回合经 `OwnKeysInput.brought()` 得到 `BroughtKeys`，删掉另外拼的那一处（语音 key 即使带来也用不上：`for_turn` 只看 LLM）。旧字段 `own_llm` 收成 `object`（不校验、不回显内容），有就在计入限额之前回 422「页面已经更新，请刷新后再发」，注释写明是过渡代码。`OwnKeysInput` 的 docstring 改为「回合或通话带来的」。
- 后端测试：`send_turn` 改发 `{"own_keys": {"llm": …}}`（参数名仍是 `own_llm`，传的就是那把 LLM）；`test_own_keys_in_logs.py` 里直接 POST 的那一处也改成新形状。`test_own_llm.py` 新增「带自带 LLM 的回合不计入、不带的计入」（限额 1：两次自带都通过，部署者的一次通过、再一次 429）和「旧页面带 `own_llm` 回 422、要刷新、没调 LLM、不计入、响应里没有 key」，先红后绿。
- 前端：`localOwnKeys.ts` 收齐 `OwnService`、`LLMProtocol`、`SttProvider`、`BailianRegion` 和各项 key 的类型，取值列表 `OWN_SERVICES`、`LLM_PROTOCOLS`、`STT_PROVIDERS` 只此一份，注明跟后端同步；新增 `turnOwnKeys(userId)`（只带 LLM，没存就是 `undefined`）。`api.ts` 删掉这些类型、改从自带密钥 module 引用，`sendTurn` 发 `own_keys: turnOwnKeys(userId)`；`localOwnKeys.ts` 不再引用 `api.ts`。设置页的选项、后台配置页的 LLM 协议和语音识别服务商选项（`adminConfig.ts` 原来各自另写一份）都改从这里来；`AdminConfig.tsx`、`ownKeys.ts` 只改了 import 路径。`turnOwnLLM` 删掉。
- 前端测试：`localOwnKeys.test.ts` 新增「文字回合只带 LLM、不带语音 key」「没存 LLM 时不带（存了语音 key 也一样）」；`api.test.ts` 的 `sendTurn` 断言请求体是 `{ text, own_keys: { llm } }`（存储里同时有 tts，也不带）。
- 合入集成分支（含票 05 的 `callOwnKeys`、`call.test.ts`）时自动合并、无冲突；`callOwnKeys` 用的 `OwnService` 已是本 module 自己的类型，`call.ts` 本来就只从 `localOwnKeys` 引用。
- 合并后：后端 `pytest` 1143 passed，`ruff`、`pyright` 0 报错；前端 `vitest` 634 passed，`tsc`、`check-discipline.sh` 通过。第一次跑完整 `pytest` 时在 `test_bailian_stt.py` 第一个用例报了一次 F 后卡住到超时（没拿到调用栈）；之后两次完整跑（加 `faulthandler_timeout`）和单跑该文件三次都通过，未能复现，和本票改动无关（可能是当时并行的另一组测试抢了资源）。
- 人工验收清单：
  - 设置页填好自带 LLM，发一条文字回合：照常回复；后台看板／运行记录里这条记为用自带密钥的回合，个人限额不减。
  - 删掉自带 LLM 再发：照常回复，记为部署者的，限额减一。
  - 只存语音 key（不存 LLM）时发文字回合：浏览器开发者工具网络面板里 `/turns` 请求体只有 `text`，没有 `own_keys`；存了 LLM 时请求体是 `{ text, own_keys: { llm } }`，不带 tts/stt。
  - 用改动前的前端（部署前打开、不刷新的页面）发一次：看到「页面已经更新，请刷新后再发」，没有回复、限额不减；刷新后正常。
  - 设置页 LLM 协议、语音识别服务商的选项和以前一样；后台配置页 LLM 协议、语音识别服务商的下拉选项也和以前一样。
