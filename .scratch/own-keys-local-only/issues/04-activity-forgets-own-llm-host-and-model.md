# 04: 运行记录不再记自带 LLM 的服务地址和模型名

**What to build:** 服务器的运行记录里，自带 LLM 的服务调用不再记下服务地址的主机名和模型名，改记一个固定的通用值。上线时，数据库迁移把已有记录里属于自带 LLM 的这两列也改成这个通用值。这样服务器不会知道用户用的是哪一家、哪个中转。逻辑上这张票跟其他票无关，排在 01 后面只是因为两者改的是同一个模块。

**Blocked by:** 01

**Status:** done

- [x] 自带 LLM 的服务调用记录里，主机名和模型名是一个固定的通用值；部署者的调用照旧记真实的主机名和模型名。
- [x] 数据库迁移把已有的、属于自带 LLM 的调用记录的这两列改成通用值，部署者的记录不动。迁移可以重复执行。
- [x] 看板的健康统计（按「服务 + 是不是自带」分组）、后台用户页的用量拆分、费用估算的结果都不变。
- [x] 后台单价页列出「最近用过的模型」时，不会把这个通用值当成一个未设单价的模型列出来。
- [x] 测试：一个回合用了自带 LLM 后，运行记录里查不到它的主机名和模型名；迁移把旧记录改掉；单价页不列出通用值。

## Comments

### 实现（2026-10-10）

- 通用值是 `activity.OWN = "own"`，主机名（`provider`）和模型名两列都记它。
- 只改了 `activity.llm_origin`：`own_key=True` 时直接给出 `Origin(service, OWN, OWN, own_key=True)`，不看 `base_url` 和 `model`。`own_keys.py` 一行没动（`OwnKeys._llms` 照旧调 `llm_origin(..., own_key=True)`），免得跟 02 冲突。部署者的 LLM（`live_config` 里不带 `own_key`）照旧记真实主机名和模型名。自带语音识别、合成本来记的就是固定的服务商地址，不动。
- 迁移是 `activity._forget_own_llms`，在 `ActivityLog` 打开数据库时、`_let_latency_be_unknown` 之后跑：`UPDATE service_calls SET provider = 'own', model = 'own' WHERE own_key = 1 AND service IN ('chat_llm', 'memory_llm') AND (provider != 'own' OR model != 'own')`。只碰自带 LLM 的行，每次启动都跑，已经改过的不再改，可以重复执行。
- 看板健康统计按 `(service, own_key)` 分组、用户页用量拆分看的是 `activity_records.own_keys`、费用估算和单价页的 `prices.used` / `unpriced` 本来就先滤掉 `own_key` 的调用，都不依赖这两列，没改。
- 测试：
  - `test_own_keys.py::test_a_turn_that_brings_an_llm_runs_on_it_for_both_and_does_not_count` 原本就断言回合用自带 LLM 后记下的 `provider`、`model`，期望值从真实主机名、模型名改成 `OWN`。按 CODING_STANDARDS「Same path, another file」，不在 HTTP 层再查一遍数据库。
  - `test_activity_records.py` 新增 `test_a_database_from_before_forgets_the_hosts_and_models_of_users_own_llms`：往库里写旧的自带 LLM 两条、部署者 LLM 一条、自带语音合成一条，开两次后端，每次都只有前两条变成 `own`。
  - `test_cost_estimate.py::test_usage_on_users_own_keys_is_shown_but_never_priced` 追加断言：单价页的 `unpriced` 为空、`prices` 里没有 `own / own`。这条在实现前就能过（`used` 本来就滤掉自带的），留着防以后改坏。
- 后端完整测试 1147 条通过；ruff、pyright 干净。第一次完整跑卡在 `test_bailian_stt.py` 的第一条（显示 F 后没有输出、也没打出调用栈，550 秒超时），单独跑这个文件 21 条全过，重跑完整测试也全过，判断是并行负载下的偶发，跟这张票无关。

### 人工验证

1. 部署前先在服务器上看一眼旧记录：`sqlite3 <数据库> "SELECT DISTINCT service, provider, model FROM service_calls WHERE own_key = 1"`，应能看到真实的主机名和模型名（如果有人用过自带 LLM）。部署、重启后再跑一次，自带 LLM 的行只剩 `own | own`，自带语音的行和 `own_key = 0` 的行不变。
2. 用一个填了自带 LLM 的账号发一个回合，再跑上面的查询，新记录也是 `own | own`。后台看板「自带」那一行的调用数照常增加，单价页「未设单价」里没有 `own`。

### 人工验证通过（2026-10-10）

用户用构建版前端加本地后端按清单验证，没有问题。
