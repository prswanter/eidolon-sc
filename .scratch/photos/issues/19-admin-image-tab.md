# 19: 后台「生图」标签页

**What to build:** 部署者不用改 `.env`，在后台新开的「生图」标签页就能配好生图：选接口形式（NovelAI 官方格式或 OpenAI 图像格式），填地址、key、模型、同时生成几张和画风。保存时真生成一张来检查，填错了或者中转会换尺寸，都当场拦下。画风对整个部署的照片生效。规格见 `../spec.md`「生成：生图客户端」的两种接口形式和网络、「后台配置」一节，以及 `11-art-style-prototype.md` 的 Answer。

**Blocked by:** 16

**Status:** done

- [x] **OpenAI 图像格式**：
  - 地址填到 `/v1`，服务器拼 `/images/generations`，带 `response_format: "b64_json"` 和顶层的 `size`、`negative_prompt`。
  - 收 `b64_json`（带不带 `data:` 前缀都行）；回 `url` 就用同一个客户端立刻下载，耗时算进 90 秒。chat 形状的返回不认。
  - 切换接口形式时不自动改地址。
- [x] **环境变量**：认 `NOVELAI_API_FORMAT`（`novelai` 或 `openai`，默认 `novelai`）、`NOVELAI_CONCURRENCY`（默认 1）、`NOVELAI_STYLE`（默认空）。
- [x] **后台**：「生图」标签页放在「语音」后面，只有一张生图卡：接口形式、接口地址、key、模型、同时生成几张、画风。
  - 模型是下拉加手填：下拉里放 V5 Curated/Full、V4.5 Curated/Full、V4 Curated/Full，默认 `nai-diffusion-5-curated`。
- [x] **保存时的检查**：只在这张卡改了时，用固定的提示词带上画风，按正式的尺寸真生成一张，验 key、接口形式、返回能不能解开、宽高对不对。这张图不计用量、不进运行记录。失败时提示「试调失败，没有保存：…」。
- [x] **画风**：原样插在作品 tag 后面、外貌 tag 前面，不清洗，可以带数值加权和多位画师；空着就整段不出现。
- [x] **并发**：「同时生成几张」替换 16 里写死的 1。
- [x] **代理**：`ProxiedService` 加 `image`，勾上就全走代理，接入点不受限制。`EIDOLON_PROXY_SERVICES` 认 `image`，代理卡加上这一项。
- [x] 新加一项服务时照现有的那份清单都要动：设置、后台配置项、前端的后台配置。
- [x] **测试**：
  - 两种接口形式的请求体（OpenAI 形式的顶层参数）和返回（`b64_json`、带 `data:` 前缀的、`url`）。
  - 保存检查：成功、key 错、尺寸不对时不保存。
  - 画风出现在提示词的位置；后台覆盖 `.env`；并发上限生效；代理开关。
  - 先例是 `test_live_config_services.py`、`test_proxy.py`；前端是 `adminConfig.test.ts`。
- [x] **验收**：本地构建版上用 Playwright 看生图标签页，保存检查走假服务。用户的中转真生成一张，放在验收清单里交给用户点（花用户的额度）。
- [x] `uv run pytest`、`uv run pyright`、`npm test`、`npm run typecheck` 全部通过。

## Comments

**14 留下的（2026-10-17）。** `.env` 现在只认 `NOVELAI_API_KEY`、`NOVELAI_BASE_URL`、`NOVELAI_MODEL`（`config.ImageSettings`，`.env.example` 也写了）。部署者的生图客户端在 `assembly.build` 里直接用 `httpx.AsyncClient` 建（测试从 `image_transport` 注入假服务），没走 `ProxyRoutes`，`ProxiedService` 也还没有 `image`。`Photos` 拿生图客户端用的是一个函数（`lambda: generator`），换成跟着后台配置走的就行。后台阈值卡已经有「要照片」一项。

**票 15 留下的（2026-10-17）。** `ImageGenerator.generate(prompt, until)` 现在要一个截止时间（事件循环的 `loop.time()`），里面会 `bill("images", …)`。保存检查别包 `activity.timed`，也别开 `Billing`，就不会进运行记录、不计用量；截止时间给 `loop.time() + TIME_LIMIT` 就行。运行记录里部署者生图的服务商和模型来自 `activity.image_origin(generator.settings)`（地址的 host 加模型名），后台换了地址或模型，看板上就是新的一行；OpenAI 图像格式下载 `url` 也要算在同一次调用、同一个截止时间里。单价表只预设了 `("image.novelai.net", "nai-diffusion-5-curated", "images")`，中转由管理者在单价页按「张」自己填。

**票 16 留下的（2026-10-17）。** 部署者「同时生成几张」现在是 `photos.DEPLOYERS_AT_A_TIME = 1`，在 `Photos._generate` 里传给 `_turn_on(key, 同时几张, 截止时间)`。队列按 key 建，建的时候定下 `Semaphore` 的大小，这个 key 的队列空了才删；后台改了并发数，要等这个 key 手上的照片都完了才生效（或者换 key）。改成配置时记得这一点，要么接受，要么在数变了时换一个队列。

**票 17 留下的（2026-10-17）。** 负面词、黑名单和本地 tag 表写死在 `backend/src/eidolon/photo_prompt.py` 和 `photo_tags.json`，后台生图标签页不要出这几项（票 17 的清单里「部署者和用户都改不了」一条靠这个守）。tag 表是照 V5 Curated（`nai-diffusion-5-curated`）的建议接口生成的，部署者换了模型照样用这一份。清洗和黑名单在 `read_tag` 里做完，OpenAI 图像格式发的正面、负面提示词和官方格式是同一份，不用另做。保存检查直接调 `ImageGenerator.generate`，不经 `read_tag`、不包 `activity.timed`，所以不会记剥掉的 tag。

**票 18 留下的（2026-10-17）。** 限额那一项加了「每小时照片数」：`config.UsageLimits.photos_per_hour`（`EIDOLON_PHOTOS_PER_HOUR`，默认 5，排在 `UsageLimits` 字段最后，`live_config.usage_limits` 按位置传了第 5 个）、`live_config.LIMIT_LABELS` 和 `_Limits.env` 里各加一行、`admin_config_api.LimitsInput` 加 `photos_per_hour`，前端 `adminConfig.LIMIT_FIELDS` 和中文文案 `fields.photos_per_hour`。都是在 `calls_per_hour` 后面插一行，合并时如果这几处冲突，两边的都留下就行。`.env.example` 在限流那一段加了 `EIDOLON_PHOTOS_PER_HOUR`，没动生图那一段。`Photos(store, generator, activity, usage)` 多了第四个参数，`assembly.build` 里 `UsageLimiter` 挪到了 `Photos` 前面建；换成跟着后台配置走的生成器时别把它挪回去。

**票 19 做完时（2026-10-17）。** 两处照票里的口径做了取舍：
- 保存检查只在这张卡的值真变了时生成；原样再存一遍不生成。启动时也不重试这张卡（每次重试都是一张花钱的图），覆盖的 key 解不开时照旧回退到 `.env`。
- 「同时生成几张」后台和 `NOVELAI_CONCURRENCY` 都限 1 到 10（`config.MAX_IMAGE_CONCURRENCY`）。数改了以后，新照片按 `(key, 数)` 另开一个队列，手上还没完的照完；改小的那一会儿可能比新数多几张同时在跑。
- 模型的「下拉加手填」做成 Select 加最后一项「其他（手填）」，选了它下面出一个输入框，没用 Combobox。
- 验收（Playwright）和完整的 `uv run pytest`、`npm test` 留给主会话合并后跑；这张只跑了单个测试文件和两边的类型检查。

**第四波合并后（2026-10-18）。** 本地构建版验收走假服务通过：保存检查成功 / 尺寸不对 / key 错都对，原样再存不生成，OpenAI 格式路径是 `/v1/images/generations`，画风在作品 tag 后、外貌 tag 前。用户的中转真生成一张还没点，在人工验证清单里。自审改了 OpenAI 格式的计费口径（拿到图才记）和模型手填框半路跳走。

**用户定了（2026-10-18）。** 生图并发上限 10 保留。

**人工验收（2026-10-18）。** 用户在本地构建版上用 `.env.novelai` 的中转实际生图，没问题。
