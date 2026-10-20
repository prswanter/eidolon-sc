# 15: 开始通话时会话过期或缺同意要跳转；给 `api.ts` 的解析补测试

**What to build:** `call.ts` 连接 `/api/offer` 用的是 Pipecat 自带的 fetch，没走 `redirectFor`，所以开始通话时如果会话过期（401）或还没同意条款（428），页面只显示一行文字，不会跳到登录页或同意页。让它和其他请求一样跳转。另外给 `api.ts` 里没有测试的解析补上测试：`overLimit`（`retry_at` 显示到分钟、不提前，跨天时带日期，没有 `retry_at` 时的措辞）、`describe`（字符串、校验错误列表去掉 `Value error, ` 前缀）、`sendTurn` 的 SSE 分帧（帧跨多个 chunk、一帧里多行 `data:`）。都是原地修改，不新建 module。

**Blocked by:** —

**Status:** done

- [x] `/api/offer` 返回 401 / 428 时跳转，和 `api()` 用同一个 `redirectFor`，已经在目标页时不跳
- [x] `overLimit`、`describe` 经 `json()` 测试（构造 `Response`）
- [x] `sendTurn` 的 SSE 分帧经 stub 的 `fetch` 测试
- [x] 现有测试不改，全部通过；`npm run typecheck` 通过

## 背景（2026-09-27，架构体检候选 3「顺手」）

体检报告在候选 3 下列了这几项，认为原地修就行、不需要新 module。在 ticket 14 的 grilling 中决定另开这个 ticket，好让 14 只动对话页 module、不碰 `startCall` / `sendTurn` 这两个 adapter。
