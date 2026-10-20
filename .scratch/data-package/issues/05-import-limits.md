# 05: 导入的防滥用上限

**What to build:** 导入有三道上限，用户碰到时各看到一句清楚的提示：数据包超过 200 MB 时马上被告知太大了（不等传完），并提示可以不带照片重新导出；同一时间已经有一个导入或导出在进行时，第二个被告知正在进行；当天（北京时间）已经成功导入 3 次时，被告知几点以后可以再导。见 `../spec.md` 导入接口里的「上限」和「网络这一路」里的 Caddy 一条。

**Blocked by:** 01

**Status:** done

- [x] 后端边读请求体边数字节，超过 200 MB 立刻回 413；请求头的 `Content-Length` 已经超了的，一开始就回 413。`manifest.json` 和 `data.json` 解压后各自也有上限，超了按 `broken` 处理
- [x] Caddy 只给导入这一个地址加 `request_body max_size 200MB`，别的不动；部署文档写明自己配反向代理的部署者也要放开这个地址
- [x] 同一位用户同一时间只能有一个导入在跑，第二个回 409、错误码 `busy`；导出也一样（导出不限次数）。用进程里的按用户的锁
- [x] 每天（北京时间，用 `affinity.day_of` 划天）最多成功导入 3 次：只有成功的才算，全部去重、什么也没新加的也算；坏包、太大、`too_new`、`busy` 不算。超了回 429，带 `retry_at`（下一个北京时间 0 点），照现有的 `OverLimit` 回法
- [x] 记次数的新表按用户记每次成功导入的时间，登记进用户数据，删用户时一起删；后台不显示
- [x] 200 MB、3 次写成常量，不进后台配置
- [x] 前端：太大（前端选文件时就能按文件大小先拦一次）、`busy`、次数用完（带几点）各一句提示，放进票 01 的纯函数模块，有 vitest
- [x] 后端测试（走对外接口，上限在测试里调小，不造真的 200 MB）：超过上限回 413 且什么也没写；第二个并发导入回 409；第 4 次成功导入回 429 并带下一个北京时间 0 点，过了 0 点又能导；失败的导入不占次数；删用户后导入次数表里没有他的行
- [x] 受影响的测试和类型检查通过（`scripts/affected-tests.sh`），CI 绿

## Comments

### 票 01 交接

- 导入路由（`data_package_api.import_data_package`）现在边读 `request.stream()` 边写临时文件，没有计数：在那个循环里数字节、超了回 413；`Content-Length` 先查一次。
- 失败文案在 `zh.ts` 的 `copy.settings.dataPackage.failures`，按后端回的 `code` 取（`ApiError.code`，`importFailureMessage`）；`busy`、太大、次数用完照这个加。429 的 `retry_at` 已由 `api.ts` 的 `json()` 拼进 message，但 `importFailureMessage` 认得 `code` 时会换掉它，次数用完那句要自己带时刻。
- 导出目前不限并发；锁加在 `DataPackages` 外面还是里面自己定。

### 实现说明（票 05）

- 后端 `data_package.py`：常量 `MAX_PACKAGE_BYTES`（200 MiB）、`MAX_MANIFEST_BYTES`（64 KB）、`MAX_DATA_BYTES`（200 MiB）、`IMPORTS_PER_DAY`（3）；异常 `TooLarge`、`Busy`、`ImportsUsedUp(retry_at, now)`。`DataPackages.one_at_a_time(user_id)` 是进程里按用户的锁（导入、导出共用），`check_imports_left(user_id)` 查今天还有没有次数。新表 `data_package_imports(user_id, at)`，成功导入时在同一个事务里记一行，顺手删掉这位用户前几天的行；登记进 `database.USER_DATA`。`_unzipped` 按上限读 `manifest.json`、`data.json`，超了是 `broken`。
- `data_package_api.py`：先看 `Content-Length`，再拿锁、查次数，再边读边数字节。错误码：`too_large`（413）、`busy`（409）、`used_up`（429，带 `retry_at` 和 `Retry-After`，形状照 `app.over_limit`）。
- 前端：`ApiError` 多了 `retryAt`（429 的 `retry_at`）；`dataPackage.ts` 的 `MAX_PACKAGE_BYTES`，`readManifest` 文件超了直接回 `too_large`；`importFailureMessage(error, timeZone?)` 认 `too_large`、`busy`、`used_up`（几点按这台设备的时区写 HH:MM），没有错误码的 413（反向代理挡下的）也当太大。
- `deploy/Caddyfile` 只给 `/api/account/data-package` 加 `request_body max_size 201MiB`；`docs/deploy.md` 写了自己配反向代理的要放开这个地址；格式说明加了「大小」一节。
- 判断题：
  - 「200 MB」按 200 MiB（200×1024×1024）算，前后端一致；Caddy 放到 201MiB、比后端略宽，让超了的请求由后端回带 `too_large` 的 JSON，提示能说清楚。
  - 429 没有沿用 `OverLimit`（它绑着每小时用量的种类和文案），另开 `ImportsUsedUp`，回法一样，多一个 `code`。审查提过可以复用，没改。
  - 导出的锁只罩住生成临时文件这一段，下载流出去时已经放开。
  - 「全部去重也算一次」在测试里用同一份包导三次覆盖。
- 审查后已修：流式超限的测试补上「什么也没写」；失败不计数的测试去掉重复的一行；导出路由的清理并成一处；锁改名 `one_at_a_time`；前端 413 无错误码也给太大的提示。只报告、没改的：200 MB 这个数散在前后端常量、文案、Caddyfile 和文档里；`_TOO_LARGE`、`_BUSY` 和 `zh.ts` 的文案重复（`_BROKEN` 原来就这样）；`DataPackages` 同时管格式、锁和次数；生产上 Next 代理流式转发可能不带 `Content-Length`，早 413 那条大概只在直连时生效，实际靠边读边数。
- CI 上 `test_call_turns.py::test_what_is_said_before_the_character_speaks_joins_the_turn` 连红三次（本机全量通过）：慢的 runner 上她的第一次回复还没开始、用户就接着说了，第二次回复取走了脚本里的第一条。和数据包无关，把这条测试的第一次停顿和模型延迟放宽（0.3 s、0.6 s）修掉。
