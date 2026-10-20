# 06: 豁免只问服务器

**What to build:** 「回合或通话用到的、可以自带的服务全都用了自带密钥的，不计入限额」只在后端写一份。设置页现在用前端自己的一份规则告诉用户「全都不计入 / 只有文字对话不计入 / 都计入」，改成问服务器：新增一个只问不取的豁免接口，设置页存的 key 有变化时按存了哪些服务问它，用返回的结论选说明。前端那份规则和它的测试删掉。

后端的豁免规则改为按用量种类（回合或通话）作答，不再返回按字符串取值的 dict；只做转发的 `Admissions.call_setup` 删掉，通话预检直接问 `OwnKeys`。

对用户：设置页的三句说明照旧，跟服务器实际怎么算永远一致；还没问到或问失败时这句先不显示。背景见 `../spec.md`（「后端：豁免规则一份，新增只问不取的豁免接口」）。

**Blocked by:** 04（文字回合也带 `own_keys`；它收齐了前端自带密钥 module 的类型）

**Status:** resolved

## 已定的设计（2026-10-11 grilling，详见 spec）

- `GET /api/account/keys/exemption?own=…`（服务名逗号分隔，可以为空），返回 `{ turns: bool, calls: bool }`。
  - 只按规则算：不碰部署者的 key，不看这位用户的个人限额（不限、只能用自带密钥都不管）；通话不可用时照样回答。
  - 要求已登录并同意条款，和其他 `/api/account` 接口一样；不认识的服务名回 422，和预检一致。
- `OwnKeys` 的豁免规则：给定用量种类和带来的服务，答算不算豁免。`for_turn`、`for_call`、通话预检、豁免接口都用它。
- 通话预检：先确认语音识别和合成都有 key（没有就是通话不可用），再按通话的规则答豁免；行为不变。
- 设置页：文案不变；加载中或失败时不显示这句说明。请求走 01 导出的请求函数。

## 验收

- [x] 后端 HTTP 测试：豁免接口对没有服务、只有 LLM、LLM 加一项语音、三项全有各答什么；部署者没配语音时照样回答；不认识的服务名 422；未登录 401、未同意 428。
- [x] `test_own_keys.py` 里豁免的表驱动用例改成按用量种类问。
- [x] 通话预检的已有测试不改就通过；代码里没有 `call_setup`。
- [x] 前端请求函数的测试：豁免查询发对的服务名、交回 `{turns, calls}`。
- [x] 前端没有 `limitExemption`，它的文件和测试已删。
- [x] 后端 `pytest`、`ruff`、`pyright`，前端 `vitest`、`tsc`、`sh scripts/check-discipline.sh` 通过。
- [x] 人工验收清单写进 Comments（例如：设置页依次只填 LLM、再填语音合成、再填语音识别、再删掉 LLM，每一步说明都对；断网时说明不显示、其余照常）。

## Comments

### 实现说明（2026-10-11）

- 后端：`OwnKeys.exempt(kind, services)` 是唯一一份豁免规则，`for_turn`、`for_call`、`call_exempt`（通话预检：先查语音两项有没有 key，再按通话的规则答）和新接口 `GET /api/account/keys/exemption` 都用它。`Admissions.call_setup` 删掉，`Calls` 直接收 `OwnKeys`。服务名的解析抽成 `own_keys.named_services`（不认识的服务名抛 `UnknownService`，`app.py` 的异常处理回 422），预检和豁免接口共用。
- 原来 `test_admission.py` 里直接测 `call_setup` 的两条用例搬到 `test_own_keys.py`，改为测 `OwnKeys.call_exempt`（「不占次数、不留记录」这一点随 `Admissions` 那层一起没了：`OwnKeys` 本来就碰不到次数和记录）。
- 「代码里没有 `call_setup`」：产品代码里没有了；`test_own_speech_keys.py` 里同名的测试辅助函数（发 `/api/ice-servers`）在代码审查后改名为 `ask_before_calling`。
- 前端：`getLimitExemption(own)`（`lib/api.ts`）走统一的请求函数；设置页按存了哪几项服务问它，只有答案对得上现在存的服务时才显示那句说明，还没问到或问失败都不显示；`perCallLimits` 那句照常显示。

### 人工验收清单

前提：本地起服务（前端 `next build` + `next start`），登录一个已同意条款的用户，打开设置页的自带密钥；开始前三项都没填。

1. 三项都没填：说明是「现在用的是部署者的服务，文字对话和语音通话都计入每小时限额。」，后面跟着「单次通话的时长和轮数上限对所有人都一样。」。
2. 只填 LLM 并通过试调：说明变成「文字对话用的是你自己的 LLM，不计入每小时限额；语音通话要三项都自带才不计入。」。
3. 再填语音合成（Fish Audio）：说明不变（仍是第 2 步那句）。
4. 再填语音识别：说明变成「三项都是你自己的密钥：文字对话和语音通话都不计入每小时限额。」。
5. 删掉 LLM（保留两项语音）：说明回到第 1 步那句「都计入」。
6. 开发者工具 Network 里看每次改动后的请求：是 `GET /api/account/keys/exemption?own=…`，`own` 只列服务名（如 `tts,stt`），请求里没有任何 key；三项都没填时没有 `own` 参数。
7. 断网验证：开发者工具 Network 设为 Offline（或把 `/api/account/keys/exemption` 加进 Block request URL）后刷新设置页并改一项 key（或先在线打开页面、再离线后删/填一项）：那句豁免说明不显示，「单次通话的时长和轮数上限……」那句和三张表单照常显示、可操作；恢复网络后再改一项，说明重新出现且正确。
8. 刷新设置页：说明短暂不显示，随即按已存的 key 显示正确的那句（不会先闪一句错的）。
9. 打一通三项都自带的电话、挂断：通话结束页照旧说这通不计入；只带部分自带 key 时照旧计入（预检 `callExempt` 行为不变）。
