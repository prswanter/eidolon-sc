# 19: 组装根：从 Settings 到运行中的各个 module 集中装配

**What to build:** 新建一个组装根，从 `Settings` 构建后端的完整对象图（Store、角色、对话模型、后台模型、检索、记忆、引擎、限额、通话），接受外部服务的替换，拥有「检索和记忆何时开启」的规则和关闭顺序。`create_app` 只声明路由，测试和 `eidolon serve` 都从组装根取得后端。

**Blocked by:** —

**Status:** resolved

## 背景（2026-09-26，架构体检候选 3）

`create_app` 有 8 个可选参数，里面住着装配、启用规则（「Jev + embedder + reranker 都在才开检索和记忆」）和关闭顺序；`conftest.make_client` 逐个镜像这些参数，每个 ticket 都给两边各加一个。候选 2（记忆 module）留下的遗留点：

1. 启用规则仍在 `create_app`，记忆的 HTTP 测试还得搭 Jev / reranker 假件；
2. `Clock` 在 `engine.py` 和 `memory.py` 各定义一次，`usage.py` 从 engine 导入；
3. engine 仍接受 `memory=None`，只为 `test_turns` / `test_call_turns` 手搭 engine；
4. 后台模型回退写了两遍（`app.py` 与 `config.background_from_env`）。

## Comments

### 决定（2026-09-26，grill-with-docs）

- **`eidolon/assembly.py`：`build(settings, **overrides) -> Backend`。** `Backend` 持有 `settings, store, characters, engine, usage, memories, call_starter`，`aclose()` 按顺序关闭：先记忆（让正在记下的写完），再各个模型和服务客户端，再检索的索引，最后 Store。`create_app(backend)` 只声明路由，lifespan 结束时调用 `backend.aclose()`：后端交给 app 就归 app 关闭。
- **override 只替换真正的外部服务**，以 keyword-only 参数传给 `build`：`chat_llm, background_llm, jev, embedder, reranker, clock, call_starter`。`make_client` 用 `**overrides` 原样转发，不再镜像参数。替换进来的服务由调用方关闭，组装根只关闭自己建的。
- **启用规则不拆**：Jev、embedder、reranker 都在才开检索，记忆随检索一起开（后台模型总有：单独配置或沿用对话模型）。拆成「记下只要后台模型 + embedder」会在没有 Jev 时不断记下角色永远想不起来的记忆。规则在 `build` 上按行为测一次（`test_assembly.py`）；记忆的 HTTP 测试继续用 `memory_client` 这一个配方打开记忆——要打开记忆就得打开检索，这是规则本身，不是泄漏。
- **`eidolon/clock.py`** 放 `Clock` 和 `utc_now`；engine、memory、usage、组装根都从这里导入。
- **后台模型回退**：按字段回退（`BACKGROUND_LLM_MODEL` 未设就用 `CHAT_LLM_MODEL`）留在 `background_from_env`；整槽回退（代码里构造的 `Settings` 不给后台模型）由 `Settings.__post_init__` 填成对话模型，读取方拿到的总是 `LLMSettings`。
- **CLI 只有 `serve` 走组装根。** `story import-*` 和 `character draft-sheet` 有意只要求一部分环境变量，维持现状。启动自检仍然单独开一个短命的对话模型：自检在 `asyncio.run` 的事件循环里，服务在 uvicorn 的事件循环里，httpx 客户端不能跨循环复用。
- **engine 的 `memory` 必填**，`retrieval` 仍可选（检索关闭时不提供 recall-story 工具，是真实的状态）。`test_turns` / `test_call_turns` 经 `build` 取 engine。
- **`build` 同步**，先做会失败的校验（加载角色配置），再打开 Store 和客户端，配置出错不留下未关闭的连接。
- **边界**：候选 1（回合协议）已完成，不动；候选 5（通话 module）的 `calls` 注册表、归属检查、限额退还留在 `app.py`，组装根只调用 `serve_calls(settings, engine)` 并接受 `call_starter` 替换。
- 不改 `CONTEXT.md`（组装根不是领域概念），不写 ADR（都容易撤回）。

### 实现（2026-09-26）

- `eidolon/assembly.py`：`build` / `Backend.aclose`；`eidolon/clock.py`：`Clock` / `utc_now`。
- `create_app(backend)` 只剩路由；lifespan 关闭 WebRTC 后调用 `backend.aclose()`。
- `ConversationEngine(store, chat_llm, characters, memory, clock, retrieval=None, history_turns=None)`：`memory` 和 `clock` 必填。
- `Settings.__post_init__` 把没给的 `background_llm` 填成 `chat_llm`；`app.py` 的整槽回退删除。
- `eidolon serve`：先 `build`（配置错误直接退出），再单独开客户端做对话模型自检，自检失败时关闭已构建的后端再退出。
- 测试：`make_client` 用 `**services` 转发给 `build`，结束时关闭各个后端（测试 transport 不跑 lifespan）；`test_turns` / `test_call_turns` 经 `build` 取 engine；新增 `test_assembly.py`（四个假件齐全时检索和记忆开启；缺 Jev、embedder、reranker 任一个都关闭，管理页照常；后台模型默认是对话模型），`test_shared_memory.test_memory_needs_retrieval` 并入其中。
- 验证：`pytest` 264 passed，`pyright` 0 errors；把启用规则里的 reranker 条件去掉，`test_assembly` 会失败；`eidolon serve` 在缺环境变量、缺人设、对话模型不可达三种情况下都打印原因并以 1 退出。
