# 18: 照片次数

**What to build:** 每人每小时默认最多 5 张照片。用完时她用自己的话推掉，她那条回复后面出一颗胶囊，写着「这一小时的照片用完了，HH:MM 以后可以再要」。部署者能改全站的默认值，管理者能给单个用户另设。失败的照片会把次数还回去。规格见 `../spec.md`「限额」一节，以及「一张照片的生命周期」的扣次数一条。

**Blocked by:** 16

**Status:** done

- [x] **计数**：用量表新加一种 `photo`，按人、按滑动一小时计数，文字回合和通话共用。
- [x] **配置**：全站默认是环境变量 `EIDOLON_PHOTOS_PER_HOUR`，默认 5，0 表示不限。后台「限额与玩法」页现有的限额卡加这一项。
- [x] **单个用户**：`user_limits` 加一列 `photos_per_hour`，管理者给单个用户设限额的弹窗加上这一项。空值跟全站，-1 不限，0 只能用自带。
  - 限额为 0 的用户（没有自带生图时）照片资格就是「不能发」：判断模型不问，她不知道自己能发。
- [x] **回合开始时只查不扣**。用完了就用「次数用完」那种照片说明（「他在要照片，但你这会儿发不了」），她写了标签也丢掉。
- [x] **提示用户**：判断说「是」时，SSE 推 `photos-used-up`（带 `retry_at`）。
- [x] **生成时才扣一张**。这时恰好被别处用完，就记成 `used_up` 失败，不生成。
- [x] **退还**：失败的照片把次数还回去；因为回复不在了被丢掉的不退。
- [x] **胶囊**：
  - 收到 `photos-used-up` 时，在她推掉的那条回复后面插一行居中的胶囊，样子和变化胶囊一样。内容是 muted 的 `CameraOff` 加「这一小时的照片用完了，HH:MM 以后可以再要」。
  - 这行胶囊也把前后分成两组。不存进库，刷新后就没了。
  - 图标别名加 `CameraOff`。
- [x] 界面上不显示剩余几张。
- [x] **`DESIGN.md`**：补上次数用完的胶囊。
- [x] **测试**：
  - 每小时 5 张；回合开始只查不扣、生成时才扣；失败退还。
  - 扣次数时恰好用完记成 `used_up`；`photos-used-up` 带 `retry_at`。
  - 单个用户的三种取值；环境变量和后台覆盖。
  - 先例是 `test_rate_limit.py`、`test_usage.py`、`test_user_limits.py`、`test_live_config_limits.py`。
  - 前端：胶囊怎么插、怎么分组。
- [x] **验收**：本地构建版上用 Playwright，把限额调成 1，要两次照片看到胶囊。
- [x] `uv run pytest`、`uv run pyright`、`npm test`、`npm run typecheck` 全部通过。

## Comments

**票 16 留下的（2026-10-17）。** 失败原因的类型是 `store.PhotoFailure`，`used_up` 已经在里面，前端的说明文案（「这一小时的照片用完了」）也有了，只要把原因推进照片表。扣次数要放在 `photos.Photos._generate` 里真正排队、发请求之前（排队超时的没发出去，按规格要退还）。启动时 `Store.give_up_photos("timeout")` 把重启前还在生成的照片记成超时，这些照片的次数要不要退、怎么退（那时已经不知道是谁的哪一次），这张要定。

**票 18 的决定（2026-10-17）。**

- **重启时记成超时的照片不退次数。** 启动时 `Store.give_up_photos("timeout")` 改掉的那些行，用量表里那一次照样算着，到一小时自然过期。理由：那时请求多半已经发出去、钱已经花了（规格的退还说的是「没花钱的失败」）；重启很少见，最多让这位用户这一小时少一张；要退就得在照片表里记下用量的行号、把两张表连起来，为一个罕见情况加一条耦合不值得。服务关闭时被取消的生成（`Photos.aclose`）同理不退。
- **「次数用完」比「冷淡一档」优先。** 两样都满足时用「次数用完」的照片说明，照样推 `photos-used-up`：次数是确定的事实，告诉用户几点以后可以再要不会错。
- **失败就退，不看回复还在不在。** 没拿到图（`timeout`、`service_error`、`bad_image`，以后的 `own_key_failed`）一律退；拿到了图、因为回复不在了被丢掉的不退；`used_up` 本来就没扣。
- **`photos-used-up` 紧挨在 `done` 前面推**（回复已经写进记录以后），这回合失败了就不推，前端也就不会出一颗挂不上的胶囊。前端先记在这回合的回复上（`Entry.photosUsedUp`），`done` 换成记录里的那条时带过去；`loaded` 不带，所以刷新后就没了。
- 单个用户限额：后端 `PUT /api/admin/users/{id}/limits` 加 `photos_per_hour`，「至少设一项」把照片也算进去。用户列表里那行单独限额只在单独设了照片时才接上「· 照片 …」，不设时和原来一样。
- 照片按「张」说：弹窗里「跟随全站（5 张）」「张 / 小时」，列表里「每小时 2 张」。后台限额卡里叫「每小时照片数」。

**做完了（2026-10-17）。** 跑过 `uv run pyright`（0 错）、`uv run ruff check`，单个测试文件 `test_photo_limits.py`（新）、`test_rate_limit.py`、`test_usage.py`、`test_user_limits.py`、`test_live_config_limits.py`、`test_exempting_keys.py`、`test_own_llm_no_longer_required.py`、`test_photos.py`、`test_photo_failures.py`、`test_photo_records.py`、`test_admission.py`、`test_database.py`、`test_admin_users.py`、`test_live_config.py`、`test_activity_records.py`、`test_user_recent_usage.py`；前端 `npm run typecheck`、`check-discipline.sh`，单个文件 `conversationLog`、`messageLines`、`photoFailure`、`adminUsers`、`adminConfig`、`liveConversation`、`api` 的测试。后端完整 `pytest`、前端 `npm test` 和 Playwright 验收留给合并后的主会话。

- 没勾的两项：**验收**（Playwright）和**全部通过**（完整测试），都留给主会话。
- 验收的做法：后台「限额与玩法」把「每小时照片数」改成 1（或者给测试用户单独设 1 张），判断模型答「是」、生图走假服务，要一次照片（出照片），再要一次：她推掉，那条回复下面出居中的胶囊「这一小时的照片用完了，HH:MM 以后可以再要」，HH:MM 是第一张开始生成的时刻加一小时（按制作人的时区）；刷新后胶囊消失。也可以把用户单独设成「只能用自带密钥」看她完全不提照片。

**第四波合并后（2026-10-18）。** 本地构建版验收通过：单个用户设 1 张，第一次出照片，第二次她推掉、回复下面出「这一小时的照片用完了，02:18 以后可以再要」，刷新后消失。全量测试通过。自审补了扣次数出错时照片不再停在「生成中」。
