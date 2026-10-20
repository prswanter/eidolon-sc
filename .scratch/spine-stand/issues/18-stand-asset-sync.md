# 18: 立绘素材同步到对象存储

**What to build:** 部署者跑一次同步脚本，存储桶里就有了已配置角色的全部 stand 衣装、每位角色一份衣装清单、每套衣装一张缩略图；立绘改从存储桶加载。规则见 `../spec.md`「素材同步」「配置与 API」两节；依据见「拍板：立绘素材怎么上线」和「拍板：衣装在哪里选、怎么选」（`06-asset-delivery.md`、`09-outfit-picker.md`）。ADR-0003 的 2026-09-30 修订：素材对公众提供，但不进仓库。

**Blocked by:** 14

**Status:** resolved

- [x] **衣装清单**（Python，做成 `eidolon` 的一个命令）：从镜像的 `spine_manifest.json` 和立绘文件，为 `characters.toml` 里配了偶像编号的每位角色生成一份清单：
  - 每张卡一项：编号、卡名（原文，去掉【】和角色名）、稀有度或类型，以及私服（`stand`）和演出服（`stand_costume`）各自对应哪套衣装。
  - 私服和演出服贴图逐字节相同的，只记一套。
  - 按编号排序，也就是原作的发布顺序。
  - 只收 stand 和 stand_costume，不收 cb。
  - 清单的具体格式由你定，写进部署文档。
- [x] **缩略图**：用和线上同一套播放代码，在无界面浏览器里渲染每套衣装的半身图，渲染前让动画先走约 1 秒，避开待机表情开头的眨眼。
- [x] **上传**：通过 S3 兼容接口上传立绘文件（`data.json`、`data.atlas`、`data.png`）、清单和缩略图。endpoint、存储桶、密钥和镜像位置都从环境变量读，不写死用哪一家。已经上传且内容相同的不重复上传。PNG 不转 WebP。
- [x] **部署脚本**：照剧情库的同步脚本来写，包括日志、加锁、约定好的退出码，以及最后一行「结束：退出码 N（含义）」。
- [x] **API**：`/api/characters` 的 `stand` 里加上衣装清单的 URL。
- [x] **部署文档**：新增「立绘素材」一节：
  - 选择对象存储。
  - 存储桶要公开可读，配 CORS 允许站点域名访问，缓存设成长期、不可变。
  - 运行同步脚本；新增角色时怎么做。
  - 如何下架：清空存储桶后，前端自动退回背景图。
  - `.env.example` 补上所有新增的环境变量。
- [x] **测试**：衣装清单的生成，照剧情库同步的测试做法，用一份小的假镜像数据：私服和演出服的配对、贴图相同时去重、按编号排序、卡名处理、没配偶像编号的角色跳过。
- [x] **人工验证**：对一个真实的 S3 兼容存储（或者本地的 MinIO）跑一次，确认真乃和恋钟的清单数量合理（去重后真乃约 84 套、恋钟约 78 套），缩略图没有眨眼；把素材地址指向存储桶后，14 的立绘照常出现。在 Comments 里记下耗时和上传量。
- [x] `uv run pytest`、`uv run pyright` 全部通过。

## Comments

**实现记录（2026-10-01，agent）**

- **衣装清单**：`eidolon stand outfits`（`backend/src/eidolon/stand_outfits.py`），为 `characters.toml` 里配了 `idol_id` 的角色写 `<整理目录>/outfits/<idol_id>.json`。每张卡一项：`id`（enzaId）、`name`、`type`（`dressType`）、`everyday`（私服，`stand`）、`stage`（演出服，`stand_costume`），两者各是 `{id, url, thumbnail}` 或 `null`；`url`、`thumbnail` 相对于清单本身（`../spine/idols/...`、`../thumbnails/...`），19 用 `new URL(url, outfits_url)` 解析。格式写在 docs/deploy.md「立绘素材」。
  - 贴图逐字节相同的只记私服。起初让「演出服正好是默认衣装」时改记演出服，code review 指出这样清单会随配置变、用户存下的衣装可能从清单里消失，改成始终记私服，默认衣装被去重掉时提示去改配置。
  - 卡名取【】里的部分（也就绕开了恋钟有一张写成「月岡戀鐘」的问题）；原作里两张 `【】櫻木真乃` 这样没有卡名的，用角色名。
  - 镜像列了却没有文件的衣装跳过并提示（真乃、恋钟目前都没有）；`default_outfit` 不在清单里时提示。
  - 真实镜像：**真乃 62 张卡 84 套，恋钟 59 张卡 80 套**（ticket 估的约 78，按 09 的对照渲染结论去重后就是 80）。
- **缩略图**：`frontend/scripts/stand-thumbnails.mts`（`npm run stand:thumbnails`），Playwright 的无界面 Chromium 里载入 `StandEngine.ts` 本身（`typescript.transpileModule` 现场转成 JS，import map 解析 `@/`，不打包）和 vendor 的 runtime，电脑「半身 ADV」取景、平静待机，载入后等 1 秒截透明背景 PNG，200×250 CSS 像素 ×2 = 400×500。只渲染还没有的，所以再次同步缩略图不变、不重新上传；`--force` 全部重画。WebGL 走 SwiftShader（新版 Chromium 要 `--enable-unsafe-swiftshader`），没有显卡的服务器也能跑。
- **上传**：`eidolon stand upload`（`stand_upload.py`）+ 自己写的 S3 客户端（`s3.py`，httpx + SigV4，没有引入 boto3）。签名用 AWS 文档里 GET Object、PUT Object、ListObjectsV2 三个示例当测试。先列一次存储桶，ETag 等于本地 MD5 的不上传；立绘文件先传、衣装清单最后传。`Cache-Control` 上传时设：立绘文件 `public, max-age=31536000, immutable`，缩略图一天，衣装清单 `no-cache`（清单随新卡变，spec「素材同步」已补上这一条）。支持 path 和 virtual-host 两种寻址（阿里云 OSS 只认后者）、可设地域。环境变量：`EIDOLON_STAND_MIRROR_PATH`、`EIDOLON_STAND_BUILD_PATH`（默认 `corpus/stand`）、`EIDOLON_STAND_S3_{ENDPOINT,BUCKET,ACCESS_KEY_ID,SECRET_ACCESS_KEY,REGION,ADDRESSING}`、`EIDOLON_STAND_SYNC_LOG`。
- **部署脚本**：`deploy/stand-sync.sh`，照剧情库的脚本：日志 `logs/stand-sync.log`、flock 加锁、退出码 0–5、最后一行「结束：退出码 N（含义）」。**不经过 docker**，在放着镜像的机器上直接运行（要 uv、Node 22.18+、Playwright 的 Chromium、flock），设置从仓库根目录的 `.env` 读（`uv run --env-file`、`node --env-file-if-exists`，环境变量优先）。理由：缩略图要浏览器和前端源码，放进后端镜像不合适，而镜像本来就在部署机上。
- **API**：`stand` 多了 `outfits_url`（`<素材地址>/outfits/<idol_id>.json`），前端 `Stand` 类型同步。
- **code review 修掉的**：缩略图步骤的配置错误被记成「缺少运行环境」、页面出错时只有堆栈（缩略图脚本改成 1 配置、2 部分失败、3 打不开浏览器，脚本逐一对应，意外的退出码写进日志）；镜像数据残缺、清单损坏时打出 traceback（改成报错退出码 1）；上传模块 docstring 说清单不会指向存储桶里没有的东西，其实缩略图渲染失败时会（改了说法，文档也写明换衣装面板要容忍缺缩略图，留给 19）。

**本机验证**（MinIO 已不再提供社区版二进制，改用 SeaweedFS 4.48 的 S3 接口：一个可写密钥 + 匿名只读，`-s3.allowedOrigins='*'`）：

- `deploy/stand-sync.sh` 首次：渲染 164 张缩略图约 1 分钟（本机 4 路并行），上传 **658 个文件、248.2 MB，4 秒**（本机回环，真实存储桶取决于上行带宽）。再跑一次：0 上传、658 个跳过，全程约 4 秒。删掉一张缩略图再跑：只重画、只上传那一张。
- 错密钥：存储桶回 `403 SignatureDoesNotMatch`，脚本退出码 2；镜像路径不对：退出码 1。
- 匿名 GET 立绘文件、缩略图、清单都是 200，带 `Access-Control-Allow-Origin` 和上面的 `Cache-Control`、`Content-Type`。
- 164 张缩略图拼成一张总览逐张看过：都睁着眼，没有空白；「花風Smiley」的眼睛睫毛完整。缩略图不放进 `.scratch/`（ADR-0003 的修订）。
- 本机没有 flock，用一个空的 shim 代替跑的脚本；真正的加锁要在 Linux 上看。

**留给人工验证**：在真实的存储桶（或本地的 S3 兼容存储）上跑一次 `deploy/stand-sync.sh`，把 `EIDOLON_STAND_ASSETS_URL` 指向存储桶的公开地址，确认 14 的立绘照常出现（这一步验证真实环境下的 CORS 和 WebGL 贴图加载）；在 Linux 服务器上确认 `npx playwright install --with-deps chromium` 后缩略图能渲染、flock 加锁正常；在这里补上真实存储桶的耗时和上传量。

**2026-10-01 真实存储桶（腾讯云 COS + CDN，agent 在用户登录的浏览器里操作控制台）**

- 存储桶 `eidolon-stand-1316812496`（上海，私有读写，单 AZ）；子用户 `eidolon-stand-sync` 只能编程访问，自定义策略只允许 `PutObject`、`GetBucket`、`HeadObject` 这个桶，密钥写进本机 `.env`。
- 同步（Windows 的 Git Bash，没有 flock，不加锁）：首次上传 **658 个文件、248.2 MB，用时 46 秒**；再跑一次 0 上传、658 个跳过，用时 1 秒。COS 不认 `list-type=2`，只按 `marker` 翻页，列表已改成两种都认（`860a8be`）。
- CDN `stand.hmhnk.top`（Cloudflare 上 CNAME 到 `stand.hmhnk.top.cdn.dnsv1.com`，灰云）：COS 源、私有存储桶回源授权、HTTPS 回源；节点缓存和浏览器缓存都「遵循源站」；响应头 `Access-Control-Allow-Origin: *`；免费 DV 证书（2026-12-30 到期，要续期）；HTTPS 服务已开启（按请求计费）；用量封顶每天 20GB，超出关闭 24 小时，80% 告警。
- 验证：经 CDN 的 HTTPS 请求，衣装清单 `no-cache`、立绘文件 `immutable`、缩略图一天，`data.json` 被 gzip，全部带跨域头；直接访问存储桶 403。
- 本机 `.env` 的 `EIDOLON_STAND_ASSETS_URL` 已改成 `https://stand.hmhnk.top`。

### 2026-10-01 人工验收（用户）

后端和前端在本机开发模式下启动，`EIDOLON_STAND_ASSETS_URL=https://stand.hmhnk.top`，`/api/characters` 下发 CDN 上的默认衣装和衣装清单地址。用户打电话确认立绘从 CDN 照常出现，没有问题。缩略图此前已逐张看过，没有眨眼。
