# 15: 生图的运行记录和花费

**What to build:** 管理者在看板上看得到生图：每次生成都是一条「生图」调用，挂在那个回合下面，带张数和错误原因，并按单价估出花费。官方 V5 Curated 有预设单价，中转的单价由管理者自己填。规格见 `../spec.md`「一张照片的生命周期」的计费一条和「单价」一节。

**Blocked by:** 14

**Status:** done

- [x] **服务名**：运行记录加 `image`，中文「生图」，后端的服务名和前端看板、文案都要改。
- [x] **调用**：每次真的发出去的生图请求都记一条调用，挂在那个回合的运行记录下面（同一个 `record_id`），回合已经结束也一样。
  - 只有确实拿到了图（包括尺寸不对的错误图）才记 1 张用量；HTTP 报错、超时都记 0 张。
  - 失败的带上错误原因。
- [x] **单位**：计量单位新加「张」（`images`），单价按每张填，不按每百万。单价表、后台设单价的接口和前端的单位文案都要加。
- [x] **预设单价**：官方 `nai-diffusion-5-curated` 每张 0.036 美元，查价日期 2026-10-17。中转没有预设，没填就和现有没设单价的服务一样显示。
- [x] 自带 key 的调用照现有规则只统计用量、不计价（自带生图在 20 接上以后自然生效）。
- [x] **测试**：生图调用挂在回合下、张数和错误、预设单价算出的花费、看板上的服务名和单位。先例是 `test_activity_records.py`、`test_cost_estimate.py`、`test_service_call_models.py`，前端是 `dashboard` 相关的测试。
- [x] `uv run pytest`、`uv run pyright`、`npm test`、`npm run typecheck` 全部通过。

## Comments

**14 留下的（2026-10-17）。** 生图客户端是 `backend/src/eidolon/image_generation.py` 的 `ImageGenerator.generate`，`photos.Photos._generate` 调它；现在还没有记任何运行记录。`Photos.begin` 是在回合里调的（`engine._begin_photo`），要挂到那个回合的 `record_id` 下面，得在 `begin` 时把回合的运行记录带进去（照 `activity.timed` 和 `recording.current()` 的做法），因为生成在回合结束以后才完。

**做完了（2026-10-17）。** 跑过 `uv run pyright`、`npm run typecheck` 和单个测试文件（`test_photo_records.py`、`test_photos.py`、`test_activity_records.py`、`test_cost_estimate.py`、`test_service_call_models.py`、`test_call_records.py`，前端 `dashboard.test.ts`、`adminPrices.test.ts`）；完整测试留给合并后的主会话。

- 张数：请求发出去前先记 0 张，生图服务回来的 ZIP 里正好有一个文件时记成 1 张（尺寸不对、解不开图都照样 1 张）；回来的不是 ZIP、或者 ZIP 里不是一个文件，记 0 张。
- 错误原因用运行记录现有的那套：HTTP 报错按状态码（`server_error`、`unauthorized`、`rate_limited`……），连不上是 `connection`，超时是 `timeout`，图不对是 `unreadable`（看板上叫「返回无法解析」）。没有另加一种。
- 超时：90 秒的总时限从标签写完算起，排队只在排队那一段受它限制；发出去以后由生图客户端自己按同一个截止时间收口，这样超时的调用记成 `timeout`，不会被当成中途放弃。
- `ActivityLog.record` 改了：回合记录已经写进库，就直接挂到它的 id 下；还没写（通话里的回合等通话一起写）就先挂在它身上。原来这两种都单独记一条。

**做完了（2026-10-17）。** 后端 `uv run pytest` 1686 个、`uv run pyright`、`uv run ruff check`，前端 `npm test` 942 个、`npm run typecheck`、`check-discipline.sh` 全部通过（和 15、16、22、23 一起，合在 `feat/photos` 上跑的）。本地构建版上接了一个假的 NovelAI 格式生图服务验收：两轮各造出 HTTP 500、尺寸不对、解不开、超时、正常五种，看板的生图一行是 10 次调用、8 次出错（服务报错 2、返回无法解析 4、超时 2），用量 4 张（正常和尺寸不对各算 1 张，解不开、报错、超时都是 0 张）。自审后改了一处：ZIP 里不是正好一个文件时，只要里面有文件就记 1 张（以前记 0 张），图照样按「生成的图不对」失败。
