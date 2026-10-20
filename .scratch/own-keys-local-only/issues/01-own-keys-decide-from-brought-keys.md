# 01: 先重构：自带密钥模块按「这次带来的 key」做决定

**What to build:** 为后面两张票铺路，这张票不改变任何行为。自带密钥模块决定一个回合或一次通话用谁的服务、免不免计入限额时，不再自己按用户去数据库查，而是接收一个「这次请求带来的自带密钥」值对象（llm、tts、stt 三项都可以没有，字段见 spec）。调用方暂时仍从数据库读出 key、解密，组装成这个值对象传进去。这样 02、03 只需要把值对象的来源换成请求体。

**Blocked by:** None (can start immediately)

**Status:** done

- [x] 有一个表示「这次请求带来的自带密钥」的值对象，llm、tts、stt 三项都可以为空，stt 包含服务商和（百炼的）地域。
- [x] 回合和通话决定用谁的服务、是否免计入，只看这个值对象和部署者的 key，不再访问数据库。
- [x] 从数据库读 key、解密、组装值对象是单独的一步，由回合和通话的准入调用。「解不开」的失败照旧在这一步抛出，回合 409 和通话预检 409 的行为不变。
- [x] 自带密钥模块的测试改成按「带来了哪几项」来写：只带 llm、三项全带、只带语音、部署者没有某项而用户带了、百炼带地域、自带的失败了不回退到部署者的。
- [x] 后端全部测试和类型检查都通过，HTTP 层的现有测试不用改。

## Comments

### 实现（2026-10-10）

- 新值对象 `own_keys.BroughtKeys`：`llm`（`OwnLLMSettings`，含 `protocol`）、`tts`（Fish 的 key）、`stt`（`SttKey`，含服务商和百炼的地域），都可以为 None；`services` 给出带了哪几项。
- `OwnKeys.for_turn(brought)` / `for_call(brought)` 只看这个值对象和部署者的 key，不再碰数据库。
- 读库、解密、组装是单独一步 `OwnKeys.kept(user_id, services)`，由 `Admissions` 调用：回合只取 `("llm",)`（和原来一样，回合只解密 LLM 的 key），通话取三项。「解不开」照旧在这一步抛 `OwnKeyFailed`，仍在 `Admissions._keys` 里记成失败/没能接通，回合 409、通话预检 409 不变。`kept` 是过渡用的，06 删掉存库时一起删。
- `test_own_keys.py` 按「带来了哪几项」重写；另有 `kept` 的几条（解密、只解密要的那几项、解不开时说是哪家语音识别、旧记录算 Soniox、没设密钥时什么都不带）。「自带 LLM 失败不回退」由 HTTP 层的 `test_own_llm.py::test_a_failing_own_llm_fails_the_turn_without_the_deployers_key_or_counting_it` 覆盖，按 CODING_STANDARDS「Same path, another file」不在模块层重复。
- HTTP 层测试没改。四个直接调 `for_turn`/`for_call` 拿部署者模型的非 HTTP 测试（`test_assembly`、`test_turns`、`test_world_setting`、`test_stt_provider`）改成传 `BroughtKeys()`。

**已知的一处细微差别**（代码评审指出，判断为可接受）：用户存的 LLM key 解不开、又没有自带语音、而部署者恰好缺语音识别或合成的 key 时，通话预检原来先报 `CallsUnavailable`（什么都不记），现在先报 `OwnKeyFailed`（409，记一条没能接通）。因为 `kept` 在决定之前就解密完了。这条路径在 06 去掉存库后整个消失。

后端完整测试 1147 条通过；ruff、pyright 干净。

### 人工验证

这张票不改行为，按 08 清单打一通电话、发一个回合时顺带确认：不带自带密钥时一切照常；带了自带 LLM 的账号，设置页仍显示不计入、回合照常。

### 人工验证通过（2026-10-10）

随 08 的清单一起验证：文字回合和通话照常。
