# 架构加深：通话的限额结算、对话页的状态

Status: ready-for-agent

术语以 `CONTEXT.md` 为准，本次不改词表。设计词汇（module、interface、seam、adapter、depth）取自 `codebase-design` skill。2026-09-28 的架构审查找出 7 个候选，经 grilling 决定先做其中两个。两者分别写成 ticket 01 和 02，可以在两个 worktree 里并行完成。

## Problem Statement

**后端：通话算不算限额**
CONTEXT.md 里「限额」和「接通」是同一条规则，`call.py` 却有五处各算一部分：
- `Calls.start` 负责 `take`，并在建立失败时 `give_back`；
- `_LiveCall._tell_why_failed` 算出 `counts`，并选定 `reason`；
- `_LiveCall._serve` 用另一个表达式决定要不要 `give_back`；
- `CallTurns._end` 写死了 `not exempt`；
- `CallTurns.recorded` 被 `_LiveCall` 跨过 seam 读取。

它们目前恰好一致，但证明这一点得同时读两个类的内部状态，而且这些规则只能靠跑真实 aiortc 的慢测试来验证。commit 32b6d7b 说明这里已经漂移过一次。

**前端：对话页的状态**
一次通话在界面上怎么走，要把 `LiveConversation` 和 `ConversationView` 里的五个 effect 拼起来才看得全，而 React 这一半没有测试。另外，"打开最新的对话或者新建"写在 React 里；列表靠数 settled 条目来猜什么时候刷新，结果每个成功回合刷新两次，第一次发生在还什么都没记下的时候，失败回合被撤回时也会刷新；新回复显示的是渲染那一刻的时间，而不是后端记下的时间。

## Solution

- **01**：新增 `CallOutcome` module（`backend/src/eidolon/call_outcome.py`）。它持有这次通话的 Use 和密钥归属，接收事件，决定整条 `ended` 消息、`counts` 的值和要不要 `give_back`。`_LiveCall` 和 `CallTurns` 只负责报事件、发出它返回的消息。
- **02**：`LiveConversation` 改为每位角色一个。打开对话、开新对话、通话层的收起、选麦克风、唯一的错误都放进它的快照；它在回合记下和新建对话时各发出一次 `onListChanged`；`Entry` 带上时间。

## 两张 ticket 之间的约定

- 通话结束发给浏览器的 `ended` 消息，格式保持 `{type, reason, message, counts}` 不变，`EndReason` 的取值也不变。01 不能改它，02 不依赖它的任何变化。
- 01 只改 `backend/`，02 只改 `frontend/`。两边都不改 `CONTEXT.md`、README、`failure.ts`、`callEnd.ts` 和限额相关的文案（那是后续的候选 5）。

## Out of scope（审查里的其他候选，另行处理）

- 补充和打断的规则抽成纯状态机（候选 2）。01 做完后更容易下手。
- 前端"算不算限额"的说法收成一处（候选 5）、`call.ts` 加 port 并把 `muted` 改名为 `textOnly`（候选 6）。
- 后端"一个对话同一时间只有一个回合"的闸（候选 7）。
- 文字回合的 `take` 和 `give_back`（`app.py:298-306`）保持原样。
