# 07: 服务器的日志和报错不带出 key

**What to build:** 现在 key 会出现在请求体和服务器内存里，部署者看日志、转发日志时，不应该看到用户的 key；用户看到的报错里，即使服务商回显了 key，也要被遮住。设计见 spec 的「日志和报错不带出 key」一节。

**Blocked by:** 02, 03

**Status:** done

- [x] 服务启动时把 Pipecat 用的 loguru 降到 INFO 级以上，不再输出 DEBUG（这样也不再把用户的话打进日志）。
- [x] 回合中、通话中、校验时这三种自带密钥失败，在生成给用户看的原因时，把原文里出现的这把 key 替换成 `***`，再按原来的上限截断。写记忆失败时打的 warning 用的是同一条已遮掉的消息。
- [x] 请求体里的 key 一律用 `SecretStr`，repr、traceback 和校验失败日志里都不出现明文。
- [x] 泄露测试：用一把特征明显的假 key，分别跑一个成功的回合、一个服务商报错里回显了这把 key 的失败回合、一次写记忆失败、一次 key 格式不合法的请求，再加一次服务商报错回显 key 的校验。抓取 Python logging 和 loguru 的输出，断言都找不到这把 key；同时断言返回给用户的原因里，key 被替换成了 `***`。

## Comments

### 实现（2026-10-10）

- `own_keys._masked(message, api_key)`：把服务商原文里的这把 key 换成 `***`，再截到 `MAX_CAUSE_LENGTH`（300）。回合中（`_OwnLLM`，通话里的回合也走它）和三个校验（`_rejecting`）都用它。通话中自带语音失败，给用户看的是固定的「通话已结束」，不带服务商原文，没有要遮的。
- `_OwnLLM` 抛 `OwnKeyFailed` 改成 `from None`：原始异常的消息可能带 key，这样写记忆失败时 `exc_info` 打出的 traceback 里只有遮过的那条消息。`activity.error_kind` 照旧能从 `__context__` 认出失败的种类。
- 语音合成和 Soniox 的试调原来先把服务商原文截到 200 再交出去，key 跨在截断处时会留下半截；现在不先截，由 `_masked`（或后台配置页自己的 300 上限）遮完再截，所以用户看到的原因最长是 300 字，比原来的 200 长。
- `eidolon serve` 启动时 `loguru` 先 `remove()` 再只输出 INFO 及以上；`loguru` 列为直接依赖（原来只是 Pipecat 带进来的）。
- 请求体里的 key 在 02、03 已经是 `Secret`，这次没动。
- 测试：`test_own_keys_in_logs.py` 一条，用 `sk-CANARY-…` 跑成功回合（写记忆失败）、服务商回显 key 的失败回合、key 格式不合法的回合、三种校验各回显一次 key，回显的 key 正好跨在 300 字的截断处；抓 DEBUG 级的 logging 和 loguru，断言找不到 key 的前 9 个字符，给用户的原因以 `***` 结尾。
- 代码评审后：三种校验失败的 422 原来在 `test_own_llm.py`、`test_own_speech_keys.py` 各有一条，跟泄露测试走同一条路径，合进泄露测试（断言「试调失败：」加服务商原因）；`_OwnLLM` 改成自己拿 settings 打开，免得遮的 key 和用的 key 分开传。
- 评审里留着没改的：
  - `llm/sse.py` 在交出报错前会先把响应原文截到 500 字。只有同一条报错里把 key 重复好几遍、遮完缩短了两百多字，截下的半截才可能落进前 300 字，实际碰不到。
  - 启动时 loguru 只输出 INFO 没有自动化测试，在人工验证里看。
  - `test_without_a_secret_key_users_still_bring_their_own`（06）现在代码里已经没有按这个变量分支的地方，按票要求留着。

### 人工验证

用本地后端（`uv run eidolon serve`，看它的终端输出）和构建版前端：

1. 启动以后打一通电话：终端里没有 Pipecat 的 `DEBUG` 行（不再打出你说的话），`INFO` 及以上照常。
2. 设置页填一个 LLM，key 故意填成一把格式对但无效的（比如 `sk-invalid-test-1234567890`）：显示「试调失败：…」和服务商原因；如果服务商在原因里回显了 key，显示的是 `***`。终端里搜这把 key，找不到。
3. 本地存一个能用的 LLM 后，在开发者工具 Local Storage 里把它的 `api_key` 改成无效的，再发一个回合：回合以「你的LLM密钥调用失败：…」结束，终端里搜这把 key，找不到。

### 人工验证通过（2026-10-10）

用户用构建版前端加本地后端按清单验证，没有问题。
