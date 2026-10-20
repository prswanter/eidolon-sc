# 02: 数据库每天加密备份到私有存储桶

**What to build:** 部署者配好一个私有的 R2 存储桶和 age 公钥、装好 cron 以后，数据库每天自动加密备份到云端，保留 30 天；手动备份就是运行同一个脚本。用户在隐私说明和删除确认里能看到「备份中的副本最多 30 天后清除」。见 `../spec.md` 和 ADR-0012。

**Blocked by:** 无

**Status:** done

### `eidolon backup`

- [x] 用 `VACUUM INTO`（或在线备份 API）把数据库导出成一个一致的临时副本，不停服务；对副本跑 `PRAGMA integrity_check`，不是 `ok` 就不上传、以失败退出
- [x] 压缩后用 age 公钥加密（选一个能在镜像里用的实现：Python 库或 `age` 可执行文件，写明理由），上传到 `EIDOLON_BACKUP_S3_*` 配置的存储桶，对象名里带 UTC 时间戳；临时文件无论成败都删掉
- [x] 删掉 30 天前的备份：上传失败也照删，但永远保留最新的一份。`eidolon.s3.Bucket` 补上删除对象，列出对象时要有最后修改时间，或者按对象名里的时间戳来判断
- [x] 成功后，配了 `EIDOLON_BACKUP_PING_URL` 就访问一次；访问失败只记警告，不改变退出码
- [x] 退出码分别对应：成功、配置不全、导出或完整性检查失败、上传失败、删除过期备份失败。和 `story sync`、`stand` 的风格一致
- [x] 测试：用假的 S3（或 `httpx.MockTransport`）覆盖上传、删除过期备份、保留最新一份（只剩超过 30 天的备份时也不删）、完整性检查失败时不上传；生成的备份文件用测试私钥能解密、解压，打开以后数据和原库一致

### `deploy/db-backup.sh`

- [x] 照 `deploy/story-sync.sh` 的写法：`docker compose exec -T backend eidolon backup`，输出追加到 `logs/db-backup.log`（日志里以「==== 开始」「==== 结束：退出码 N（含义）」包住每次运行），`flock` 防重叠，`PYTHONIOENCODING=utf-8`，后端没在运行时以单独的退出码结束

### 配置与文档

- [x] `.env.example` 加上 `EIDOLON_BACKUP_S3_ENDPOINT/BUCKET/ACCESS_KEY_ID/SECRET_ACCESS_KEY/REGION`、age 公钥、`EIDOLON_BACKUP_PING_URL`，注释说明存储桶必须是私有的，不要和立绘共用
- [x] `docs/deploy.md`「备份」一节重写：建 R2 私有存储桶和只能读写它的 API 令牌、生成 age 密钥对（私钥离线保存，丢了备份就全废了）、另外保存 `EIDOLON_SECRET_KEY`、每天一次的 crontab、退出码表、心跳；新增「从备份恢复」：下载、在自己的机器上解密、停后端、替换卷里的 `eidolon.db` 并删掉 `-wal`/`-shm`、启动，建议首次配置后演练一次，写明回滚到更早的备份会让这段时间里删除了数据的用户重新出现
- [x] 隐私说明（`frontend/src/app/privacy/page.tsx`）和删除用户的确认（`DeleteAccount.tsx`）写明：线上数据立刻彻底删除，备份中的副本最多 30 天后清除
- [x] 三份 README 的部署和特性说明补上一句备份

### 人工验收

- [x] 用真实的 R2 存储桶跑一次 `deploy/db-backup.sh`，桶里出现备份；在本机用私钥解密、解压，用 `sqlite3` 打开能看到用户和剧情；照 deploy.md 恢复到本地的 compose 一次

## Comments

**2026-10-03 实现完成**（人工验收一项留给部署者）：加密用 pyrage（rage 的 Python 绑定）：有 linux amd64/arm64 和 Windows 的 abi3 wheel，镜像里不用另装东西，能一块一块地加密文件，产物用 `age` 或 `rage` 都能解密；不手写 age 格式。过期判断按对象名里的 UTC 时间戳（`eidolon-YYYYMMDDTHHMMSSZ.db.gz.age`），名字不符的对象不动。导出失败时过期备份也照删；心跳只在退出码 0 时访问。脚本的退出码：0–4 同 `eidolon backup`，5 后端没在运行，6 上一次还没结束。

**2026-10-03 人工验收**（部署者配合，Claude 操作）：
- 用 wrangler 建了私有的 R2 存储桶 `eidolon-backups`（r2.dev 关闭、没有自定义域名）；令牌在网页上建，只给这一个桶「对象读和写」。age 密钥对用 pyrage 生成，格式和 age-keygen 一样，私钥只在部署者电脑上。
- 本机对真实的 R2：备份上传成功（35.1 MB）；用 wrangler 另行下载、私钥解密、解压后完整性检查 ok，15 张表的行数和原库一致；放进一份 2026-08-01 的假旧备份，下一次备份把它删了，新的保留。
- 服务器（切到 feat/db-backup，重建前后端）：`deploy/db-backup.sh` 以 0 结束（35.4 MB，86 秒），日志格式正确；下载解密后和线上实时数据一致（16 位用户、67 段对话、700 条消息、45 条记忆、7967 段剧情）。crontab 装了每天 3:43（CST），另加一条临时任务确认 cron 环境下也以 0 结束，随后删掉。
- 恢复演练：本机没有 Docker，改在服务器上做。照 deploy.md 第 4 步的命令（删 `-wal`/`-shm`、拷入），恢复进一个临时数据卷，`eidolon user list` 列出 16 位用户，之后删掉临时卷；线上的数据卷没有动。
- 服务器的 `.env` 用了 `COMPOSE_FILE=docker-compose.prod.yml:docker-compose.server.yml`，crontab 里同样写上；脚本只操作 backend，即使只用默认的 prod.yml 也能运行。

