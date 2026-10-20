# 01: 铃声、接通音、挂断音由 LiveConversation 告诉页面

**What to build:** 电话本身的声音（GLOSSARY「铃声」「接通音」「挂断音」）照旧这样响：
- 点下拨打的那一刻开始响铃，接通时停铃并播一次接通音；
- 通话结束时停铃并播一次挂断音，不论谁挂断、为什么结束、有没有接通过；
- 离开对话页时铃声停下，挂断音不播；
- 只看文字、收起或展开通话层，都不影响它们。

现在这些规则写在页面的 hook 里：它用 ref 记住上一个阶段，再按阶段的变化推算，没有测试。改成 LiveConversation 的一个 port `tones`，和她的声音（`voice`）并列，由 LiveConversation 在拨号、接通、结束和离开页面这几处直接告诉页面。页面只负责播放。

用户听到的不变。背景见 `../spec.md`（「提示音：一个新的 port」）。

**Blocked by:** None (can start immediately)

**Status:** resolved

## 已定的设计（2026-10-11 grilling，详见 spec）

- port 的形状：`tones: { ring, connect, hangUp, silence }`。
- `ring` 在用户的这次点击里调，在任何 await 之前，紧挨着告诉她的声音拨号的那一处。
- `hangUp` 放在挂断、断线、后端挂断、没能接通共同经过的那个结束出口里。
- `dispose` 调 `silence`。
- 看完结束页回到 idle、开新对话，都不发声。已经过时的那通电话后来再发来的消息，不引起任何声音（它们本来就过不了那道闸）。
- 删掉纯函数 `callTones` 和它的测试。页面那个 hook 只剩 adapter：建 Audio 元素、实现 port、播放被拒时放弃。页面像交出她的声音那样把它交给 LiveConversation。

## 验收

- [ ] `liveConversation.test.ts` 用假的 `tones` 记下调用，测到这些情况：
  - 拨号时同步响铃（`startCall` 第一次 await 之前就已经调过）；
  - 接通时调 `connect`；
  - 拨号中挂断、通话中挂断、断线、后端挂断、没能接通，各调一次 `hangUp`；
  - 离开页面只调 `silence`；
  - 看完结束页、只看文字、收起或展开通话层，都不调用；
  - 过时的那通电话后来再发消息，不调用。
- [ ] 已有的用例照旧通过；假的 `Ports` 补上 `tones`。
- [ ] `callTones.ts` 和 `callTones.test.ts` 删掉，页面不再按阶段的变化推算提示音。
- [ ] `vitest`、`tsc`、`sh scripts/check-discipline.sh` 通过。
- [ ] 人工验收清单写进 Comments：在构建版前端里（`next build` 加 `next start`）核对：
  - 拨号响铃、接通音、挂断音；
  - 拨号中挂断，挂断音照样播；
  - 只看文字时三种声音照旧；
  - 通话中离开对话页，铃声停下，挂断音不播。

## Comments

### 实现说明（2026-10-11）

- `Ports` 加 `tones: { ring; connect; hangUp; silence }`（`frontend/src/lib/liveConversation.ts`，`Tones` 类型）。LiveConversation 四处调用它：`startCall` 在用户点击里、任何 await 之前，紧挨 `voice.dial(...)` 之后 `ring()`；接通时（`this.call = started` 之后、写入 connected 快照之前）`connect()`；`ended()` 这个「挂断 / 断线 / 后端挂断 / 没能接通」共同经过的出口里 `hangUp()`；`dispose()` 里 `silence()`。
- 删掉 `frontend/src/lib/callTones.ts` 和 `callTones.test.ts`；页面不再按阶段的变化推算提示音。
- `frontend/src/components/conversations/useCallTones.ts` 只剩 adapter：建铃声 / 接通音 / 挂断音三个 Audio 元素，交出一个稳定的 `tones` port，play() 被拒时照旧放弃。`ConversationView` 像交出 `voice` 那样把它放进 `Ports`（`Ports.tones` 是必填项）。
- `frontend/src/lib/liveConversation.test.ts` 加假 `FakeTones`（按顺序记调用，写法仿 `FakeVoice`），覆盖验收列出的全部情况；已有的 `it.each(endings)`「过时消息什么都不改」那条也顺带断言提示音不被触发。

三项检查（`frontend/` 下）：`npm test` 635 passed、`npm run typecheck` 通过、`sh scripts/check-discipline.sh` 通过。

### 人工验收清单

在构建版前端里核对：`cd frontend && npm run build && npm run start`，浏览器打开某位角色的对话页。

1. 拨号响铃、接通音、挂断音：点页首电话键，立刻听到循环铃声；接通时铃声停、响一次接通音；通话中挂断时响一次挂断音。
2. 拨号中挂断，挂断音照样播：点电话键后趁还没接通再挂断，应听到一次挂断音。
3. 只看文字时三种声音照旧：打开「只看文字」，重复第 1 条，铃声 / 接通音 / 挂断音都不受影响。
4. 通话中离开对话页，铃声停下、挂断音不播：通话中（或拨号中）点返回离开对话页，铃声应立刻停，且不响挂断音。

