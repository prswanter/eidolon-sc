# 03: 自带语音识别密钥时自己选 Soniox 或阿里云百炼

**What to build:** 用户在设置页填语音识别 key 时，先选 Soniox 或阿里云百炼，与部署者的选择无关。百炼的 key 在保存时试调，判断地域、确认模型已开通；通话时用用户选的那家。背景见 `../spec.md` 和 ADR-0010。

**Blocked by:** 02。改 `backend/` 和 `frontend/`。

**Status:** resolved

## 要做的

- **存储**：`own_keys` 表加服务商、地域两列（迁移照现有方式在构造时跑）。旧记录服务商为空，读出来一律视为 `soniox`。`OwnKeyRecord`、`describe` 跟着加。
- **保存**：`save_speech` 对 `stt` 多收一个服务商。百炼的试调用 ticket 02 的 `run-task`/`finish-task`，模型用部署者的 `BAILIAN_STT_MODEL`（部署选 Soniox 时用默认模型），判断出的地域随 key 存下。Soniox 的试调不变。
  - 模型没开通：`OwnKeyRejected("去阿里云百炼控制台开通 <模型名>")` 之类，说清楚去哪里做什么。
  - 两个地域都拒绝：说 key 无效。
- **通话**：`for_call` 给出的语音识别不只是 key，还要带上服务商（和百炼的地域），`Calls` 按它造对应的 STT 服务，补充的等待时间也跟着这家走。部署者那边的服务商来自 `STT_PROVIDER`。
- **限额豁免**不变：`llm`、`tts`、`stt` 三项都自带才豁免通话，不论 `stt` 是哪家。
- **失败提示**：`SERVICE_LABELS` 不再写死 Soniox；用户的语音识别 key 失败时，提示里写它所属那家的名字（「你的语音识别（阿里云百炼）密钥调用失败」）。前端 `callEnd` 照样原样显示后端给的文字。
- **前端设置页**：语音识别那一项标题改为「语音识别」，填写时先选 Soniox / 阿里云百炼，再填 key；已填的显示服务商和末 4 位。改服务商等于换 key：要重新填 key 并试调。
  - 写 UI 前按 `AGENTS.md` 的 Astryx 流程查组件（选服务商用现成的选择类组件，不手搓）。

## 验收

- [x] **按 TDD**：先写测试看到红，再写实现。
- [x] 旧的、没有服务商的语音识别记录读出来是 Soniox，通话照常。
- [x] 部署选 Soniox、用户自带百炼 key：这位用户的通话用百炼，其他用户仍用 Soniox；反过来也一样。
- [x] 百炼 key 试调：有效时存下地域；模型没开通、两地域都拒绝时各给出对应的提示，不保存。
- [x] 用户的百炼 key 在通话中失败，提示里是「阿里云百炼」；Soniox 的是「Soniox」。
- [x] 三项都自带（`stt` 为百炼）时通话不计入限额。
- [x] `backend/` 下 `pytest` 全部通过，`pyright` 0 errors；`frontend/` 下测试和类型检查通过。
- [x] **人工验收（留给用户）**：本地起后端和构建版前端：
  - 设置页选阿里云百炼、填你的 key，保存成功；显示服务商和末 4 位；
  - 用这个 key 打一通电话，识别正常；
  - 填一个错的 key，保存失败并说明原因；
  - 删掉 key 后通话回到部署者的服务。

## Comments

### 2026-10-02：实现说明

自动化的验收项都做完了：后端全量 `pytest` 907 passed，`pyright` 0 errors；前端 `vitest` 404 passed，`tsc` 没有报错，`next build` 通过。人工验收留给用户。

**后端**

- `own_keys` 表加 `provider`、`region` 两列。新库直接在建表语句里带上；旧库在 `Store._migrate` 里 `ALTER TABLE` 补上。服务商为空的旧记录一律读成 `soniox`（`own_keys._stt_provider`）。`describe` 给语音识别的 key 加上 `provider`。
- `Speech`/`KeyCheck` 的 `check(service, api_key)` 拆成两个方法：
  - `check_stt(provider, api_key) -> SttKey`：返回通话要用的 key，百炼的带上判断出的地域；
  - `check_tts(api_key)`。
- `SpeechServices.check_stt`：
  - 百炼直接用 ticket 02 的 `find_region`，`BailianCheckFailed` 转成 `OwnKeyRejected`；
  - Soniox 照旧请求它的模型列表。
- 百炼 key 试调用的模型：部署选百炼时用 `BAILIAN_STT_MODEL`，选 Soniox 时用默认模型（在 `assembly` 里决定）。
- 两个地域都拒绝时，提示改为「key 无效，北京、新加坡地域都不接受（HTTP 401）」。这句是部署者启动试调和用户保存试调共用的，所以启动报错的文字也一起变了。模型没开通的提示沿用 02 的「去阿里云百炼控制台开通 <模型名>」。
- `OwnKeys.save_speech` 多一个参数 `stt_provider`（默认 `soniox`）；`for_call` 按记录造 `SttKey(provider, key, region)`。
- API：`PUT /api/account/keys/stt` 的 body 多一个 `provider`（`soniox`|`bailian`，默认 `soniox`，其他值返回 422）。
- 失败提示：
  - `SERVICE_LABELS["stt"]` 改成「语音识别」，另加 `STT_PROVIDER_NAMES`；
  - `OwnKeyFailed` 多收一个 `stt_provider`，提示变成「你的语音识别（阿里云百炼）密钥调用失败」；
  - 通话里失败时，`_LiveCall` 把这通电话用的服务商交给 `CallOutcome.service_failed`；
  - 密钥无法解密时用记录里存的服务商。
- 限额豁免的逻辑没动，测试补了一条 `stt` 为百炼的情况。

**前端**

- 设置页语音识别那一项的标题改为「语音识别」。
- 填写时先用 Astryx 的 `RadioList`（横排）选 Soniox / 阿里云百炼，再填 key。每次点开表单，默认选中的都是已存 key 的服务商，没填过时选 Soniox。
- 已填的 key 显示两行：服务商、末 4 位。
- 改服务商就得重新填 key：表单本来每次都要填 key 并试调。
- `api.ts` 加了 `SttProvider` 和 `OwnSttKey`，`saveOwnSpeechKey` 多一个 `provider` 参数。

**测试**

- `test_own_keys.py`：
  - 两个方向（部署百炼、用户 Soniox，以及反过来），本人用自己选的，其他用户用部署者的；
  - 百炼 key 试调后存下地域；试调失败不保存；
  - 旧表结构（没有那两列）迁移后读成 Soniox；
  - 解密失败的提示里有服务商名；
  - 三项都自带、`stt` 为百炼时豁免。
- `test_stt_provider.py`：用 `FakeDashScope` 测 `SpeechServices.check_stt`，覆盖拿到的地域、试调用的模型、key 无效、模型没开通。
- `test_own_speech_keys.py`（走 API）：
  - 选百炼保存，返回里带上服务商；
  - 非法服务商返回 422；
  - 通话用用户的百炼 key，失败时提示「阿里云百炼」。
- `api.test.ts`：`saveOwnSpeechKey` 把 `provider` 带进请求。这条是写完实现后才补的。

**code review 之后改的**

- 部署选 Soniox 时，用户的百炼 key 用默认模型，不再读 `BAILIAN_STT_MODEL`（ticket 原文就这么写）；
- 补了上面那条前端测试；
- 两处 docstring 重新折行。

**没改的判断题**

- `save_speech` 没拆成 `save_stt`/`save_tts`；
- 服务商名在后端 `STT_PROVIDER_NAMES` 和前端 `zh.ts` 各有一份。前端只显示后端给的文字，设置页的选项名由前端自己定，所以分开放。

隐私说明里写死的「Soniox」（`zh.ts`「语音服务」那条）留给 ticket 04。

### 2026-10-02：人工验收

用户起本地后端（`STT_PROVIDER=bailian`）和构建版前端，按上面四项验收通过：选阿里云百炼填 key 保存成功并显示服务商和末 4 位，用这个 key 通话识别正常，错的 key 保存失败并说明原因，删掉 key 后通话回到部署者的服务。本地数据库启动时自动补上了 `own_keys` 的 `provider`、`region` 两列。ticket 标为 resolved。
