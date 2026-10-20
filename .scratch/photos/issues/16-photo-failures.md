# 16: 照片没发出来

**What to build:** 生图服务慢了、出错了、给回来的图不对时，她的话照常记下，照片的位置换成一块「照片没发出来」的说明，并写明原因，刷新后也还在。她之后知道那张没发出去，用户问「照片呢」时她能接上。多人同时要照片时按 token 排队，排不上的也按超时失败。规格见 `../spec.md`「生成：生图客户端」的排队和总时限、「一张照片的生命周期」、「前端」的失败一条。

**Blocked by:** 14

**Status:** done

- [x] **失败原因**：照片表记下失败原因。这张做 `timeout`（包括排队超时）、`service_error`、`bad_image` 三种；`own_key_failed` 在 20 做，`used_up` 在 18 做。
  - 响应解不开、不是正好一张图、宽高不是 832×1216，都算 `bad_image`。
- [x] **总时限**：从标签写完算起 90 秒，包括排队、生成和下载，写死。超时后晚到的结果丢掉。不自动重试，不给重试按钮。
- [x] **排队**：按 token 排队，每个 token 有「同时生成几张」的上限，等不到的先进先出，不限队列长度。部署者的上限这张先固定为 1（19 把它做成配置）。排队超时的请求根本没发出去，不记调用。
- [x] **回复不在了**：回复没写进记录（这回合失败了），或者生成完时对话、账号已经被删，就直接丢掉，不存。她结束对话、用户开了新对话、页面关了，都照样存下、挂上去。
- [x] **重启**：启动时，照片表里还是「生成中」的行一律改成 `timeout`。
- [x] **她知道**：历史里没发出去的那张标签加上 `status="failed"`，系统说明里加一句「标了失败的照片对方没收到」。
- [x] **前端**：同宽的一块矮说明，`bg-foreground/5`，左边 muted 的 `ImageOff`，右边「照片没发出来」，下一行用 Meta 字号写原因：「等太久了」「生图服务出错了」「生成的图不对」。还要支持 `own_key_failed`、`used_up` 的文案（「你的生图密钥没能用」加「去设置自带密钥」、「这一小时的照片用完了」），这样 18、20 只管推原因。图标别名加 `ImageOff`。
- [x] **`DESIGN.md`**：补上失败说明。
- [x] **测试**：
  - 假生图服务造出慢、HTTP 报错、尺寸不对、解不开四种情况，看记录里的失败行和原因，刷新后还在。
  - 排队：第二张等第一张，排超 90 秒按超时、请求没发出去。
  - 对话删了以后生成完的不存；重启时「生成中」改成超时。
  - 之后回合的历史里带 `status="failed"`。
  - 前端：失败原因对应的文案。
- [x] **验收**：本地构建版上用 Playwright，生图走假服务，看各种失败说明。
- [x] `uv run pytest`、`uv run pyright`、`npm test`、`npm run typecheck` 全部通过。

## Comments

**14 留下的（2026-10-17）。**

- 后端已经在记失败原因：`photos.Photos._generate` 把 `ImageFailed`（`timeout` / `service_error` / `bad_image`，在 `image_generation.py` 里分类）、`asyncio.timeout(PHOTO_TIMEOUT)` 超时和意外异常都记成 `failed` 加原因。90 秒总时限已经包住排队（部署者一侧是一个 `asyncio.Semaphore(1)`），排队超时的请求不会发出去。这些路径都还没有测试。
- 没做：启动时把「生成中」改成 `timeout`；历史里带 `status="failed"`（`engine._prompt` 里 `format_reply(message.segments, tag)`，`Message.photo.status` 现成）；系统说明那一句。
- 回复没写进记录时丢掉已经做了（`engine.turn` 的 `finally` 调 `Photos.dropped`，对话被删时 `Store.finish_photo` 更新不到行就不存），也还没有测试。
- 前端：`PhotoBlock.tsx` 对 `failed` 现在返回 null，失败说明加在那里；失败原因的文案进 `copy.conversation.photo`。图标别名还没有 `ImageOff`。
- **中转变慢了**：2026-10-17 晚上用中转出 5 张，单张 35–75 秒（夏葉那张 74.5 秒），票 03 测的是 5–9 秒。90 秒总时限包括排队，部署者一次一张时，排在第二张就很容易超时。定排队和超时前先再量一次。

**做完了（2026-10-17）。** 跑过 `uv run pyright`、`npm run typecheck` 和单个测试文件（`test_photo_failures.py`、`test_photos.py`、`test_photo_records.py`，前端 `photoFailure.test.ts`）；完整测试和 Playwright 验收留给合并后的主会话。

- 后端的失败原因定成 `store.PhotoFailure`（五种都在，`own_key_failed`、`used_up` 等 18、20 来推），照片表、`Photo.reason` 和 `Photos` 里都用它。
- 排队按 key 排：`Photos._turn_on(key, 同时几张, 截止时间)`，`asyncio.Semaphore` 先来先等，队列没人用了就删掉。部署者的上限是 `photos.DEPLOYERS_AT_A_TIME = 1`。测试里不真等 90 秒：照仓库 monkeypatch 常量的做法改 `eidolon.photos.TIME_LIMIT`（`Photos.begin` 每次读它算截止时间）。
- 重启：`Photos` 建起来时（只有服务启动时 `assembly.build` 建它）调 `Store.give_up_photos("timeout")`；不放在 `Store` 的构造里，因为后台命令行也会开 `Store`，服务还在跑时不能把正在生成的照片改掉。
- 「她知道」：历史里没发出去的写成 `<photo status="failed">…</photo>`；只要这回合的历史里有一张，每回合会变的那条系统消息里就加 `photos.NOT_RECEIVED`（「上文里标了 status="failed" 的照片没有发出去，制作人没收到。」），不放进能缓存的前缀，也不跟着照片说明走（用户问「照片呢」时判断模型多半说不是在要照片，照片说明不会出现）。
- 前端：失败原因到文案在 `lib/photoFailure.ts` 的 `photoFailureNote`，不认识的原因按「生图服务出错了」说。说明照原型 A 的写法，链接用 `ShellLink`。

**超时的风险留给用户（2026-10-17）。** 14 用中转出图时单张 35–75 秒，90 秒的总时限包括排队：部署者一次一张时，排在第二张的很容易按超时失败（钱没花，请求没发出去）。规格写死 90 秒，这里照做、没有去量；上线前建议用户再量一次中转的速度，必要时改 `image_generation.TIME_LIMIT`，或者在 19 里把「同时生成几张」调高。

**做完了（2026-10-17）。** 后端 `uv run pytest` 1686 个、`uv run pyright`、`uv run ruff check`，前端 `npm test` 942 个、`npm run typecheck`、`check-discipline.sh` 全部通过（和 15、16、22、23 一起，合在 `feat/photos` 上跑的）。本地构建版上用 Playwright 验收（真的判断模型和对话模型，生图走假服务）：HTTP 500「生图服务出错了」、尺寸不对和解不开「生成的图不对」、一直不回 90 秒后「等太久了」，失败说明在对话页上都对，刷新后还在。自审后补了一处：排队轮到时已经过了 90 秒的，不再带着过期的时限把请求发出去（以前会记一条超时调用），按排队超时处理。`Message` 加了 `photo_sent`、`photo_failed`，历史里的 `status="failed"` 和列表的相机都用它。
