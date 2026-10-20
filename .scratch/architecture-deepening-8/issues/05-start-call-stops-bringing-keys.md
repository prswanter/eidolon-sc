# 05: `startCall` 的测试守住「接通后不再带 key」

**What to build:** 通话的 offer 带上用户存的自带密钥；接通以后，之后每次重新协商都不再把 key 发出去。现在后一半靠 Pipecat 按引用持有请求数据、接通后删掉其中的 key 才成立，没有测试，通话连接的 module 整个没有测试。这张票加一个新 seam：用 `vi.mock` 换掉 Pipecat 的 client 和 WebRTC transport、以及麦克风，不跑真的 WebRTC，断言 offer 的请求数据带了 `own_keys`、接通后同一份请求数据里不再有它。

同时，一次通话要带的 `own_keys` 和预检要报的服务名列表改由自带密钥 module 拼好，通话连接的 module 不再自己拼。

通话的行为不变。背景见 `../spec.md`（「前端：自带密钥 module」和 Testing Decisions 里的「新 seam：`startCall`」）。

**Blocked by:** 01（前端的请求都走同一个请求函数；它把说话事件搬进了通话连接的 module）

**Status:** resolved

## 已定的设计（2026-10-11 grilling，详见 spec）

- `startCall` 照旧收 userId、调用时现读一次（预检报的服务和 offer 带的 key 出自同一次读取）。
- 接通后删掉请求数据里的 key 这一做法保留，注释写明为什么（Pipecat 每次重新协商都把同一份请求数据再发一遍；后端重新协商时也不看它）。
- 测试只测这一件事，不在这里测通话的其他行为（那些由 `liveConversation.test.ts` 经假的通话覆盖）。

## 验收

- [x] 前端自带密钥 module 的测试：通话带存了的全部三项、服务名列表和存了的一致；什么都没存时不带 `own_keys`、服务名列表为空。
- [x] 新的 `startCall` 测试：offer 的请求数据里有 `own_keys`，就是这个浏览器为这位用户存的；`connect` 返回之后，同一份请求数据里已经没有 `own_keys`。
- [x] 把「接通后删掉 key」那一行去掉时，新测试会失败（实现时验证一次，在 Comments 里记一句）。
- [x] `vitest`、`tsc`、`sh scripts/check-discipline.sh` 通过。
- [x] 人工验收清单写进 Comments（例如：带自带密钥拨号能接通、算不算限额照旧；接通后切换麦克风或网络触发重新协商，浏览器开发者工具里之后的 `/api/offer` 请求体不带 key）。

## Comments

- 做法：`localOwnKeys.ts` 末尾新增 `callOwnKeys(userId)`，现读一次，交回 `{ ownKeys, services }`：`ownKeys` 是 offer 带的 `own_keys`（存了的全部几项，什么都没存是 `undefined`），`services` 是预检报的服务名。`startCall` 改用它，什么都没存时请求数据里不再有 `own_keys`（以前带 `{}`；后端 `own_keys` 本来可省，含义相同）。接通后删 key 那一行保留，注释写明为什么、由 `call.test.ts` 守着。按并行约定没有搬动已有的类型和函数，`ownServices` 留给设置页（票 06 再处理）。
- 测试：`localOwnKeys.test.ts` 新增「通话带存了的全部三项、服务名一致、现读」「什么都没存时不带、服务名为空」（先红后绿）。新增 `call.test.ts`：`vi.mock` 换掉 Pipecat 的 client、WebRTC transport 和麦克风，假的 `fetch` 回预检；断言 offer 发出时请求数据带 `own_keys`（就是 u1 存的三项；分用户由 `callOwnKeys` 的单测守着，代码审查后这里不再另存 u2），`startCall` 返回后同一份请求数据里没有 `own_keys`。
- 验证过：把 `delete requestData.own_keys;` 注释掉，`call.test.ts` 失败（`expected { conversation_id: 'c1', …(3) } to not have property "own_keys"`），恢复后通过。
- `vitest` 全过，`tsc`、`check-discipline.sh` 通过。
- 人工验收清单：
  - 设置页存好三项自带密钥，拨号能接通，角色用的是自带的服务；通话结束后后台运行记录照旧标「自带密钥」、不计入限额。
  - 只存了 LLM（或什么都没存）时拨号能接通，算不算限额和以前一样。
  - 浏览器开发者工具网络面板：拨号前的 `/api/ice-servers?own=…` 只带服务名；第一次 `/api/offer` 请求体带 `own_keys`。
  - 接通后切换麦克风，或者断开再连上网络触发重新协商，之后的 `/api/offer`（PATCH/重新协商）请求体里不带 `own_keys`。
