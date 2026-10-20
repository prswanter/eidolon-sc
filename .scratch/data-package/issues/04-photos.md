# 04: 照片进数据包

**What to build:** 用户导出时勾了「对话」，还能勾挂在它下面的「照片」。数据包里多一个 `photos/` 文件夹，每张发出来了的照片是一个普通的 webp，解压就能看。导入后，对话里她发过的照片照常显示、点开能放大，没发出去的照样显示成没发出去的说明。不勾照片时她那条回复上就没有照片，数据包小得多。见 `../spec.md` 的「数据包的格式」里讲照片的那几条。

**Blocked by:** 03

**Status:** done

- [x] 导出：她的回复带照片时，`messages` 里那条带 `photo`（`id`、`tag`、`status`、`reason`、两个时间）；`ready` 的照片在 `photos/<id>.webp` 里原样放一份，一张一张从库里读，不一次读完
- [x] 导出时还在生成的照片，按 `failed`、原因 `timeout` 导出
- [x] `include` 里没有 `conversations` 时 `photos` 不起作用；没勾照片时，照片那一项整个不带
- [x] 导入：照片换新 id，挂到新的消息 id 上；`ready` 的照片文件必须能当 webp 解开（尺寸不查），否则整包 `broken`；`ready` 却缺文件的、或者有文件却没有对应照片的，同样 `broken`
- [x] 结果里 `photos` 是这次真正新加的张数
- [x] 前端：「照片」缩进挂在「对话」下面，不勾对话时照片既不能勾、也显示成没勾（导出和导入两边一样）
- [x] 格式说明文档补上照片
- [x] 后端测试（走对外接口）：A 上用现有的照片测试替身造一张发出来了的、一张没发出去的、一张还在生成的，导出后解开 zip 能读到那张 webp，还在生成的那张是 `timeout`；导入 B 后，照片接口能读到图、状态和原因一致；不勾照片时 B 的那条回复上没有照片；照片文件解不开、缺文件、多文件都回 422 且什么也没写进去；B 上的照片别的用户读不到
- [x] 受影响的测试和类型检查通过（`scripts/affected-tests.sh`），CI 绿

## Comments

### 票 01 交接

- `data_package._read` 现在只认 `manifest.json`、`data.json` 两个条目（而且 `manifest.json` 必须是第一个、不压缩），要放开 `photos/<id>.webp`。
- 前端 `OFFERED` 加 `"photos"`；勾选框已经按 `choose`/`isDisabled` 把照片挂在对话下面、缩进显示。

### 票 03 交接

- `PackagedMessage`（`data_package.py`）要加可选的 `photo`；`KeptMessage`/`Store.whole_conversations`（`store.py`）现在不读照片，要按消息带上照片（不带图片本身，图片导出时一张一张读）。
- `add_carried_conversation` 现在用 `executemany` 插消息，拿不到每条的新 id；挂照片要改成逐条插、用 `lastrowid`。去重跳过的那段照片也跟着跳过。
- `Imported.photos` 在 `_add_conversations` 里数；结果里 `photos` 只算这次真正新加的。
- 导出时 `include` 有 `photos` 的判断在 `chosen` 里已经做了；`PackagedConversation.of` 那里按 `"photos" in categories` 决定带不带。


### 实现说明（票 04）

- `store.py`：新加 `KeptPhoto`（不带图片），`KeptMessage.photo` 可选；`whole_conversations` 按消息带上照片；`add_carried_conversation` 改成逐条插消息、用 `lastrowid` 挂照片，多了参数 `picture_of`（按包内照片 id 读图片），去重跳过的整段连照片一起跳过。
- `data_package.py`：新加 `PackagedPhoto`（`status` 只认 `ready`/`failed`，`failed` 必须有原因、`ready` 不能有；`id` 只许字母数字 `_-`，当文件名用）；`PackagedMessage.photo` 只能挂在她的回复上；包内照片 id 不能重复。导出时 zip 的顺序是 `manifest.json`、`photos/*.webp`（stored，WebP 本来就压过）、`data.json`：图片一张张用 `Store.photo_image` 读，写完图片再写 `data.json`，这样导出途中对话被删、图片没了的那张能改成 `failed`/`timeout` 再写进 JSON。导入时 `_read` 改成接一个打开的 `ZipFile`，事务里再从同一个 zip 逐张读图片插进去。
- 坏包的判断：包里有照片却没列 `photos`、列了 `photos` 却没有 `conversations`、`photos/` 下的文件和 `ready` 的照片对不上（缺、多、给没发出去的照片放了图），都是 `broken`；图片用 Pillow 只按 WebP 打开并完整解码，解不开就 `broken`。
- 判断题：
  - 每张图片解压后最大 20 MB（`MAX_PHOTO_BYTES`，规格没写，防 zip 炸弹，写进了格式文档）。像素不另设上限，交给 Pillow 自己的解压炸弹检查（约 1.79 亿像素以上直接报错）。
  - `manifest.json` 的 `counts.photos` 和导入结果的 `photos` 都把没发出去的照片也算上（它们也是照片记录，导入后照样显示成没发出去的说明）。用户看到的「导入了 N 张照片」因此可能比能看的图多；觉得不对再改成只数 `ready` 的。
  - 包里出现 `pending` 的照片算坏包：本部署导出时已经把它们改成 `failed`/`timeout`，别处来的 `pending` 导进来会永远在生成。
  - zip 里多一个 `photos/` 目录条目也算多出来的条目、是坏包（照「条目只有上面三样」）。
- 测试在 `backend/tests/test_data_package_photos.py`；前端只是把 `OFFERED` 换成全部四类，勾选框联动票 01 已经做了。
