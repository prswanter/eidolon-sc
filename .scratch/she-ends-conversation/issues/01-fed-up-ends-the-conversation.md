# 01: 文字对话里她会警告，接连不快会结束对话

**What to build:** 在通话之外的回合里，最近 8 个文字回合合计扣到 6 分时她先警告「再这样下去就不想聊了」，扣到 12 分时她说完最后一句就结束这个对话：对话里留一条「她结束了对话」，之后在这个对话里打字和拨电话都被拒绝；浏览器里输入框换成结束卡「她结束了对话」和「开个新对话」。窗口从上线后开始算，通话里的回合不进窗口。见 `../spec.md`「规则」「已结束的对话」和 Implementation Decisions。

**Blocked by:** None (can start immediately)

**Status:** done

### 后端

- [x] 文字回合的用户消息记下这一轮扣了多少（钳到下限之前，没判断的记 0）和是不是不该说的话；通话里的回合和旧数据为空。旧库启动时补列
- [x] 文字回合从这个对话的记录里读出最近 8 个文字回合（含这一轮），交给和通话共用的「她结束吗 / 她警告吗」判断；这张票只接上「接连不快」这一种原因（常量和通话同一份）
- [x] 警告：文字回合用新的一句「不想聊了」，不提挂电话；回落到 6 分以下前不再警告。通话的警告不变
- [x] 结束的那一轮：她被告知用现有的「不想聊下去」那句告别；回合记下，随后记一条新的对话事件「她结束了对话」；`done` 里带「对话已结束」
- [x] 对话记录接口返回这条事件；对话列表照旧显示她的最后一句
- [x] 已结束的对话里再发文字回合被拒绝：不留记录、不计入限额，告诉用户「她已经结束了对话」
- [x] 已结束的对话拨电话被拒绝（409）
- [x] 运行记录里这一轮记下让她结束了对话的原因
- [x] 好感度没生效时永远不结束

### 前端

- [x] 这一轮的 `done` 说已结束、或打开的对话记录里有结束事件，对话进入「已结束」：不能发消息、拨电话按钮不可用
- [x] 输入框的位置换成结束卡：「她结束了对话」和「开个新对话」；「开个新对话」走现有的新对话，已结束算空闲
- [x] 对话记录里的结束事件像「她挂断了电话」一样显示
- [x] 文案进 `zh.ts`；按 `frontend/AGENTS.md` 的 shadcn 纪律和 `DESIGN.md`

### 测试

- [x] 后端（对外接口、伪造判断模型）：接连扣分先警告一次再结束；只看最近 8 轮，偶尔一句不结束；通话里的回合不进窗口，通话被挂断后照样能打字；上线前的回合不算；判断失败的回合占一格不结束；结束后打字被拒绝不计入限额；结束后拨电话被拒绝；好感度关着不结束；提示词里警告和告别说的是「不想聊」
- [x] `liveConversation.test.ts`：进入和离开「已结束」
- [x] 本地构建版 Playwright：结束卡、「开个新对话」后能接着聊
- [x] 后端完整测试、前端类型检查和测试通过

## Comments

- 2026-10-15 实现：规则在 `affinity.ends`（原 `hangs_up`，原因类型 `EndsFor`，原 `HangUp`）和 `affinity.warns`，通话、文字两边共用；`affinity_prompt` 的 `warning` 现在是 `Parting | None`，文字回合用新的「不想聊了」那句（`_WARNINGS["parts"]`），告别用原来的 `_PARTINGS["parts"]`。
- 每个文字回合在用户消息上记 `hurt`、`out_of_line`（`store.Typed`），通话回合和旧数据为 NULL；`Store.typed_turns(conversation_id, latest)` 读最近几个文字回合（旧到新），`Store.ended(conversation_id)` 返回结束事件或 None。`Store.add_turn(..., typed=, ends=)` 在同一事务里写回合，`ends` 时紧跟一条 `ended` 事件。
- 引擎 `_reply` 开头：对话已结束就 `TurnRejected(ENDED)`（「她已经结束了对话」），被拒的回合照规矩不计入限额。文字回合读 `FED_UP_TURNS`（8）个之前的文字回合交给 `ends`/`warns`：要读满 8 个，`warns` 才是拿上一轮的完整窗口比较（只读 7 个会在一直停在 6 分时重复警告，code-review 查出，已加测试）。这张票里文字回合只认 `fed_up`：`ending != "fed_up"` 时置 None，`out_of_line_before` 传 0。
- `done` 多一个 `ended`：结束事件按浏览器看到的样子（`ConversationEvent.shown`），没结束为 null。运行记录 `activity_records.ended_conversation`（TEXT，补列在 `_add_judgement_columns`），`RecordRow.ended_conversation`。
- 拨电话：`/api/ice-servers?conversation=` 和 `POST /api/offer` 对已结束的对话回 409 `{"detail": "她已经结束了对话"}`（没有 `cooldown_until`）。
- 对话列表：`Store._last` 跳过 `ended` 事件，照旧显示她的最后一句。
- 前端：`EventKind` 多 `ended`（`EndedIcon` = Lucide `MessageCircleOff`），`done.ended` 由 `conversationLog` 接在回复后面；`LiveConversation` 的 `ended` 从记录里有没有结束事件得出，`canDial` 随之为假，`canStartNew` 照旧。`ConversationView` 里 `ended` 时输入栏换成结束卡（`DESIGN.md`「输入栏」已写）。
- 本地构建版 Playwright 验收过（宽屏、手机）：结束事件和结束卡、电话键禁用、「开个新对话」后电话键可用、发一句她回复了。
