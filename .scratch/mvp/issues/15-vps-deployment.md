# 15: VPS 部署

**What to build:** 管理员用一条命令把整套服务部署到 VPS 上，包括生产环境的 Docker Compose 配置、HTTPS，以及 WebRTC 中继所需的 TURN/ICE 配置。部署完成后，小圈子里的朋友用手机或电脑访问公网地址，填入访问密钥，就能和角色通话。

**Blocked by:** 04

**Status:** ready-for-human

- [x] 生产环境的 Docker Compose 配置与开发环境分开，所有密钥都通过环境变量注入，不进仓库
- [x] 全站通过 HTTPS 访问（浏览器只有在 HTTPS 下才允许使用麦克风）
- [x] 配置 TURN 服务，在常见的 NAT 和移动网络环境下也能建立语音连接
- [x] 剧情库数据、人设文件和数据库都放在持久化卷中，升级服务时不会丢失
- [x] 有一份部署说明：需要准备哪些环境变量、如何导入剧情库、如何签发访问密钥
- [ ] 手动验收：用手机通过公网完成一次真实通话

## Comments

实现摘要（2026-09-25）：

- `docker-compose.prod.yml`（和开发用的 `docker-compose.yml` 分开）：caddy、frontend、backend、coturn 四个服务都用 host 网络——后端要把本机公网地址作为 ICE 候选告诉浏览器，coturn 要直接收发 UDP。前端、后端只监听 127.0.0.1，公网只开放 Caddy（80/443）和 coturn（3478、中继端口 49160-49259）。一条命令部署：`docker compose -f docker-compose.prod.yml up -d --build`。
- HTTPS：`deploy/Caddyfile`，Caddy 按 `EIDOLON_DOMAIN` 自动申请、续期 Let's Encrypt 证书，HTTP 跳转 HTTPS；不加压缩，SSE 照常流式。
- TURN：coturn 用 `use-auth-secret`。后端新增 `EIDOLON_TURN_URLS` + `EIDOLON_TURN_SECRET`（`TurnSettings`），`/api/ice-servers` 每次给用户签发 24 小时后过期的凭据（用户名 `过期时间:用户ID`，密码 HMAC-SHA1），共用密钥不出服务器。生产配置里浏览器和后端都用本机 coturn 做 STUN。coturn 拒绝所有对端地址、只允许中继到本机（`EIDOLON_PUBLIC_IP`，1:1 NAT 的云主机用 `EIDOLON_PRIVATE_IP`），不做 TCP 中继，不会被当作开放中继。coturn 直接运行 `turnserver`，绕开镜像入口脚本对参数的 shell 求值。
- 持久化：数据库（含剧情库）在卷 `eidolon-data`，证书在 `caddy-data`；`characters/`、`corpus/` 是宿主机上被 git 忽略的目录。
- 部署说明：`docs/deploy.md`（环境变量、防火墙端口、导入剧情库、签发密钥、升级、备份、排障），README 和 `.env.example` 已更新。
- 顺带修了一个已有问题：后端镜像里 `eidolon` 不在 PATH 上，README 里所有 `docker compose exec backend eidolon ...` 都跑不了；Dockerfile 把 `/app/.venv/bin` 加进了 PATH。
- 测试（`test_voice_call.py`）：TURN 凭据按共用密钥签发、随时钟过期、不含密钥本身；从环境变量读取（只给地址不给密钥时报错）。`FakeClock` 移到 `tests/fakes.py` 共用。

真实验证（2026-09-25，沙箱里用 Docker 跑整套生产配置，真实对话模型、Soniox、Fish Audio）：

- 四个服务正常启动；8000、3000 只监听 127.0.0.1；HTTP 308 跳转 HTTPS（沙箱没有域名，用 IP 让 Caddy 签内部证书）。
- Playwright 驱动 Chromium（假麦克风），并把 `RTCPeerConnection` 强制为 `iceTransportPolicy: "relay"`，模拟手机在严格 NAT 下只能走中继：页面是安全上下文，拿到的 ICE 配置是本机 STUN + 两条 TURN 地址和临时凭据；通话接通，选中的候选对是 coturn 的 `relay 192.0.2.2:49210 udp` ↔ 后端 host 候选，双向都有音频（收到约 140KB 的语音），真乃正常回复。
- coturn 拒绝中继到 1.1.1.1 和 172.17.0.1（403 Forbidden IP）；错误密钥签的凭据被拒（日志 `Cannot find credentials of user`）。
- `up -d --force-recreate` 之后用户和对话都还在；文档里的 SQLite 在线备份命令可用。

未完成 / 已知限制：

- 手动验收「用手机通过公网完成一次真实通话」需要真实 VPS、域名和手机，留给人来做，所以状态改为 ready-for-human。
- 1:1 NAT 云主机（`EIDOLON_PRIVATE_IP`）的路径没有实际验证过（沙箱里无法模拟）。
- 只放行 443 端口的网络里语音连不上：TURN 走 443（turns）需要和 Caddy 分用端口，没有做。
- coturn 的共用密钥出现在 coturn 进程的命令行参数里，服务器上的其他本地用户能看到；单管理员的 VPS 上可以接受。
