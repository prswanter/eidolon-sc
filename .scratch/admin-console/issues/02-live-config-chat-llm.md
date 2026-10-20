# 02: 生效配置与热替换：先做扮演角色的 LLM

**What to build:** 管理者在后台的「配置」页修改扮演角色的 LLM（协议、base_url、key、模型、max_tokens），保存前先试一下，试通了才保存；保存后新的回合立刻用上新配置，进行中的通话不受影响，不用重启。页面上同时显示 `.env` 的值和当前生效的值，可以恢复成 `.env` 的值。这一张只打通一项服务，验证「数据库覆盖 `.env` + 运行中替换客户端」整条路，其他服务在 03、04 里推广。见 `../spec.md` 的「配置覆盖」一节和 ADR-0013。

**Blocked by:** 01

**Status:** resolved

- [x] 新增配置覆盖表：每项一行，记值、末 4 位和更新时间；key 类的值用 `EIDOLON_SECRET_KEY` 经 HKDF 派生的 Fernet 加密（`info` 与自带密钥不同）。登记为「不是用户数据」。
- [x] 新增「生效配置」模块：启动时的 `Settings` 加上覆盖合成当前生效的配置；是后台读写配置的唯一入口；对每一项报出三种状态之一：使用 `.env` 的值、已被后台覆盖、覆盖已失效并回退到 `.env`。
- [x] 新增「按配置创建服务客户端」的工厂（LLM、语音合成、语音识别、判断模型以后都走它；本张只接上扮演角色的 LLM）。`build()` 改为通过工厂创建；测试可以注入假工厂。
- [x] 热替换：生效配置一变就用工厂建新客户端换下旧的；旧客户端等所有用到它的回合和通话结束后再关闭。每个回合开始、每次通话接通前各取一份快照，从头到尾用它。
- [x] 保存前先试：复用启动时对扮演角色模型的探测（流式、工具调用）。试不通返回原因，不保存。
- [x] 恢复成 `.env` 的值：删除这一项的覆盖，立即生效。
- [x] 启动时：对每一项覆盖试一次；试不通就这一项回退到 `.env` 的值、日志写警告、后台标为「覆盖已失效」，覆盖本身保留。日志里列出所有生效中的覆盖项。
- [x] 没有设 `EIDOLON_SECRET_KEY` 时，key 类的项只读（接口拒绝修改，界面说明原因），其他字段照常可改。
- [x] 自带密钥的路由不变：用户自带 LLM 时照常用用户的，只是「部署者的客户端」改为来自生效配置。
- [x] 后台接口：读取配置（key 只返回末 4 位）、修改某一项、恢复某一项。
- [x] 前端「配置」页：扮演角色的 LLM 一节，显示 `.env` 的值、当前生效的值和状态；编辑表单；保存中、试不通的原因、成功；恢复按钮。三种状态的展示规则写在 `lib/` 里并有单元测试。
- [x] 测试（HTTP API + 假工厂）：保存后下一个回合用的是新配置；保存时正在进行的通话继续用旧配置，挂断后再打的用新配置；试不通不保存且返回原因；恢复后回到 `.env` 的值；接口只返回末 4 位；没有 `EIDOLON_SECRET_KEY` 时 key 不可改；重启时覆盖试不通就回退并标为失效；非管理者 404。

## Comments

**实现**（2026-10-07）：配置覆盖表是 `config_overrides`（每个字段一行，名为 `chat_llm.model` 这样的「项.字段」；key 用 HKDF `info=b"eidolon config overrides"` 派生的 Fernet 加密），登记在 `database.py` 的 `NOT_USER_DATA`。生效配置是 `backend/src/eidolon/live_config.py` 的 `LiveConfig`（`describe` / `save_chat_llm` / `restore` / `start` / `lease`），挂在 `Backend.config` 上；工厂和热替换在 `backend/src/eidolon/service_clients.py`：`ServiceClients`（真实实现 `ProviderClients`，测试用 `tests/fakes.py` 的 `FakeServiceClients`，经 `build(..., clients=...)` 注入）和 `Swappable`（每个回合、每次通话取一份 `Lease`，被换下的客户端在最后一份 lease 释放后关闭）。`OwnKeys` 的路由不变，「部署者的客户端」改为每次 `for_turn` / `for_call` 时从 `LiveConfig.lease()` 取，`TurnKeys` / `CallKeys` 多了 `release`，文字回合在响应流结束时、通话在挂断后释放。启动时的试调由 `Backend.start()` 在 FastAPI 的 lifespan 里做（覆盖试不通就回退并标为 `failed`，日志列出生效中的覆盖项）；`.env` 的扮演角色模型仍在 `__main__` 里先检查，不合格照旧拒绝启动。后台接口在 `backend/src/eidolon/admin_config_api.py`：`GET /api/admin/config`、`PUT /api/admin/config/chat_llm`（不带 `api_key` 就不改 key；试不通 422，没有 `EIDOLON_SECRET_KEY` 却要改 key 409）、`DELETE /api/admin/config/chat_llm`。前端是 `frontend/src/components/AdminConfig.tsx`，三种状态的展示规则和表单换算在 `frontend/src/lib/adminConfig.ts`，文案在 `zh.ts` 的 `admin.config`。提炼记忆的 LLM 仍用启动时 `.env` 的那一个，没有设 `BACKGROUND_LLM_*` 时也不会跟随后台改过的扮演角色模型，留给 03。
