# 20: 自带生图

**What to build:** 有自己 NovelAI token 或中转的用户，可以在设置页「自带密钥」里填上生图。key 只存在自己的浏览器里，保存前会真生成一张来检查。之后照片花用户自己的钱，不占每小时的次数；部署者没配生图时，用户也能收到照片。自带的 key 失败时，照片的位置写着「你的生图密钥没能用」，并有一个去设置页的链接，不会悄悄改用部署者的 key。规格见 `../spec.md`「自带生图」「能不能发照片」「生成：生图客户端」的网络一条、「限额」的免限额一条，以及 ADR-0017、ADR-0022。

**Blocked by:** 18, 19

**Status:** done

- [x] **设置页**：「自带密钥」加一项生图，填接口形式、接口地址、key、模型四项，默认值和后台一样，只存在浏览器里。不出「同时生成几张」和画风。这一项一直显示。
- [x] **保存前检查**：调 `POST /api/account/keys/image/check`，花用户自己的钱真生成一张，规则和后台的检查一样，不计用量、不进运行记录。部署没有判断模型时直接拒绝：「这个部署发不了照片」，不生成。
- [x] **随请求带上**：文字回合的请求体加上自带生图，通话本来就带全部。
- [x] **照片资格**：
  - 带了自带生图就用自带的。部署者没配也能发；限额为 0 的用户也能发。
  - 自带的 token 固定一次一张，各排各的。
  - 部署者的画风照样生效。
- [x] **失败**：自带 key 失败时记成 `own_key_failed`，不改用部署者的，错误里的 key 打码。
- [x] **免限额**：
  - 用自带生图生成的照片不计入次数（用量照写一行，标成不计入）。
  - 带了自带 LLM 但没带生图 key：回合照旧不计入，照片照样计入。
  - 「生图」不进免限额密钥：`Service` 加上 `image`，但免限额密钥仍然只有 LLM、语音合成、语音识别三项。
- [x] **网络和 SSRF**：
  - `ProxiedService` 加 `own_image`。只有 HTTPS 的 `image.novelai.net` 算已知服务商，勾上才走代理；其他地址一律直连。
  - 公开部署里自带的地址必须是 HTTPS 的公网地址，每次连接都查，下载 `url` 时也一样（复用现有的公网检查后端）。
  - `EIDOLON_PROXY_SERVICES` 认 `own_image`，代理卡加上这一项。
- [x] **测试**：
  - 检查接口的成功、失败，以及没有判断模型时拒绝。
  - 带了自带生图时用它、不计入次数；没配部署者生图也能发；限额为 0 也能发。
  - `own_key_failed` 时不改用部署者的、key 打码。
  - 免限额密钥里没有生图。
  - 内网地址被拒；只对官方地址走代理。
  - 先例是 `test_own_llm.py`、`test_own_speech_keys.py`、`test_exempting_keys.py`、`test_proxy.py`、`test_own_keys_in_logs.py`；前端是 `localOwnKeys.test.ts`、`api.test.ts`。
- [x] **验收**：本地构建版上用 Playwright：设置页填自带生图（检查走假服务）、要一张照片、自带 key 失败时的说明和链接。
- [x] `uv run pytest`、`uv run pyright`、`npm test`、`npm run typecheck` 全部通过。

## Comments

**票 15 留下的（2026-10-17）。** 生图调用记在运行记录的 `image` 下，`Origin` 现在只有部署者的 `activity.image_origin(settings)`（地址的 host 加模型名，`own_key=False`）。自带生图要另给一个 `own_key=True` 的 `Origin`，`prices.cost` 才会只统计、不计价；服务商和模型记成什么要定：照 ADR-0017 自带 LLM 一律记 `OWN`，自带生图的地址也可能是用户自己的中转，建议同样记 `OWN`（`activity._forget_own_llms` 只管 LLM，别漏）。张数靠 `ImageGenerator.generate` 里的 `bill("images", …)`，自带的客户端沿用它就自然有。

**票 16 留下的（2026-10-17）。** 自带的照样走 `Photos._turn_on(自带 key, 1, 截止时间)` 排队，和部署者的分开排。`store.PhotoFailure` 已经有 `own_key_failed`；前端 `PhotoBlock` 对它会写「你的生图密钥没能用」，下面多一行「去设置自带密钥」的站内链接（`lib/photoFailure.ts`），后端只要把原因记成 `own_key_failed` 就行。生图客户端现在把 HTTP 错误、连不上记成 `service_error`，自带 key 的失败要在 `Photos` 里按「用的是自带的」改记成 `own_key_failed`，错误里的 key 打码。

**票 17 留下的（2026-10-17）。** 照片的标签在 `Photos._generate` 里经 `read_tag` 清洗，剥掉的类别交给 `activity.timed(..., read.stripped)` 记在那次生图调用上（`service_calls.stripped_tags`）。自带生图沿用 `_generate` 就同样受黑名单约束、同样记下；看板按 `service == "image"` 给这一行加 `stripped_photos`、`stripped`，自带的那一行（`own_key=True`）也会有，前端服务名下面的小字（`lib/dashboard.ts` 的 `strippedText`）不用另做。

**票 18 留下的（2026-10-17）。** 次数现在只有部署者一侧：`Photos.eligibility(character, user_id)` 在回合开始时用 `UsageLimiter.check(user_id, "photo")` 只查不扣（限额为 0 时返回 None，这回合与照片无关；用完时返回带 `used_up_until` 的 `Eligibility`），`Photos._generate` 一开头 `UsageLimiter.take(user_id, "photo")` 扣一张、没拿到图就 `give_back()`。带了自带生图时要：`eligibility` 不查次数、直接返回 `Eligibility()`（限额为 0 也能发，部署者没配生图也能发）；`_generate` 改成 `take(user_id, "photo", exempt=True)`（照写一行、不计入），或者把「用谁的」传进 `begin`。`OverLimit` 在 `exempt=True` 时不会抛，`used_up` 那条路自然走不到。测试可以照 `tests/test_photo_limits.py` 的 `photos_an_hour(settings, 1)` 加 `used_up(events)`。

**票 19 留下的（2026-10-17）。**
- `ImageSettings` 现在是 `(api_key, base_url, model, api_format="novelai", concurrency=1, style="")`。自带的照「部署者的画风照样生效」拼成 `ImageSettings(自带四项, style=部署者的画风)`；画风取 `config.effective("image")["style"]`，部署者没配 key 时这一项也可能有值（`config.image_settings` 没 key 时是 None，别从它取）。自带的 `concurrency` 留默认 1，`Photos._turn_on` 按 `(key, 数)` 排队，自带的 key 自然各排各的。
- 保存检查能直接复用：`image_generation.try_image_service(ImageGenerator(settings, client))`，失败抛 `ImageFailed`，给人看的原因在 `e.detail`（里面有服务返回的前 300 字，自带的要打码 key）。它不开 `Billing`、不包 `activity.timed`，所以不计用量、不进运行记录。
- OpenAI 图像格式回 `url` 时，下载走生成用的同一个 `httpx.AsyncClient`（`ImageGenerator._client`）。自带的客户端要每次连接都做公网检查，下载那一下也就一起查了；不要另开客户端下载。
- 部署者的生图客户端是 `routes.client("image", GENERATION_TIMEOUT)`，测试从 `image_transport` 注入时换成 `httpx.AsyncClient(transport=image_transport)`（`assembly.build` 里），`LiveConfig(image_client=…)` 拿着它。自带的要另一条路线（`own_image`，只有 HTTPS 的 `image.novelai.net` 走代理），测试里大概也要从同一个 `image_transport` 进假服务。
- `Photos` 拿部署者的生图是 `config.image_generator`（每张照片取当时生效的）。
- 前端：`lib/localOwnKeys.ts` 已经有 `IMAGE_FORMATS`、`IMAGE_MODELS`（第一个是默认的 `nai-diffusion-5-curated`）。后台的模型字段是 `AdminConfig.tsx` 里的 `ModelChoiceField`（Select 加「其他（手填）」），设置页也要用的话按「两屏以上才抽」挪到 `components/app/`。文案 `copy.admin.config.imageFormats`、`imageModels`、`customModel` 可以共用或照抄。
- **免限额**：后端 `live_config.EXEMPTING_FIELDS` 和 `config.exempting_keys_from_env` 都是从 `SERVICES` 推出来的，前端 `EXEMPTING_FIELDS` 从 `OWN_SERVICES` 推。`Service` 加 `image` 时这三处都要改成只列 LLM、语音合成、语音识别，不然会多出 `exempting_image`。
- 代理：`PROXIED_SERVICES` 现在是 `…, "stt", "image", "own_llm", "own_tts", "own_stt"`，`own_image` 放在 `own_stt` 后面；后端 `ProxyInput`、`PROXY_LABELS`、前端 `PROXIED_SERVICES` 和 `itemFields.proxy` 各加一项。`test_proxy.py` 里 `before["unconfigured"]` 不会变（自带的不算）。

**第四波自审留下的（2026-10-18）。** `usage.UsageKind` 现在多了 `photo`，类型上能传进 `OwnKeys.exempt(kind, services)`，但那里 `kind == "turn"` 以外一律按通话的免限额密钥判断，照片传进去会算错。自带生图不计次数照票 18 的交接走 `UsageLimiter.take(user_id, "photo", exempt=True)`，别经 `OwnKeys.exempt`；生图也不进免限额密钥的选项。

**用户定了（2026-10-18）。** 自带生图失败除超时外都记 `own_key_failed`（包括尺寸不对），保留。

**人工验收（2026-10-18）。** 用户在本地构建版上试了自带生图（BYOK），没问题。
