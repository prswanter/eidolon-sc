# 架构加深（第三轮）：立绘指令

Status: resolved

术语以 `CONTEXT.md` 为准，本轮新增了「立绘指令」。设计词汇（module、interface、seam、adapter、depth）取自 `codebase-design` skill。2026-10-01 的架构审查列出了 12 个候选，经 grilling 决定这一轮只做其中的候选 1。

## Problem Statement

`frontend/src/lib/liveConversation.ts`（626 行）的 `LiveConversation` 里同时装着三台状态机：开场和文字回合、通话生命周期（含通话层的收起），以及立绘指令。

立绘指令的规则有自己的词汇和不变式：
- 段落顺序（`follows`、`reply:segment`）；
- 早到的情绪先挂起，等这段开始说时再换；
- 平静的段沿用当前心情，一条回复的第一段是平静时才回到平静；
- 只看文字时，「开始说」以字幕出现为准；
- 点头的 id；
- 打字打断后，等声音停下再看向用户。

这些规则只通过一个共用的 `update()` 和通话、回合耦在一起，状态也分在两处：
- 不可变的 `State`：`voicing`、`userSpeaking`、`interruptedByTyping`、`shownReply`、`saying`、`stand`；
- 实例上的可变字段：`nods`、`judged`、`shown`，挂断时靠 `ended()` 手动清掉。

spine-stand 的 ticket 15、16、17 每张都往这个类里加了字段。要测立绘的一个动作，得先开对话、拨号、让 `FakeCall` 接通，再经 `handlers.onEvent` 推事件；`liveConversation.test.ts` 里这样的测试约有 280 行（L1243–1523）。

另外，快照里的 `playing` 字段是 ticket 16 的过渡品（「暂时不影响画面」）。ticket 17 之后已经没有组件读它。

## Solution

新建 `frontend/src/lib/standDirection.ts`：一个纯 reducer，写法和 `conversationLog` 一样。`LiveConversation` 在 `State` 里放一个字段保存它的状态，把通话事件原样交给它，再把它导出的立绘指令放进快照的 `stand` 字段。

细节见 `issues/01-stand-direction.md`。

## Out of scope（审查里的其他候选，另行处理）

- 候选 2：后端通话的上限与收尾（`CallTurns`、`CallOutcome`、`TurnTaking` 三方分管）。和本轮互不依赖，以后单独拷问。
- 候选 3–12，见审查报告。
- `Memories` 的连接没开 `secure_delete`：这是审查中顺带发现的疑似 bug，另外记在 `.scratch/memory-secure-delete/issues/01-memories-secure-delete.md`。
