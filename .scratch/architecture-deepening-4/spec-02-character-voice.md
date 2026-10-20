# 架构加深（第四轮）：角色的声音交给 LiveConversation

Status: resolved

术语以 `CONTEXT.md` 为准，本轮不改词表。设计词汇（module、interface、seam、adapter、depth、locality）取自 `codebase-design` skill。这是 2026-10-02 架构审查里的候选 3，经 grilling 定下设计。它和候选 2（`spec.md`、ticket 01）改同一个文件，并且要扩展 01 的表驱动测试，所以排在 01 之后。

## Problem Statement

通话里角色的声音（`CharacterVoice`，管电话质感和只看文字时的静音）现在由对话页自己接线，规矩分在三处：

- **只看文字要绕三处才到声音**：`LiveConversation.toggleTextOnly` 改快照，页面重渲染，`useCharacterVoice` 的 effect 再调 `CharacterVoice.setTextOnly`。声音比快照晚一次渲染；`LiveConversation` 的测试也看不到这一路。
- **电话质感绕过 Ports**：页面在拨号时直接调 `loadCallPreferences()` 读电话质感，没走 `Ports.preferences`；`LiveConversation` 在 `startCall` 里另读一次偏好。
- **拨号守卫是一份拷贝**：页面的 `dial` 为了「通话中或正忙时不去动正在用的声音」，抄了一份 `startCall` 的守卫（`!live || busy || inCall`）。这份拷贝已经和原来的不一样：少了「对话已打开」，开新对话的过程中点重拨仍会重置声音。d16ab13 修的就是这类拷贝漏掉的 bug。
- **新对话菜单多一个条件**：菜单的禁用条件比 `startNewConversation` 的守卫多判断了「没登录」；拨号又不判断它。

## Solution

`LiveConversation` 拿一个声音 port，自己在该做的时刻告诉声音：拨号时（带电话质感，在用户这次点击里）、她的音轨到了、切换只看文字、离开这一页。页面只把 `<audio>` 交给 `CharacterVoice`，不再替声音做任何判断。

快照给出「现在能不能拨号、能不能开新对话」，和对应方法的守卫是同一个判断；页面的按钮和菜单直接读它，不再自己拼条件。

## User Stories

1. 作为用户，我想在通话中切换只看文字时，她的声音当场停下或恢复，开不开电话质感都一样。
2. 作为用户，我想在偏好里已经是只看文字时，打开对话页拨号，一开始就听不到她的声音。
3. 作为用户，我想打开电话质感后拨号，听到的是电话里的声音；关掉之后，下一通恢复干净的声音。
4. 作为用户，我想在结束页重拨时，电话质感照常生效。
5. 作为用户，我想在通话中、文字回合进行中或对话还没打开时误点拨号，正在用的声音不受影响。
6. 作为用户，我想在上一通的音轨迟到时，它不会盖掉下一通她的声音。
7. 作为用户，我想离开对话页时，她的声音和通话一起停下。
8. 作为用户，我想电话键和「开新对话」什么时候能点，和点了以后会不会真的做事，始终一致。
9. 作为开发者，我想在 `LiveConversation` 的测试里用一个假声音断言什么时候拨号、播放、静音，这样声音的接线有测试保护。
10. 作为开发者，我想「能不能拨号、能不能开新对话」只写在一处，这样页面不会再抄出一份走样的守卫。

## Implementation Decisions

- **声音 port**：`Ports.onCharacterAudio` 换成 `voice: { dial(phoneTexture), play(track), setTextOnly(textOnly), dispose() }`。`CharacterVoice` 就是真实 adapter，形状不用改；`attach`（`<audio>` 的 ref）是 DOM 的事，只留在页面，不进 port。
- **拨号**：`startCall` 守卫通过以后、第一个 `await` 之前，只读一次偏好，同时交给 `voice.dial(phoneTexture)` 和 `ports.startCall`。async 函数到第一个 `await` 之前是同步执行的，所以 `voice.dial` 仍在用户的点击里，AudioContext 可以恢复。守卫没通过就不碰声音。`startCall` 的注释写明：必须在用户的点击里同步调用。
- **页面的拨号**只剩 `void live?.startCall()`，电话键和结束页的重拨都用它；页面不再 import `loadCallPreferences`。
- **只看文字**：构造时按偏好同步调一次 `voice.setTextOnly`；`toggleTextOnly` 里和 `call.setTextOnly` 一起同步调。删掉 effect。
- **离开这一页**：`LiveConversation.dispose()` 顺带调 `voice.dispose()`。`CharacterVoice` 在 dispose 之后再拨号会重新建 AudioContext，所以 StrictMode 下 effect 跑两遍也没问题。页面按 `character.id` 加了 key，声音和 `LiveConversation` 本来就同生同灭。
- **删掉 `useCharacterVoice.ts`**：页面只留 `const [voice] = useState(() => new CharacterVoice())`，用来拿 `attach` 和交给 Ports。
- **她的音轨也过闸**：ticket 01 在 `LiveConversation` 里设的闸，本来让播放声音的 handler 原样直通。这一轮让它也先过闸，闸从此没有例外。
- **快照加 `canDial`、`canStartNew`**：
  - `canDial`：对话已打开、没有文字回合在进行、不在通话中。与 `startCall` 的守卫是同一个判断。
  - `canStartNew`：同上的三条。与 `startNewConversation` 的守卫是同一个判断。
  - 不加 `canSend`：页面没有发送守卫的拷贝（输入框只看对话是否打开，忙的时候照样能打字，`submit` 自己忽略），加了也删不掉任何东西。
- **菜单拿掉「没登录」这一条**：没登录时点「开新对话」会再失败一次，页面再给一次去登录的入口；判断只剩一种。
- **不动的**：`CharacterVoice` 本身、通话音（`useCallTones` 只是把快照的通话阶段映射成声音，按 `CONTEXT.md` 是电话本身的声音）、`CallLayer` 和它的 props、`<audio>` 元素、通话 adapter、后端。

## Testing Decisions

- 好的测试只经由 `LiveConversation` 的 interface 断言：假 Ports 里加一个 `FakeVoice`，记下每一次调用；再看快照。`FakeVoice` 是这个 seam 的第二个 adapter，有了它 seam 才算真的成立。
- **新增的接线测试**：
  - 拨号：`live.startCall()` 一返回（还没 await），`voice.dial` 已经收到偏好里的电话质感；`ports.startCall` 收到的偏好是同一次读出来的。
  - 守卫没通过时不碰声音：通话中、文字回合进行中、对话还没打开，`startCall()` 都不调 `voice.dial`。写成一条表驱动测试。
  - 只看文字：构造时按偏好调一次 `setTextOnly`；`toggleTextOnly` 当场同步调。
  - 音轨：当前这一通的音轨交给 `voice.play`。
  - 离开这一页：`dispose()` 调 `voice.dispose()`。
  - 能不能做：`canDial`、`canStartNew` 在打开中、已打开、文字回合进行中、拨号中、通话中、结束页、打开失败时的取值，写成一张表。
- **扩展 ticket 01 的表驱动测试**：「迟到的是什么」那一维加一行「她的音轨」，断言 `FakeVoice` 没收到 `play`。不另写测试。
- `characterVoice.test.ts` 原样保留：它测真实 adapter。
- 现有测试里没有专门测 `onCharacterAudio` 透传的，没有要删的；假 Ports 里的 `onCharacterAudio: () => {}` 换成 `FakeVoice`。
- 先写会失败的测试（`/tdd`），再改实现。

## Out of Scope

- `CharacterVoice` 的行为（电话线路、静音的规矩）和它的测试。
- 通话结束时停掉 `<audio>` 里的旧音轨。
- 通话音、`CallLayer` 的 props、结束页重拨按钮的禁用。
- 发送的守卫和输入框的禁用。
- 通话协议、`muted` 改名为 `textOnly`（候选 6）。
- 不改 `CONTEXT.md`，不写 ADR：「电话质感」「只看文字」已经够用，没有新的领域词。

## Further Notes

- 依赖 ticket 01：闸要先在，音轨才能过闸，01 的表驱动测试才能加行。
- 人工验收清单见 ticket 02。
