# 01: 保留期可调、空间提醒、备份记录和锁

**What to build:** 部署者可以用 `EIDOLON_BACKUP_KEEP_DAYS` 把保留期调短到 1–30 天，用 `EIDOLON_BACKUP_WARN_GB` 在桶里备份太多时收到提醒；每次备份的日志里能看到桶里还剩几份、共多大。cron、手动和（下一张票的）后台按钮共用一个「备份运行」入口：每次运行在数据库里留一条备份记录，正在进行的那条同时是锁，同一时间只有一次备份。见 `../spec.md`「保留期和空间」「备份记录与锁」和 ADR-0012 的 2026-10-15 修订。

**Blocked by:** None (can start immediately)

**Status:** done

### 保留期和空间

- [x] 备份设置多读 `EIDOLON_BACKUP_KEEP_DAYS`（整数 1–30，空着为 30）和 `EIDOLON_BACKUP_WARN_GB`（正数，可以是小数，空着不提醒）；其他值是配置错误，`eidolon backup` 以退出码 1 结束，错误信息说明允许的范围（保留期写明「最长 30 天，是隐私政策的承诺」）
- [x] 清理按保留天数判断；最新的一份永远保留、名字不符的对象不动，都不变
- [x] 列出桶里的对象时带上大小；报告里多出桶里剩下的备份的总字节数（只算备份对象）；`eidolon backup` 的输出里写出剩几份、共多大
- [x] 总量超过阈值时输出一条「注意」，退出码不变、心跳照发

### 备份记录与锁

- [x] 新的备份记录表：开始、结束（进行中为空）、来源（`cron` / `manual` / `admin`）、退出码、对象名和大小、桶里剩下的份数和总字节数、是否超过阈值、错误原因；不含用户内容；写新记录时顺带删掉 90 天前的
- [x] 「备份运行」入口：插入进行中的记录作为锁（已有开始不到 1 小时、没结束的记录就放弃）→ 现有的备份、清理、心跳 → 把结果写回；用数据库而不是文件锁（本地开发在 Windows 上跑）。配置不全也留一条记录
- [x] 提供「把所有没结束的记录标成已放弃」，供 03 的恢复使用
- [x] `eidolon backup` 走这个入口，撞上锁时以退出码 6 结束；接受来源（默认 `manual`）
- [x] `deploy/db-backup.sh`：区分 cron 和手动，把来源交给 `eidolon backup`；容器里返回的 6 照原样传出，日志里的含义不变；脚本开头的退出码说明同步更新
- [x] 留出给后台按钮用的入口：在后端进程里跑一次备份运行时，导出、压缩、加密放进线程，不卡事件循环（02 直接调用）

### 配置与文档

- [x] `.env.example` 加上两个变量和说明
- [x] `docs/deploy.md`「备份」：新变量、日志里多出的份数和总量与「注意」、退出码 6 现在也可能是后台按钮在备份；ADR-0012 正文里的「30 天」改成「保留期（默认 30 天）」的地方按需调整

### 测试

- [x] 照 `backend/tests/test_backup.py`（`FakeBucket` + `httpx.MockTransport`，固定 `now`）：保留天数 7 时删掉 7 天前的、留下最新一份；0、31、非整数是配置错误；阈值超过时有提醒、退出码 0、心跳照发；没设阈值没有提醒；总量只算备份对象
- [x] 锁：进行中的记录挡住第二次运行（退出码 6）；开始超过 1 小时没结束的不挡；每次运行（包括配置不全）都留一条记录、来源正确；90 天前的记录被删掉；「标成已放弃」之后不再挡
- [x] `eidolon backup` 命令行照 `tests/conftest.py` 的 `Admin` 驱动：新变量配置错误时退出码 1

## Comments

- 2026-10-15 实现：入口是 `eidolon.backup.Backups(database, clock, transport=…)`，`await backups.run(source, settings=BackupSettings.from_env)` 返回 `BackupReport`；`report.config_error` 有值时退出码 1（也留一条记录），`report.busy` 时退出码 6（`BUSY`，**不**留记录，因为这次没有运行）。`records()` 返回全部记录（最新的在前，`BackupRecord`），`start(source)` 只插入进行中的那条（测试用来造「另一个进程正在备份」），`abandon_unfinished()` 把没结束的标成已放弃并返回条数。记录表 `backup_runs`，列在 `database.NOT_USER_DATA`；后端在 `assembly.build` 里开了一个 `Backend.backups`（02 直接用）。
- 锁：一条 `INSERT … SELECT … WHERE NOT EXISTS (进行中且开始不到 1 小时)`，两个进程不会都插进去。运行被取消（`CancelledError`，例如后端关机时后台任务被取消）时那条记录标成已放弃，不会一直挡着。
- `BackupReport.kept`、`total` 现在列不出桶时为 None（以前是 0）；超过阈值时 `space_warning` 是一句话，记录里是 `over_warning`。GB 按 10⁹ 字节（`backup.GB`）。
- 不卡事件循环：`back_up` 里导出、压缩、加密放进 `asyncio.to_thread`；`s3.Bucket.put_file` 上传前对整份文件算 SHA-256 也放进了线程。`s3.Bucket` 多了 `objects()`（键 → `Listed(etag, size)`），`etags()` 改为从它得出。
- `deploy/db-backup.sh`：cron 那一行要带 `--cron`（不带记为 `manual`），脚本把 `--source` 交给 `eidolon backup`；主机上的 `flock` 去掉了，锁只在数据库里，两次脚本同时跑时第二次在容器里拿到 6。`docs/deploy.md` 里的 cron 那一行已经加上 `--cron`，线上的 crontab 要手动补。
- 2026-10-15 审查后：新的一次运行抢到锁时，顺手把开始超过 1 小时、还没结束的记录标成已放弃（不然它们永远是「进行中」）；存储桶列表里没给 `Size` 时 `total` 为 None、不提醒（以前按 0 算，提醒永远不会触发）；`eidolon backup` 写不进备份记录（sqlite 错误）时以 2 退出、写明原因，不再被当成「配置不全」；脚本参数不对时也走 `finish 5`、日志里有「结束：」那行；deploy.md 写明脚本和镜像要一起升级（旧镜像不认 `--source`，会被误报成 2）。
