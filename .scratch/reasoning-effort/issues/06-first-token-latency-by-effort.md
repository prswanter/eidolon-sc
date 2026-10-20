# 06: 运行记录记下首字耗时和思考强度，看板按档位分行

**What to build:** 管理者在看板的健康表上能看到 LLM 的首字耗时 p50 / p95，按思考强度分行，这样调档以后能看到通话开口快了多少。背景见 `../spec.md`「运行记录与看板」。

**Blocked by:** 03（设置里有了思考强度，记录才知道用的是哪一档）

**Status:** done

**难度：中。** 改表结构（启动时补两列，照现有的补列方式）、计量层记下第一条输出的时间、看板查询分组、前端健康表多两列。不碰回合和通话的逻辑，可以和 04、05 并行；但 04、05 都会让记录里出现更多档位，合并时注意。

## 已定的设计（详见 spec）

- 服务调用表加两列，都可以为空：首字耗时（毫秒）、思考强度。首字耗时只对 LLM 记，从发出请求到收到第一条文本或工具调用；思考内容不算首字。
- 不设置强度时强度列为空；看板上「不设置」单独一行。
- 现有的耗时（整段输出）不变。

## 验收

- [x] 运行记录测试（真的 `ActivityLog`、临时库）：一次 LLM 调用记下首字耗时和强度；没有任何输出就失败的调用首字耗时为空。
- [x] 迁移测试：旧表启动时补上两列，旧记录为空。
- [x] 看板测试：LLM 服务按强度分行，各行有首字耗时 p50 / p95；非 LLM 服务不变。
- [x] 前端 `dashboard` 纯函数测试：分行和新列。
- [x] 改表结构前，提醒用户按 VPS 部署的惯例先手动备份线上库。
- [x] 实测：本地构建版上发几个文字回合，看板上出现首字耗时。
- [x] `backend/` 下 `pytest`、`frontend/` 下 `npm test` 全部通过，`ruff`、`pyright`、`tsc` 没有新的报错。

## Comments

- 票 04 留下的：部署者的对话模型现在是两份（`live_config.lease` 里 `chat.client.text` / `chat.client.call`，设置在 `chat.settings.text` / `chat.settings.call`），各自包一层 `metered_llm`，`llm_origin` 拿的就是各自那份 `LLMSettings`，所以强度从 `settings.reasoning_effort` 取就能分出文字和通话。记忆模型是自己那份设置，强度也在它的 `LLMSettings` 上。
- 票 05 留下的：自带 LLM 的每次请求在 `own_keys.OwnKeys._own_llm(service, settings)` 包 `metered_llm`，`settings` 就是这次用的那份（通话的回合是 `.call`，提炼记忆是 `.text`），强度同样从 `settings.reasoning_effort` 取。`llm_origin(..., own_key=True)` 只记 `OWN`，不记地址和模型名，强度列照记不泄露什么。
- 票 06 做完：首字耗时的口径是适配器交出第一条文本或 `ToolCall` 的时刻；适配器要等工具调用的参数拼完整才交出，所以第一轮直接调工具的回合，首字约等于整段耗时，会抬高那一档的 p95（`activity._MeteredLLM` 里有注释）。看板只有 LLM 行带 `effort` 和 `first_token_ms` 两个键，非 LLM 行不变。上线前按 VPS 惯例手动备份线上库：启动时会给 `service_calls` 补两列。
