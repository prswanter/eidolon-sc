# 04: 每周定时同步的部署

**What to build:** 管理员按部署文档装好一次后，服务器每周自动更新 SCTranslationData 并运行同步，结果追加到日志；不用再手动重新克隆和分两步导入。

**Blocked by:** 01

**Status:** resolved

- [x] 生产环境的 compose 为原始剧本缓存目录和活动名对照表增加挂载，缓存在容器重建后保留
- [x] 新增定时脚本：`git pull` SCTranslationData（目录不存在时先克隆），然后通过 `docker compose exec` 运行 `eidolon story sync`，输出和退出码追加到日志
- [x] `docs/deploy.md` 说明如何安装主机上的 cron（每周一次），首次全量补齐大约需要一到两小时，以及日志在哪里看
- [x] `docs/deploy.md` 中原来「手动克隆再导入」的步骤改为指向同步命令，保留手动导入作为备用
- [x] 在本地用 compose 走通一次：先同步出原文剧情，再放入对应的汉化版 CSV 重新同步，确认汉化版取代了原文剧情

## Comments

实现摘要：

- 定时脚本 `deploy/story-sync.sh`（POSIX sh，在主机上由 cron 运行）：`corpus/SCTranslationData` 存在时 `git pull --ff-only`（日志里记一行「更新到 提交（日期）：N files changed」），不存在时 `git clone --depth 1`；然后 `docker compose exec -T -e PYTHONUNBUFFERED=1 backend eidolon story sync`。输出追加到 `logs/story-sync.log`（`EIDOLON_SYNC_LOG` 可改，`/logs/` 已加入 `.gitignore`），每次以「==== 开始同步剧情库」开头、以「==== 结束：退出码 N（含义）」结尾。用 `flock` 防止和还在跑的上一次（首次全量补齐）重叠。默认用 `docker-compose.prod.yml`，设置了 `COMPOSE_FILE` 时用它。应用里不调用 git。
- 退出码：0、1、2 沿用 `eidolon story sync`（完全成功 / 配置错误或向量化中断 / 镜像出错、汉化版已导入）；脚本自己的：3 git 没能更新 SCTranslationData（有已下载的数据时照常同步，同步出错时仍以 1、2 为准），4 后端容器没有运行或无法运行同步命令，5 上一次同步还没结束。
- 缓存目录：保留在 `eidolon-data` 卷里的 `/data/mirror`，不另外挂载。它本来就在命名卷里，升级、重建容器都保留（已实测）；改成 `./corpus/mirror` 这样的主机目录时，docker 会以 root 身份创建 `corpus/`，之后脚本以普通用户克隆 SCTranslationData 会失败，也要处理文件属主。需要删某个缓存文件时用 `docker compose exec backend rm /data/mirror/...`（写进了 deploy.md）。compose 只改了挂载的注释。
- 对照表：02 加的 `./deploy:/deploy:ro` 已经满足，没有再改。
- `docs/deploy.md`：「导入剧情库」改为「同步剧情库」：首次手动运行脚本（约一到两小时、可中断续跑）、「每周自动同步」（crontab 一行、权限要求、日志位置、`grep '结束：'` 看最近结果、退出码表）、「缓存与手动导入」（缓存位置、删缓存文件、手动 `import-csv` / `import-json` 作为备用）。升级、备份两节补上缓存、对照表和日志的位置。三份 README 的部署链接说明改为提到每周同步。

本地走通（2026-09-26，本机 dockerd + 生产 compose）：

- 环境限制：没有对话模型，后端正常启动时的模型检查过不去，所以用一个 override 把后端的启动命令换成 `sleep infinity`（同步走的是 `docker compose exec`，与启动命令无关）；向量化用本机的假 `/embeddings` 服务（`SILICONFLOW_BASE_URL`），镜像走真实的 ShinyColorsDB；构建镜像时本机代理拦了 NLTK 数据的下载，测试镜像跳过了这一步（同步不用 NLTK）。SCTranslationData 用本地的上游仓库，只含櫻木真乃，第一次提交里去掉了 `【ほわっとスマイル】櫻木真乃`。
- 第一次运行（当时脚本还会把 `--idol 1` 传给同步命令，审查后去掉了，见下）：汉化版新增 214 段；原文剧情下载 72 个剧本、新增 72 段，其中 `【ほわっとスマイル】` 的 5 段是 json、没有中文、出处和标题是卡名和剧情标题；退出码 0。
- 上游提交这张卡的 5 个 CSV 后再运行：脚本 git pull 到这 5 个文件，汉化版「更新 5 段（其中 5 段取代了原文剧情）」，这 5 段变成 csv、每行带中文，剧情目录里仍在 `【ほわっとスマイル】櫻木真乃` 下，剧情总数不变（286）。
- `--force-recreate` 重建容器后再运行：0 下载、0 向量化（缓存和数据库都在卷里）。
- 失败路径：后端的代理指向不存在的端口 → 2（日志里有镜像错误，汉化版照常导入）；git 远端不可用 → 日志里有 git 的错误并用已有数据同步，同步成功时 3；后端停止 → 4；同步进行中再运行 → 5；缺少人设文件 → 1。删掉 `corpus/SCTranslationData` 后在 `env -i`（cron 那样的精简环境）下从别的目录运行，脚本克隆了真实的 SCTranslationData。

没有做的：真实的 cron 调度（脚本在精简环境下的行为已验证）、全量首次补齐的实际用时（沿用 01–03 的估计）。

代码审查（/code-review）后的修改：

- 去掉把额外参数传给同步命令：参数写错时 argparse 以 2 退出，会被记成「镜像出错」。试同步改为直接 `docker compose exec backend eidolon story sync --idol 1`（写进了 deploy.md）。
- `docker compose ps` 的错误不再丢掉（例如 cron 用户没有 docker 的权限），原因会写进日志；找不到 `flock` 时报 4 并说明，而不是被误报成 5；锁文件固定为 `logs/story-sync.lock`，不再跟着 `EIDOLON_SYNC_LOG` 走。
- `corpus/SCTranslationData` 存在但不是 git 仓库时，日志里说明并提示删掉它，不再每周尝试克隆失败；`rev-parse` 失败也算 git 失败。
- 脚本头注释、日志里的含义和 deploy.md 的退出码表措辞统一（2 是「镜像或 API 出错」，「重新运行即可继续」只指向量化中断）；deploy.md 补上 git 与 flock 的依赖和 root cron 下 git 的 `dubious ownership`。
- 改动后在同一套本地 compose 上以 `env -i` 重跑：同步进行中再运行 5；同步中途被杀（exec 以 143 结束）4；后端停止 4；`corpus/SCTranslationData` 换成普通目录时日志说明「不是 git 仓库」并继续，连数据也没有时 3。去掉 `--idol` 后正常结束（0）要跑一次全量同步，这次没有跑完；成功路径除变量改名外没有变化，审查前已验证。

留给后续的注意点（审查中提出、有意不改）：

- `docker compose exec` 自身出错时也可能返回 1，和同步命令的 1 混在一起；运行前已检查容器在运行，剩下的窗口很小，日志里有 docker 的错误信息。
- 同步以 1、2 结束时，git 同时失败只写在日志里，退出码以同步为准。
- 退出码的含义在脚本（头注释和 `finish`）与 deploy.md 各写一份：脚本不依赖文档，文档要给没有打开脚本的管理员看。
