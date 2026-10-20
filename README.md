<div align="center">

<img src="docs/images/landing.webp" alt="Eidolon-SC：和 283 事务所的偶像说说话" width="100%">

# Eidolon-SC · 个人分支

**和《偶像大师 闪耀色彩》的偶像实时对话的 AI 分身 —— 一份改来自己用的分支**

上游：[Sallyn0225/eidolon-sc](https://github.com/Sallyn0225/eidolon-sc) · 本分支：[prswanter/eidolon-sc](https://github.com/prswanter/eidolon-sc)

</div>

---

## 这是什么

上游 Eidolon-SC 面向**公网多用户**：OAuth 登录、按用户限流、异地加密备份、Caddy 自动 HTTPS，一套 compose 上去就是给所有人用的站点。

这个分支的出发点不一样：**给一台 Windows 台式机上的局域网自用**。同一套代码，改成本机跑、手机在内网连、立绘素材放本机对象存储、模型凭证全留在 `.env` 里。在这个基础上又加了三个上游没有的功能（设置里的「关于我」，以及左侧栏的「人设卡」「回复格式」两个编辑页）。

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

**1. 设置 →「关于我」** — 制作人档案里多一个 500 字自由文本框，内容每轮都跟着提示词走，当作「她本来就知道的事」。存 `producer_profiles.about`（启动时自动补列迁移），随数据包导出，数据包格式 `FORMAT 2 → 3`。

**2. 左侧栏 →「人设卡」** — 在浏览器里直接改 `characters/sheets/<id>.md` 并保存，写盘后**原地刷新**后端内存里的角色表，下一轮对话即生效，不用重启容器。先写 `.tmp` 再 `os.replace`，写坏了不会留半份文件。

**3. 左侧栏 →「回复格式」** — 编辑 `<ja>/<zh>` 分段提示词的三段内容（`format` / `cues` / `directed_cues`），覆盖存 `/data/reply_format.json`，每轮现读，读不到或坏了就回落到代码里的默认值。保存时校验三个标签缺一不可——解析器硬依赖它们，缺了整句会丢。可一键恢复默认。

两个编辑页都**只要登录、不要管理员**：本机 `EIDOLON_ADMINS` 是空的，admin 路由一律 404，套上去就没人能进。路由在 `backend/src/eidolon/prompt_editor_api.py`（5 个），页面在 `frontend/src/app/(app)/(nav)/sheets|reply-format/`。

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

### 四、没有改的部分

对话引擎、检索、记忆、语音管线、通话层、后台、落地页——**一律是上游原样**。这个分支只碰部署外围和上面那三个界面功能。

## 和上游的版本关系

**本仓库的分支**：

| 分支 / 标签 | 是什么 |
|---|---|
| `main` | 我们的版本 = 上游 `4b86953` + 本机改动（局域网部署 + 三个界面功能），跟着上游走 |
| `upstream-mirror` | 上游 `main` 的原样镜像（当前 `4b86953`），只用来对比，不拿来部署 |
| `snapshot-history` | 早期按 tarball 快照攒的 15 个提交，留个来路 |
| `upstream-2026-10-18` / `upstream-2026-10-20` | 每个上游版本进来时打的 tag |

**和上游的关系**：已经跟到 `4b86953`（2026-10-20）。最近跟进来的两批：

- PR #153 **看板汇总表**：看板改读 15 分钟粒度预汇总表，耗时 1.4–3.5s → 0.05–0.19s
- PR #155 **每日任务**：每天三项小事（任一角色一回合 / 送出一份礼物 / 共 10 回合），各多得一次抽奖

这两个功能是上游的、这里只是跟进；「关于我」「人设卡」「回复格式」才是本分支新加的。

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

**两个坑**：

1. 上游改 `navShell.ts`、`AppNav.tsx`、`i18n/zh.ts`、`lib/api.ts`、`theme/icons.ts` 时最容易和「人设卡」「回复格式」撞车。#155 那次是**同一批文件但不同位置**，git 自动合过了；一旦改到同一行，就只能手工解。
2. 作者说要出破坏型更新，那就**一个版本一个 tag 地跟**：`git fetch upstream` → `git tag upstream-<日期> <sha>` → 在分支上试合、跑通了再进 `main`。合不动就把 tag 留着，等下一版。

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

## 已知限制

- **单机单实例**：SQLite + 本机 MinIO，没有并发和容灾设计，服务的是「自己家的人」。
- **自签证书**：每台设备要单独信任一次；证书过期或换 IP 后要重新装。
- **没有后台权限**：`EIDOLON_ADMINS` 为空，`/admin` 下所有路由 404（有意为之，不是坏了）。
- **跟着上游走，但会晚**：上游出新版不会自动进来，靠手动 `git fetch upstream` + 合分支（见上一节）。合完之后这里和上游的差别只剩「本机部署 + 三个界面功能」。
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
