# 02: 角色的声音交给 LiveConversation

**What to build:** 通话里角色的声音（`CharacterVoice`）改由 `LiveConversation`（`frontend/src/lib/liveConversation.ts`）经一个声音 port 告诉：拨号时（带电话质感，在用户这次点击里）、她的音轨到了、切换只看文字、离开这一页。快照给出 `canDial`、`canStartNew`，页面的电话键和「开新对话」直接读它们。对话页（`ConversationView.tsx`）不再替声音做判断，删掉 `useCharacterVoice.ts`。背景和取舍见 `../spec-02-character-voice.md`。

**Blocked by:** 01（`01-stale-call-events.md`）：音轨要过 01 设的闸，01 的表驱动测试要加一行。

**Status:** resolved

## 已定的设计（2026-10-02 grilling）

- **声音 port**：`Ports.onCharacterAudio` 换成 `voice: { dial(phoneTexture), play(track), setTextOnly(textOnly), dispose() }`。`CharacterVoice` 是真实 adapter，不用改；`attach` 只留在页面。
- **拨号**：`startCall` 守卫通过以后、第一个 `await` 之前，只读一次偏好，同时交给 `voice.dial(phoneTexture)` 和 `ports.startCall`。守卫没通过就不碰声音。`startCall` 的注释写明：必须在用户的点击里同步调用，否则 AudioContext 恢复不了。
- **页面的拨号**只剩 `void live?.startCall()`（电话键和结束页重拨共用）；页面不再 import `loadCallPreferences`，电话质感从此走 `Ports.preferences`。
- **只看文字**：构造时按偏好同步调一次 `voice.setTextOnly`；`toggleTextOnly` 里同步调。删掉 effect。
- **离开这一页**：`LiveConversation.dispose()` 顺带调 `voice.dispose()`。删掉 `useCharacterVoice.ts`，页面只留 `const [voice] = useState(() => new CharacterVoice())`。
- **她的音轨过闸**：01 里原样直通的音轨 handler 也先过闸，闸从此没有例外。更新 01 写在闸附近的注释。
- **快照加 `canDial`、`canStartNew`**，和 `startCall`、`startNewConversation` 的守卫是同一个判断（对话已打开、没有文字回合在进行、不在通话中）。不加 `canSend`。
- **页面**：电话键 `isDisabled={!canDial}`（通话中照旧换成「回到通话」）；菜单 `isDisabled: !canStartNew`，拿掉「没登录」这一条。
- **不动的**：`CharacterVoice` 和它的测试、`useCallTones`、`CallLayer` 和它的 props、`<audio>` 元素、通话 adapter、后端。
- **不改 `CONTEXT.md`，不写 ADR**。

## 验收

- [x] **按 TDD**：先在 `liveConversation.test.ts` 写下面的测试，看到它们失败，再改实现。
- [x] 假 Ports 里加 `FakeVoice`，记下每一次调用，替换 `onCharacterAudio: () => {}`。
- [x] **拨号**：`live.startCall()` 一返回（还没 await），`voice.dial` 已经收到偏好里的电话质感；`ports.startCall` 收到的偏好是同一次读出来的。
- [x] **守卫没通过时不碰声音**（表驱动）：通话中、文字回合进行中、对话还没打开，`startCall()` 都不调 `voice.dial`。
- [x] **只看文字**：偏好里已是只看文字时，构造后 `setTextOnly(true)` 已调；`toggleTextOnly()` 当场同步调 `setTextOnly`。
- [x] **音轨**：当前这一通的音轨交给 `voice.play`。
- [x] **离开这一页**：`dispose()` 调 `voice.dispose()`。
- [x] **能不能做**（表驱动）：`canDial`、`canStartNew` 在打开中、已打开、文字回合进行中、拨号中、通话中、结束页、打开失败时的取值。
- [x] **扩展 01 的表驱动测试**：「迟到的是什么」加一行「她的音轨」，断言 `FakeVoice` 没收到 `play`。不另写测试。
- [x] `characterVoice.test.ts` 原样通过；现有测试一律原样通过。
- [x] `useCharacterVoice.ts` 已删除；`ConversationView.tsx` 里不再出现 `loadCallPreferences`、拷贝的拨号守卫和 `failure?.signedOut` 的菜单条件。（例外：组装 Ports 时的 `preferences.load` 还是 `loadCallPreferences`，见实现说明）
- [x] `frontend/` 下 `npm test` 和 `npm run typecheck` 都通过。
- [x] **人工验收（留给用户）**：打几通真实电话，用户验过之后再标 `resolved`。
  - 打开电话质感后拨号，听到的是电话里的声音；关掉之后，下一通恢复干净的声音；
  - 通话中切换只看文字，她的声音当场停下或恢复，开不开电话质感都试一次；
  - 偏好里已是只看文字时，打开对话页拨号，一开始就没有她的声音；
  - 在结束页重拨，电话质感照常生效；
  - 收起通话层再展开，声音不受影响。

## Comments

### 实现说明（2026-10-02）

- **TDD**：先写测试，新测试 17 条红（01 表里新加的 4 行「她的音轨」、`canDial`/`canStartNew` 表 8 行、声音组 5 条）。守卫没通过时不碰声音那张表（取「能不能做」表里不能拨号的 6 种状态：打开中、文字回合进行中、开新对话中、拨号中、通话中、打开失败）在改实现前就是绿的：那时 `voice.dial` 还在页面里，`LiveConversation` 根本不调它；它防的是以后把 `dial` 挪到守卫前面。
- **9 个手工变异全部被抓到**：`dial` 挪到守卫之前、音轨不过闸、`toggleTextOnly` 不告诉声音、构造时不告诉声音、`dispose` 不停声音、拨号时读两次偏好、判断漏掉「没有文字回合」、漏掉「对话已打开」、`canStartNew` 自己另拼条件。
- **一处判断**：`isFree(state)`（对话已打开、没有文字回合、不在通话中）同时用于 `startCall`、`startNewConversation` 的守卫和快照的 `canDial`、`canStartNew`。`startCall` 仍用 `openConversationId()` 拿对话 id。
- **假 Ports**：`opening()` 多了 `preferences` 选项（只写和默认不同的偏好）、返回 `voice`（`FakeVoice`）和 `loaded`（每次读偏好得到的对象，用来断言拨号只读一次、交给通话的是同一个对象）。
- **和验收字面不一致的一处**：`ConversationView.tsx` 里还有一个 `loadCallPreferences`，是组装 Ports 时的 `preferences: { load: loadCallPreferences, save: saveCallPreferences }`。这正是「电话质感走 `Ports.preferences`」的那条路，删掉它就得另造一个导出，只为了让 grep 不出现这个名字，所以没删。页面自己读偏好的地方（原来的 `dial`）已经没有了。
- `npm test`（24 个文件、403 条）和 `npm run typecheck` 通过；`characterVoice.test.ts` 没动。
- 用户人工验收通过（2026-10-02，本地构建版前端，真实通话各项没有问题），标为 resolved。
