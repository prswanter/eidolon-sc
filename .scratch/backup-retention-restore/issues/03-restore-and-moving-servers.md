# 03: 恢复命令和换服务器

**What to build:** 部署者把在自己电脑上解密好的备份（`.db` 或 `.db.gz`）传到服务器，运行 `deploy/db-restore.sh <文件>`：文件检查不过就什么都不动；检查通过后先把要被替换的库备份到存储桶，再停后端、替换、删掉 `-wal`/`-shm`、启动，最后报出恢复进来的库里有几位用户。新服务器上加 `--no-backup` 跳过先备份。deploy.md 新增「换服务器」一节。见 `../spec.md`「恢复」「文档」和 ADR-0012 的 2026-10-15 修订。

**Blocked by:** 01

**Status:** done

### `eidolon restore <文件>`

- [x] 在停了后端以后、一次性的后端容器里运行（`docker compose run --rm --no-deps`，文件只读挂入）
- [x] 接受 `.db` 和 `.db.gz`，按内容判断是否 gzip；解压或拷贝到数据卷里的临时文件
- [x] `PRAGMA integrity_check` 必须是 `ok`，并且有本项目的核心表（至少 `users`）；不通过就删掉临时文件、不碰现在的库，以非 0 退出并说明原因
- [x] 通过后在同一个卷里改名替换现在的库，删掉旧的 `-wal`/`-shm`；用 01 提供的方法把没结束的备份记录标成已放弃；打印恢复进来的库里的用户数

### `deploy/db-restore.sh <文件> [--no-backup]`

- [x] 照 `deploy/db-backup.sh` 的写法：脚本开头写明用法和退出码，输出到终端（这是交互运行的，不写日志文件），`COMPOSE_FILE` 照旧
- [x] 文件不存在就退出；没加 `--no-backup` 时先运行 `deploy/db-backup.sh`，不是 0 就停下、什么都不换，提示看 `logs/db-backup.log`、新服务器可以加 `--no-backup`
- [x] 停后端 → `eidolon restore` → 启动后端；`eidolon restore` 失败时也把后端重新启动（库没被动过），以非 0 退出

### 文档

- [x] `docs/deploy.md`「从备份恢复」：下载、在自己的电脑上解密（不变），传到服务器，运行 `deploy/db-restore.sh`；回滚时它会先备份要被替换的库；确认步骤
- [x] 新增「换服务器」：旧服务器上立即备份一次（后台按钮或 `deploy/db-backup.sh`）→ 新服务器照「部署」准备好 `.env`（原来的 `EIDOLON_SECRET_KEY`）和自己加的 compose 叠加文件、`up -d` → 下载最新一份、解密 → `deploy/db-restore.sh --no-backup` → 确认 → 新服务器装好 cron；新服务器部署的提交不能比旧服务器旧；DNS 切过去之前旧服务器上还在产生的新数据怎么办（停旧服务器后再做最后一次备份）
- [x] 修正「`characters/` 被 git 忽略、要另外保存」的过时说法：`characters/` 在仓库里；`deploy/event-names.toml` 写了才有，写了就一起带走；`.env` 和 compose 叠加文件要手动带

### 测试

- [x] 照 `tests/conftest.py` 的 `Admin` 驱动 `eidolon restore`：`.db` 和 `.db.gz` 都能恢复、数据和原库一致；损坏的文件、不是 SQLite 的文件、没有 `users` 表的 SQLite 都不碰现在的库；旧的 `-wal`/`-shm` 被删掉；没结束的备份记录被标成已放弃；用 `back_up` 做出的一份备份、测试私钥解开后能恢复

### 人工验收

- [ ] 服务器上照「从备份恢复」恢复进一个临时数据卷（不动线上的卷），`eidolon user list` 能列出用户；`deploy/db-restore.sh` 的先备份、检查失败、`--no-backup` 三条路各走一次

## Comments

- 票 01 交接：「把没结束的备份记录标成已放弃」是 `Backups(恢复后的库路径, utc_now).abandon_unfinished()`（返回条数，用完 `close()`）。`deploy/db-backup.sh` 现在不带参数就是手动来源（`--cron` 才是 cron），`db-restore.sh` 里先备份时直接调用它即可；它的 6 现在由容器里的 `eidolon backup` 返回，主机上不再用 `flock`。
