# 架构加深（第六轮）：部署者的服务只经租约拿到，租约带着「这是哪个模型」和计量

Status: resolved

术语以 `GLOSSARY.md` 为准，本轮不改词表。设计词汇（module、interface、seam、adapter、depth、leverage、locality）取自 `codebase-design` skill。这是 2026-10-07 架构审查里的候选 2，经 grilling 定下设计。只改 `backend/` 和 `docs/deploy.md`。

第五轮（`architecture-deepening-5`）把放行与收尾收进了 `Admissions`，`Admission` 成了 `turn_llms` 唯一的调用方。这一轮接着把「这是哪个模型」和计量挪到造客户端的地方。

## Problem Statement

- **记下的模型和实际用的客户端出自两次读取。** `Admissions._admit` 先经 `OwnKeys` 取部署者的租约（客户端），再另调 `deployer_llms()` 读生效配置里的模型名去套计量。文字回合的接口是同步路由，跑在线程池里；后台保存（`_write` 改了覆盖，再 `apply` 换客户端）在事件循环上。两次读取之间换了模型，运行记录里的模型就和实际回答的那个对不上。判断模型也一样：`LiveRetrievalJudge` 和 `LiveConfig.lease` 里的情绪判断，都是先拿判断模型的客户端，再另读 `judge_settings` 记 origin、另读 `judge_thresholds` 算阈值。阈值按模型的 family 定，所以换判断模型的那一刻，旧客户端可能按新模型的阈值判断。
- **自带 LLM 的描述多读一次数据库。** `OwnKeys.for_turn` / `for_call` 手上已经有用户的 key 记录，`Admissions` 还要再调一次 `own_keys.describe()`，只为拿 `base_url` 和 `model` 去算 origin。
- **测试绕过了 `LiveConfig`。** `build()` 收 `chat_llm`、`background_llm`、`retrieval_judge`、`emotion_judge`，`LiveConfig` 为此留了 `owned=False`、`live_judge`、`live_emotions` 三个分支。`make_client` 每次都传 `chat_llm`（261 处、38 个文件）；约 60 处传 `retrieval_judge`，传的是直接回答 `Need` 的 `FakeJudge`，所以 `LiveRetrievalJudge` → `ModelRetrievalJudge`（按概率和阈值判定）整段被跳过，计量的 origin 也被固定成 `.env` 的（没配判断模型时记成 `unknown`）。传 `emotion_judge` 的那条路（`Backend.emotions`、`Calls` 的 `emotions` 参数、`call.py` 里 `keys.emotions or self._emotions` 的回退）只为测试存在。上面两条出 bug 的地方，测试正好都没走到。
- **判断阈值的覆盖按模型名绑定，阈值本身按 family 定。** 后台设的判断阈值存了 `FOR_MODEL = 原始模型名`，`_bound_holds` 按原始名比较。`.env` 里把 `typesafe/jev-1.13` 改成 `jev-1.13`，或者升级到 `jev-1.14`，覆盖都会被标为「为别的模型设的，没有生效」，可预设阈值按 `judge_family` 查，这几个名字查到的是同一组。后台换判断模型时，`_changed` 也是名字一变就清掉阈值覆盖。另外，没校准过的判断模型，每次读 `judge_thresholds` 都打一条 warning，也就是每个回合至少一条。

## Solution

谁造客户端，谁计量；客户端和它的身份成对存放、成对交出。

- `Swappable` 存「客户端 + 它的 settings」这一对，换的时候在同一把锁下一起换。`LiveConfig.lease()` 交出的扮演角色、提炼记忆、情绪判断的客户端都已经套好计量，origin 和判断阈值都按租约里那份 settings 算。检索的判断模型每问一次取一次租约，也一样。
- 用户自带的 LLM 由 `OwnKeys` 在造客户端时套上计量。`turn_llms` 删掉，`Admissions` 不再碰「哪个模型」。
- 测试改为配置 `FakeServiceClients`，所有部署者的客户端都经 `LiveConfig` 造出；`build()` 去掉那四个参数，`LiveConfig` 去掉为测试留的分支。
- 判断阈值的覆盖按 family 绑定，换到别的 family 才失效、才清掉。

## User Stories

1. 作为管理者，我想看板上每次服务调用记下的模型，就是实际回答这次调用的那个模型，即使后台恰好在这个回合开始时换了模型。
2. 作为管理者，我想检索和情绪判断用的阈值，始终是实际作答的那个判断模型的阈值。
3. 作为管理者，我想 `.env` 里只是把判断模型的写法从 `typesafe/jev-1.13` 改成 `jev-1.13`，或者升级到同一 family 的新版本时，后台设的判断阈值继续生效。
4. 作为管理者，我想在后台把判断模型换成同一 family 的另一个版本时，阈值覆盖保留；换到别的 family（jev → clef）时才清掉。
5. 作为管理者，我想判断模型换到别的 family 后，后台照旧把旧的阈值覆盖标为「覆盖已失效」，并说明是为哪个模型设的。
6. 作为部署者，我想用了没校准过的判断模型时，日志在它生效时提醒一次，而不是每个回合都打一条。
7. 作为部署者，我想进行中的通话里，哪些值按接通时、哪些按回合取，和现在一样（README「后台」一节、`docs/deploy.md`）。
8. 作为用户，我想限额、回合、通话、检索和情绪判断的行为都和以前一样。
9. 作为开发者，我想部署者的客户端只有一条来路（`ServiceClients` → `LiveConfig` → 租约），测试和生产走同一条。
10. 作为开发者，我想加一项能热替换的服务时，不用再给 `build()` 加参数、给 `LiveConfig` 加「传进来的不归我关」的分支。
11. 作为开发者，我想检索和情绪判断的测试经过 `ModelRetrievalJudge` / `ModelEmotionJudge` 和阈值，而不是让假件直接给出结论。
12. 作为开发者，我想 `Admissions` 只管放行与收尾，构造时不再收「读取部署者模型」的 callable。

## Implementation Decisions

### 租约自带身份和计量（ticket 03）

- **`Swappable`** 存「客户端 + 它的 settings」。`replace(client, settings)` 在同一把锁下一起换；`Lease` 交出这一对。`aclose`、按租约数关闭旧客户端的规则不变。
- **`LiveConfig.lease()`**：
  - 扮演角色和提炼记忆的客户端按各自租约里的 `LLMSettings` 套上计量（`llm_origin("chat_llm" / "memory_llm", settings)`）。记忆模型跟随扮演模型时（`chat.again()`），用扮演模型的那份 settings，服务名记为 `memory_llm`。
  - 情绪判断：origin 和情绪阈值都按判断模型租约里的 `JudgeSettings` 算（阈值覆盖照旧叠上去，见下面 02 的绑定规则）；超时照旧读 `effective(JUDGE)["emotion_timeout"]`。
  - `LiveConfig` 的 `activity` 改为必填。
- **`LiveRetrievalJudge`**：每问一次取一次判断模型的租约，origin 和阈值都按租约里的 settings 算。
- **试调不计量**：`check_chat_llm(current)`、`try_judge_model(current)` 用的是 `Swappable` 里的裸客户端，不记服务调用。
- **自带 LLM**：`OwnKeys` 在 `_llms` 造 `_OwnLLM` 时按 key 记录里的 `base_url` / `model` 套上计量（`own_key=True`），扮演和记忆各记各的服务名，和现在 `turn_llms` 的结果一致。`OwnKeys` 构造时多收一个 `ActivityLog`。
- **删掉** `activity.turn_llms`、`Admissions` 构造参数里的 `deployer_llms`、`_admit` 里重读 `own_keys.describe()` 的那一步。放行的顺序变成：取 key → 开运行记录 → 占次数；`Admission.llms` 就是 key 里已计量的 LLM。`Admission.own_llm` 改由 `OwnKeys` 给出（`TurnKeys` / `CallKeys` 带上是否自带 LLM）。
- **按回合读的值不进租约**：历史回合数、重排阈值、限额照旧按回合读；单次通话上限照旧由 `Calls.start` 在接通时读一次。

### 判断阈值按 family 绑定（ticket 02）

- `FOR_MODEL` 照旧存原始模型名（后台显示「为 X 设的」用它），数据库里已有的覆盖不用迁移。
- `_bound_holds` 对判断阈值改为：两边都有 family 时按 family 比；任一边没有 family 时按原始名比。重排阈值的绑定不变（`KNOWN_THRESHOLDS` 本来就按原始名查）。
- `_changed`：后台换判断模型时，只有绑定不再成立（换到别的 family，或没有 family 的模型换了名字）才清掉判断阈值覆盖。
- **warning**：没校准过的判断模型，在它生效时提醒一次（启动时、后台保存或恢复判断模型时），读阈值时不再提醒。
- 改 `docs/deploy.md:382` 的说法。ADR-0013 没写阈值，不改。

### 测试经 `FakeServiceClients` 走生产路径（ticket 01）

- **`build()`** 去掉 `chat_llm`、`background_llm`、`retrieval_judge`、`emotion_judge`。`.env` 的记忆模型也经 `clients.memory_llm` 造（不再在 `build` 里直接 `open_llm`）。
- **`LiveConfig`** 去掉 `chat_llm` / `background_llm` 构造参数、`owned=False`、`live_judge`、`live_emotions`：配了判断模型就一律由它造、由它判断情绪。`Swappable` 的 `owned` 参数随之删掉。
- **删掉** `Backend.emotions`、`Calls` 的 `emotions` 参数和 `keys.emotions or self._emotions` 的回退；`metered_retrieval` 不再管判断模型（嵌入和重排不是热替换的，照旧在那里套计量）。
- **假件**：
  - `FakeServiceClients` 能接收测试指定的扮演、记忆、判断模型假件，按 key 记录每次请求。
  - 判断模型的假件在 `JudgeModel` 这一层按剧本作答：给定 `Need`，或者按段排好的情绪答案（含失败、`HANG`），答出 1.0 / 0.0（或剧本里给定的）概率，让 `ModelRetrievalJudge` / `ModelEmotionJudge` 按阈值得出同样的结论；记下每次被问到的内容。
- **`make_client` 保留简写**：`make_client(retrieval_judge=..., emotion_judge=..., background_llm=...)` 照旧可用，在内部接到 `FakeServiceClients` 上，传了判断模型时给 settings 配一个 jev 的判断模型（jev 的阈值和兜底值相同，判定结果不变），再调用不带这些参数的 `build()`。上百处调用处不动。`Turns.take`、`CallUnderTest` 同理。
- **要改的断言**（只改写法，不改要验证的事）：
  - 约 8 处断言 `FakeJudge.asked` / `.segments` 的，改为断言判断模型被问到的内容；
  - `test_call_turns.py:250, 309` 逐条比较消息列表的，滤掉 emotion 消息（配了判断模型后通话会判断情绪）；
  - `test_live_config_services.py` 里区分 `.env` 的记忆模型和后台换上的记忆模型的 3 处，改为按 key 断言；
  - `CallUnderTest` 不再读 `backend.emotions`，改用 `admission.keys.emotions`。
- 只测某个 module 本身的单元测试（例如直接测 `Retrieval`、`EmotionJudging` 的）可以继续用 `FakeJudge` 这类协议层的假件；只有经 `build()` 的测试必须走 `FakeServiceClients`。

### 文档

- `docs/deploy.md:382`：判断阈值的覆盖跟着判断模型的 family 走（02）。
- README、ADR、`GLOSSARY.md` 不改。

## Testing Decisions

- **好的测试**经由 module 的 interface 断言可以观察到的结果：运行记录里的服务调用（服务、提供方、模型、是否自带）、判断的结论、后台显示的状态、日志。不检查内部状态。先写会失败的测试（`/tdd`），再改实现。
- **01** 是保持行为不变的重构：除了上面列出的断言写法，现有测试全部照旧通过；`test_assembly.py` 补一条「配了判断模型时，检索和通话的情绪判断都经 `LiveConfig` 造的判断模型作答，阈值是生效的阈值」。
- **02**：在 `test_live_config*.py` / `test_judge_thresholds.py` 里补：
  - `.env` 的判断模型在同一 family 内换名字或版本，覆盖仍生效（`describe()` 为 `overridden`，判断用的是覆盖的阈值）；换到别的 family，标为 `failed` 并说明为哪个模型设的；
  - 后台换判断模型：同一 family 保留阈值覆盖，别的 family 清掉；
  - 没校准过的模型：生效时 warning 一次，跑几个回合不再增加。
- **03**：
  - 后台换扮演模型后发一个回合：运行记录里的服务调用记的是新模型；换之前取了租约的回合（例如进行中的通话），记的仍是旧模型，和实际作答的客户端一致（`FakeServiceClients` 按 key 区分）。
  - 换判断模型（换 family）后：检索判断记的是新模型、用新模型的阈值；进行中的通话的情绪判断仍按接通时的模型和阈值。
  - 自带 LLM 的回合：服务调用记为自带、记的是用户的 `base_url` 主机和模型，不再读 `describe()`（不需要断言这一点，删掉调用即可）。
  - 后台试调新模型不留服务调用。
  - 跨线程的交错没法确定性地复现，不为它写测试；结构上，身份和客户端出自同一个租约就排除了它。
- `test_admission.py`：`Admissions` 不再收 `deployer_llms`，放行时也不再有「准备」这一步（读描述、套计量都挪走了），所以靠 `deployer_models_broken` 触发准备阶段出错的两个用例（约 203、273 行）随之删掉。取 key 之后、占次数之前出错时收回租约、留记录的规则不变，由其余用例和 `test_call.py` 里「交给 pipeline 之前出错」的接线测试覆盖。
- `backend/` 下 `pytest` 全部通过，`ruff` 和 `pyright` 没有新的报错。

## Out of Scope

- 价格键和价格目录对模型名的归一化（服务于看板计价，和租约无关）。
- 候选 5（每个配置项自带定义、校验和状态），只带上判断阈值绑定这一处。
- 历史回合数、重排阈值、限额放进租约：文档写明它们按回合取新值。
- 候选 3（回合结果在一处判定）、候选 4（启动检查只看生效的值）、前端、所有 HTTP 响应。
- 嵌入和重排的计量（不是热替换的，`metered_retrieval` 照旧）。

## Further Notes

- 分支 `architecture-deepening-6`（从合并了第五轮的 main 开出）。
- 分两波：第一波 01 和 02 并行，第二波 03（依赖 01）。每次会话只做一波。
- 人工验收清单见各张 ticket。
