<div align="center">

<img src="docs/images/landing.webp" alt="Eidolon-SC：和 283 事务所的偶像说说话" width="100%">

# Eidolon-SC · 个人分支

**和《偶像大师 闪耀色彩》的偶像实时对话的 AI 分身 —— 一份改来自己用的分支**

上游：[Sallyn0225/eidolon-sc](https://github.com/Sallyn0225/eidolon-sc) · 本分支：[prswanter/eidolon-sc](https://github.com/prswanter/eidolon-sc)

</div>

---

## 这是什么

上游 Eidolon-SC 面向**公网多用户**：OAuth 登录、按用户限流、异地加密备份、Caddy 自动 HTTPS，一套 compose 上去就是给所有人用的站点。

这个分支的出发点不一样：**给一台 Windows 台式机上的局域网自用**。同一套代码，改成本机跑、手机在内网连、立绘素材放本机对象存储、模型凭证全留在 `.env` 里。在这个基础上又加了六个上游没有的功能：设置里的「关于我」，左侧栏的「人设卡」「回复格式」两个编辑页，以及**发图片给她看、发语音给她、把她的回复念出来**三项多模态。

所以本文件只讲**和原版有什么不同**。产品定位、视觉规范、架构决策上游写得很完整，直接看原文：

- [上游 README](https://github.com/Sallyn0225/eidolon-sc/blob/main/README.md)（本仓库的 `README.en.md` / `README.ja.md` 仍是上游原文，没改）
- [`PRODUCT.md`](PRODUCT.md) · [`DESIGN.md`](DESIGN.md) · [`docs/adr/`](docs/adr/) · [`GLOSSARY.md`](GLOSSARY.md)

## 与原版的区别

### 一、部署形态：公网多用户 → 本机局域网

| 项目 | 原版 | 本分支 |
|---|---|---|
| 入口 | Caddy 自动 HTTPS + 域名 | Caddy 8443 自签证书，直接 `https://<局域网IP>:8443`，设备各装一次根证书 |
| 登录 | Google / GitHub OAuth | `EIDOLON_DEV_LOGIN=1` 开发登录（OAuth 代码没动，配好即可切回） |
| 通话穿透 | 公网 TURN（域名 + 证书） | 本机 coturn，`--external-ip` 读 `EIDOLON_TURN_EXTERNAL_IP`，手机在内网也能双向语音 |
| 立绘素材 | 对象存储 + CDN | 本机 MinIO + Caddy `handle_path /stands/*` 同源反代，避开混合内容与 CORS |
| 跨域 | 只允许自己的域名 | `EIDOLON_EXTRA_ORIGINS` 放行 `localhost:3000` 与局域网 IP |
| 容器 | caddy / frontend / backend / coturn | 同上 **+ minio**，共五个 |
| 剧情库 | 服务器定时同步 | 本机 `corpus/` 挂进容器（可写，`stand fetch` 要往里写），手动跑同步 |
| 判断模型 | 按部署情况选 | 固定 Cloudflare `clef-flash`（开着好感度时百炼不适用，见 [`docs/configuration.md`](docs/configuration.md)） |

### 二、新增功能（上游没有）

#### 界面与提示词

**1. 设置 →「关于我」** — 制作人档案里多一个 500 字自由文本框，内容每轮都跟着提示词走，当作「她本来就知道的事」。存 `producer_profiles.about`（启动时自动补列迁移），随数据包导出，数据包格式 `FORMAT 2 → 3`。

**2. 左侧栏 →「人设卡」** — 在浏览器里直接改 `characters/sheets/<id>.md` 并保存，写盘后**原地刷新**后端内存里的角色表，下一轮对话即生效，不用重启容器。先写 `.tmp` 再 `os.replace`，写坏了不会留半份文件。

**3. 左侧栏 →「回复格式」** — 编辑 `<ja>/<zh>` 分段提示词的三段内容（`format` / `cues` / `directed_cues`），覆盖存 `/data/reply_format.json`，每轮现读，读不到或坏了就回落到代码里的默认值。保存时校验三个标签缺一不可——解析器硬依赖它们，缺了整句会丢。可一键恢复默认。

两个编辑页都**只要登录、不要管理员**：本机 `EIDOLON_ADMINS` 是空的，admin 路由一律 404，套上去就没人能进。路由在 `backend/src/eidolon/prompt_editor_api.py`（5 个），页面在 `frontend/src/app/(app)/(nav)/sheets|reply-format/`。

#### 多模态（借自 [youjiwu123 的 fork](https://github.com/youjiwu123/eidolon-sc)，重写过）

那位的 fork 里有图片、语音、朗读三件事，思路可用，代码不能直接用（他的 `llm/*.py` 被 GBK 转码损过，注释和几个 `→` 是乱码）。所以照着思路在本分支重新实现：

**4. 发图片给她看（`144060ed`）** — 输入框左边的图钉选一张图，随这一轮一起发。后端**先单独问一遍「这图里是什么、是不是她本人、还是别的角色」**，再把她看到的东西用话讲进这一轮的提示词（ADR 风格：不让长人设提示词把图片淹掉）。看得懂图的模型是后台模型时，扮演用的模型不收原图（`show_picture=False`），纯文本模型也能照常说下去；实在没人看得懂才回「看不懂图片」。原图存 `user_images` 表，`GET /api/messages/{id}/image` 取回，只给发图的人看。各协议编码在 `llm/anthropic.py`、`openai_compat.py`、`responses.py` 各一段。

**5. 发语音给她（`decc6e7a`）** — 输入框右边的麦克风：点一下录，再点一下停下，`POST /api/voice` 交后端听成文字，然后当普通消息发出去。浏览器端录 16 kHz 单声道 PCM（`lib/voiceMessage.ts`），后端整段送百炼识别（`bailian.transcribe`，和通话里的流式识别分开）。**只认百炼的 key**：Soniox 收不了整段录音，换了 key 会直接告诉你换回来。

**6. 把她的回复念出来（`0a66bce2`）** — 她最后一条气泡旁边的小喇叭，点一下才合成，再点一下停，同一时间只念一条。念之前先去掉语气提示，只念日语原文。合成结果存 `message_speech` 表，再点是放存下那份，**不重复花钱**。key 跟通话走同一条路（`POST /api/messages/<id>/speech` 带 `own_keys`）：自带的优先，没自带才用部署的；自带那把失败就报「你自带的密钥」并打码，不回落。两边都没配时返回 503 并说明。

三个功能新增两张表（`user_images`、`message_speech`），都登记进 `USER_DATA` / `CONVERSATION_DATA`，导出数据包和删除对话时跟着走；启动时自动建表，老库不用迁移。

#### 还没做的

youjiwu 的 fork 里另有两件事没跟：

- **接通电话她先说话**（`GET /api/characters/{id}/call-opener/speech`）。上游的 `call_opener` 只是落地页演示来电用的，29 个角色里只有 1 个配了文本；要做成「一接就打招呼」，得给另外 28 位各写一段开场白，还要想清楚这算不算她的第一个回合。属于产品决定，等想清楚再做。
- **好感度六档** 和 **判断按档放宽**。上游是五档（`GLOSSARY.md`「好感度」），改档位要连带改判断提示词、通知文案和十几条 eval 用例，牵动面太大，暂不跟。

### 三、工具与脚本

原版只有部署用的 `deploy/*.sh` 和 `scripts/setup-oauth.sh`，本分支补了一套本机运维的东西：

| 文件 | 干什么 |
|---|---|
| `deploy/patches/0001~0005` | 本机改造拆成**一个文件一个补丁**（config / sessions / compose / Caddyfile.local / .gitignore） |
| `scripts/apply-local-patches.sh` | 循环打补丁（反向检测判「已应用」）+ 体检 `.env` 与证书 SAN，`--check` 只看不干 |
| `deploy/local-tls/gen-certs.sh <IP>` | 生成自签 CA + 服务端证书（825 天；CA 存在就复用，换 IP 重签设备不用重新信任） |
| `scripts/trust-local-ca.sh` | 把自签根证书装进当前用户证书库（`certutil -user`，免管理员），装完体检信任状态 |
| `scripts/stand-sync-local.sh` | 容器版立绘四步 `fetch → outfits → thumbnails → upload`，`fetch` 断线自愈（按日志判失败，不看退出码） |
| `scripts/enable-retrieval.sh` | 检索链路一条命令开起来：校验 key → force-recreate → 等就绪 → `story sync` 带重试 → 体检 |
| `scripts/check-cloudflare-judge.sh` | 填 `.env` 之前先验 Cloudflare token / account / 权限 / 模型 |
| `frontend/scripts/diag-*.mts` | 三个无头浏览器诊断：立绘素材能不能取到、换衣装面板里有几张卡、设置页「关于我」的渲染 |

### 四、动到了哪些上游文件

界面功能只落在部署外围和 `prompt_editor_api.py`；多模态那三项是**真的进了对话引擎**，跟上游合并时要留意这几处：

| 文件 | 改了什么 |
|---|---|
| `llm/__init__.py` | `ChatMessage.image`：一轮可以带一张图（`(bytes, mime)`） |
| `llm/anthropic.py` / `openai_compat.py` / `responses.py` | 各自协议里编码图片：`image` 块 / `image_url` / `input_image` |
| `engine.py` | `turn()` 多了 `image` / `picture_note` / `picture_is_her` / `show_picture`，提示词里告诉她「图里是什么」（`PICTURE_SENT`） |
| `app.py` | 三个新接口 `POST /api/voice`、`GET /api/messages/{id}/image`、`POST /api/messages/{id}/speech`（带 `own_keys`，跟通话同一套 key 解析）；`_describe_picture` 先单独读图 |
| `bailian.py` | `transcribe()`：整段 PCM 一次送识别，和通话里的流式识别分开 |
| `call.py` / `greetings.py` / `live_config.py` | `Speech` 协议加 `transcribe` / `voice_line`；`LiveConfig.voice` 取当前生效的语音合成配置 |
| `store.py` / `database.py` | 两张新表，登记进 `USER_DATA` / `CONVERSATION_DATA` |

检索、记忆、通话层、后台、落地页仍然是上游原样。

## 和上游的版本关系

**本仓库的分支**：

| 分支 / 标签 | 是什么 |
|---|---|
| `main` | 我们的版本 = 上游 `8a31a35` + 本机改动（局域网部署 + 三个界面功能 + 三个多模态功能），跟着上游走 |
| `upstream-mirror` | 上游 `main` 的原样镜像（当前 `8a31a35`），只用来对比，不拿来部署 |
| `local-multimodal` | 三个多模态功能的分支（`144060ed` / `decc6e7a` / `0a66bce2`），`main` 之外留一份，方便单独挑或撤 |
| `snapshot-history` | 早期按 tarball 快照攒的 15 个提交，留个来路 |
| `upstream-2026-10-18` / `upstream-2026-10-20` / `upstream-4b86953` / `upstream-8a31a35` | 每个上游版本进来时打的 tag |

**和上游的关系**：已经跟到 `8a31a35`（2026-10-21）。跟进来的三批：

- PR #153 **看板汇总表**：看板改读 15 分钟粒度预汇总表，耗时 1.4–3.5s → 0.05–0.19s
- PR #155 **每日任务**：每天三项小事（任一角色一回合 / 送出一份礼物 / 共 10 回合），各多得一次抽奖
- **成就系统**（7 张票全关）：解锁阶段、集齐角色、上线补算，礼物页/对话页/统计页/看板各有一节
- **新角色七草はづき**（283 事务所的事务员，第 29 位）；世界设定同步到 2026-10-21

这些功能是上游的、这里只是跟进；「关于我」「人设卡」「回复格式」和三个多模态功能才是本分支新加的。

**怎么看上游更新、怎么挑着装**：

```sh
git fetch upstream                        # 拉上游最新
git log --oneline main..upstream/main     # 上游比我们多了什么
git show <sha>                            # 某个提交具体改了什么
git diff main..upstream/main -- backend/  # 只看某个目录
git cherry-pick <sha>                     # 只要这一个改动
git merge upstream/main                   # 或者整批合
git push                                  # main 已跟踪 origin/main
```

网页上直接看差异：<https://github.com/prswanter/eidolon-sc/compare/main...upstream-mirror>

**三个坑**：

1. 上游改 `navShell.ts`、`AppNav.tsx`、`i18n/zh.ts`、`lib/api.ts`、`theme/icons.ts` 时最容易和「人设卡」「回复格式」撞车。#155 那次是**同一批文件但不同位置**，git 自动合过了；一旦改到同一行，就只能手工解。
2. 多模态那三个提交动的正是上游最活跃的地方：`engine.py` 的 `turn()`、`app.py` 的回合接口、`store.py` 的建表段、`llm/*.py` 的消息编码。上游一改提示词或加一种协议，这里就要跟着改一遍。真合不动时可以先 `git revert` 掉对应那个提交（`144060ed` / `decc6e7a` / `0a66bce2` 各自独立，撤一个不影响另外两个）。
3. 作者说要出破坏型更新，那就**一个版本一个 tag 地跟**：`git fetch upstream` → `git tag upstream-<日期> <sha>` → 在分支上试合、跑通了再进 `main`。合不动就把 tag 留着，等下一版。

> 网络：`github.com` 直连被 DNS 污染，`origin` / `upstream` 都走 SSH over 443（`~/.ssh/config` 里 `Host github.com → ssh.github.com:443` 已配好）。

## 在本机跑起来

前提：Windows + Docker Desktop，`.env` 里至少有对话模型的 `CHAT_LLM_*`。

```sh
# 1. 配置
cp .env.example .env          # 填 CHAT_LLM_BASE_URL / CHAT_LLM_API_KEY / CHAT_LLM_MODEL
                              # 再加 EIDOLON_DEV_LOGIN=1、EIDOLON_TURN_EXTERNAL_IP=<本机局域网IP>
                              # 立绘需要 EIDOLON_STAND_ASSETS_URL=https://<IP>:8443/stands/eidolon-stand

# 2. 自签证书（只需一次；换 IP 再跑，CA 会复用）
deploy/local-tls/gen-certs.sh <本机局域网IP>

# 3. 起服务
docker compose up --build -d

# 4. 让浏览器信任自签 CA（免管理员，只影响当前用户）
scripts/trust-local-ca.sh
```

然后开 <http://localhost:3000>，登录面板里选「开发登录」，同意条款后进对话列表。手机访问 `https://<IP>:8443` 前要先装一次根证书（页面上有下载入口）。

立绘要先把素材灌进本机 MinIO：

```sh
scripts/stand-sync-local.sh        # fetch → outfits → thumbnails → upload，断线自动重试
```

剧情回忆要自备剧情库（**不随仓库分发**）：把 `SCTranslationData` 放进 `corpus/`，配好 `SILICONFLOW_API_KEY`，再跑 `scripts/enable-retrieval.sh`。

### 本分支多出来的环境变量

| 变量 | 作用 |
|---|---|
| `EIDOLON_TURN_EXTERNAL_IP` | coturn 的对外 IP，填本机局域网地址（compose 里是必填项） |
| `EIDOLON_EXTRA_ORIGINS` | 额外放行的来源，逗号分隔，如 `http://localhost:3000,https://10.0.0.2:8443` |

其余变量全部沿用上游，见 [`.env.example`](.env.example) 与 [`docs/configuration.md`](docs/configuration.md)。

### 三个多模态功能要什么

功能开着，但能不能用取决于配了什么。本机当前的状态（2026-10-21）也写在下面：

| 功能 | 需要 | 本机现状 |
|---|---|---|
| 发图片给她看 | 一个**能看图**的模型。`CHAT_LLM_MODEL` 看不了图也没关系，把 `BACKGROUND_LLM_*` 指向一个视觉模型即可：读图这活交给后台模型，它只回答「图里是什么、是不是她」，便宜且不占扮演的上下文 | 没配 → 回「她现在看不懂图片」，并提示去配背景模型 |
| 发语音给她 | `STT_PROVIDER=bailian` + `DASHSCOPE_API_KEY`（阿里云百炼）。Soniox 收不了整段录音，代码里会直说要换回来 | 没配 → 「还没有配置语音识别」 |
| 把她的回复念出来 | 语音合成 key（Fish Audio），**跟通话用的是同一把**：设置页里自带的语音合成 key 优先、按你选的模型念，没自带才用部署的 `FISH_AUDIO_API_KEY`（可选 `FISH_AUDIO_MODEL`） | 两边都没配 → 「还没有配置语音合成」 |

注意：**「发语音」和「她说话」是两套 key**。前者是识别（百炼），后者是合成（Fish Audio）。两者都没配，纯文字对话照常。

朗读跟通话同源：浏览器点小喇叭时把自带的那把 Fish Audio key 跟通话请求一样带上来（`own_keys.tts`），失败也跟通话一样只报「你自带的那把」、把 key 打码，绝不偷偷回落到部署的 key。区别只在计费之外——朗读不占通话时长，合成一次就存在 `message_speech` 里。

## 已知限制

- **单机单实例**：SQLite + 本机 MinIO，没有并发和容灾设计，服务的是「自己家的人」。
- **自签证书**：每台设备要单独信任一次；证书过期或换 IP 后要重新装。
- **没有后台权限**：`EIDOLON_ADMINS` 为空，`/admin` 下所有路由 404（有意为之，不是坏了）。
- **跟着上游走，但会晚**：上游出新版不会自动进来，靠手动 `git fetch upstream` + 合分支（见上一节）。合完之后这里和上游的差别是「本机部署 + 三个界面功能 + 三个多模态功能」，其中多模态动了 `engine.py` / `app.py` / `store.py` / `llm/*`，是最可能冲突的地方。
- **多模态要自己配 key**：图片要有能看图的模型、语音要有百炼的识别 key、朗读要有 Fish Audio 的合成 key（见上面「三个多模态功能要什么」）。本机目前一样都没配，属于「功能在、没接上」。
- **数据包不含你发出去的图片和朗读音频**：格式还是第 3 版（没动上游的格式规则），照片只带她发出来的那些。换部署导入之后，历史里你发过的图会显示成空白，想听朗读要重新合成。
- **剧情数据、角色音色、立绘素材都不在仓库里**，要自己准备。
- **`.claude/skills/*` 那批软链接在仓库里显示为删除**：Windows 上 `core.symlinks=false`，解包时被展开成了目录副本，git 只认到原链接消失。纯开发工具的事，不影响运行。

## 许可证

代码沿用上游：**GNU Affero General Public License v3.0 或更高版本**（[LICENSE](LICENSE)）。这个分支同样适用——若把改过的版本部署到公网给别人用，需要向这些用户提供你修改后的源码。

以下内容不在许可证范围内，也不在本仓库里：

- **原作的内容**：剧情数据、角色音色、立绘素材，使用时须遵守各自来源的条款（[ADR-0003](docs/adr/0003-corpus-and-voices-stay-private.md)）
- **Spine Runtimes**：`frontend/public/vendor/spine-3.6/` 原样收录，适用它自己的许可证（[LICENSING.md](LICENSING.md)）
- **字体和音效**：见 `frontend/src/app/(landing)/fonts/` 与 `frontend/public/sounds/CREDITS.md`

<div align="center">

---

<sub>《偶像大师 闪耀色彩》及其角色的版权归 ©Bandai Namco Entertainment Inc. 所有。本项目为非官方粉丝作品，与万代南梦宫及版权方无关，角色由 AI 扮演。</sub>

<sub>上游作者：[Sallyn0225](https://github.com/Sallyn0225) · 致谢名单见 [上游 README](https://github.com/Sallyn0225/eidolon-sc/blob/main/README.md)</sub>

</div>
