# 08: 运行记录：文字回合，以及看板的健康和用量

**What to build:** 每个文字回合留下一条运行记录，细到其中每一次服务调用；对话以外的服务调用（例如提炼记忆）也记。后台的「看板」页按服务显示调用次数、出错率和延迟（自带密钥的调用单独统计），以及活跃用户、回合数和趋势、每位角色的回合数、回合结果分布、到开口的时间；可选 24 小时、7 天、30 天、90 天。运行记录保留 90 天，删除用户时断开与他的关联。通话在 09 里接上。见 `../spec.md` 的「运行记录」「看板与单价」两节和 GLOSSARY「运行记录」「看板」。

**Blocked by:** 01

**Status:** resolved

- [x] 新增两张表：运行记录（种类、用户、角色、开始时间、结果、到开口的时间；通话的字段先留好）和服务调用（所属运行记录可为空、服务、提供方、模型、是不是自带密钥、成败和出错类别、延迟、计费用量和单位）。
- [x] `database.py` 的用户数据登记新增「删除用户时匿名化」一类：运行记录的用户字段置空，其余不动。
- [x] 文字回合的结果按 GLOSSARY 判定：成功、失败、被拒绝（撞限额）、用户离开；判定与限额的计入、退还用同一个判断，不另写一套。
- [x] 埋点：扮演角色的 LLM、判断模型、向量化、重排、提炼记忆的 LLM、向量化记忆。判断模型和重排出错而回合成功时也要记下出错。
- [x] 计费用量：LLM 记输入、输出 token（OpenAI 兼容协议的流式请求带上 `stream_options.include_usage`；Anthropic 协议从响应里读）；其他服务按各自收费的单位记；拿不到时记为未知。
- [x] 保留期：运行记录和服务调用满 90 天删除，和 `usage` 表的清理放在同一处；`usage` 表本身不变。
- [x] 看板接口：给定时间范围，返回聚合好的数字和时间序列（按服务的健康、按结果的回合分布、活跃用户、回合趋势、按角色、自带密钥占比、到开口时间的分位数）。前端不做聚合。
- [x] 前端「看板」页（后台默认页）：时间范围切换；健康表（每项服务一行，部署者和自带密钥分开）；用量的数字和趋势图；按角色的用量；遵循 dataviz 技能和 Astryx 规则。格式化逻辑写在 `lib/` 里并有单元测试。手机上能看。
- [x] 测试（HTTP API + `FakeClock` + fakes）：驱动成功、失败、撞限额、离开的回合后，看板数字正确；判断模型出错但回合成功时健康数据里能看到这次出错；自带 LLM 的调用单独统计；时间范围的边界；推进 90 天后记录被清掉；删除用户后看板数字不变、记录里不再有他的用户 ID；响应里没有任何对话内容。

## Comments

**实现**（2026-10-07）：两张表在 `backend/src/eidolon/activity.py`（`activity_records`、`service_calls`；通话用的 `call_id`、`duration_s`、`end_reason` 已留好），`ActivityLog` 挂在 `Backend.activity` 上。回合的结果和限额的计入、退还是同一个判断：`backend/src/eidolon/turn_outcome.py` 的 `TurnOutcome`（仿 `CallOutcome`），`app.py` 的文字回合只经过它；输入为空或太长的回合记为「被拒绝」，自带密钥无法解密的记为「失败」。埋点是薄包装：`turn_llms`（扮演角色、提炼记忆，每个回合包一次，自带的标 `own_key`）和 `metered_retrieval`（判断模型、向量化、重排，在 `build()` 里包一次）。服务调用通过上下文变量挂到当前回合下；提炼记忆在 `memory.py` 里以 `detached()` 的上下文起任务，所以单独记。计费用量由各客户端调 `billing.bill()` 报告：OpenAI 兼容协议带 `stream_options.include_usage`，Responses 读 `response.completed`，Anthropic 读 `message_start` / `message_delta`（输入含缓存读写），硅基流动的向量化和重排、Jev 和 Cloudflare 读返回里的 token；拿不到就记为未知。出错只记类别（`error_kind`），不记服务返回的原文。提供方一律记服务所在的主机名。保留 90 天：每个回合开始时删掉更早的，与 `usage` 表清理的时机相同。看板接口是 `GET /api/admin/dashboard?range=24h|7d|30d|90d`（`backend/src/eidolon/dashboard.py`），趋势按浏览器的 `X-Timezone` 对齐到整点或零点。前端是 `frontend/src/components/admin/AdminDashboard.tsx` 和 `TurnTrendChart.tsx`，格式化在 `frontend/src/lib/dashboard.ts`。

偏离：删除用户时，运行记录的 `user_id` 置空，同时写入一个每位被删除用户各自随机生成的 `anonymous_id`（`database.ANONYMIZED_USER_DATA`）。否则「活跃用户」这类去重计数在删除后会变小。
