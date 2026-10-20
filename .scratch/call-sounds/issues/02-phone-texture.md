# 02: 电话质感

**What to build:** 在设置页的「通话」一节新增「电话质感」开关。打开后，角色的声音会像隔着电话听筒那样。背景见 `../spec.md`，术语见 `CONTEXT.md` 的「电话质感」。

**Blocked by:** None (can start immediately)

**Status:** resolved

## 规则

- **存储**：作为 `CallPreferences` 的新字段存在这台设备上（`frontend/src/lib/callPreferences.ts`），**默认关闭**。旧的 localStorage 里没有这个字段时，按关闭处理。
- **设置页**：`frontend/src/components/CallSettings.tsx` 里，放在「通话音质」下方，文案写在 `frontend/src/i18n/zh.ts`。说明文字要讲清楚两点：
  - 让角色的声音像隔着电话听筒；
  - 下次接通时生效；开启后，不同音质之间的差别会变小。
- **只放在设置页**，通话层里不加这个开关；在一次通话当中不会改变。
- **效果**：频段限制在大约 300–3400Hz（高通加低通，或者带通），再加一个轻微的压缩（`DynamicsCompressorNode`）。**不加**底噪、杂音、失真或模拟丢包。
- **作用范围**：只处理角色的声音，不影响铃声、接通音、挂断音。
- **和「只看文字」的关系**：「只看文字」照常静音角色的声音，不论电话质感开没开。
- **和「通话音质」互相独立**：不置灰也不联动。「通话音质」仍然决定后端的合成采样率，后端不改。

## 实现提示

- 现在角色的声音是由 `ConversationView.tsx:242` 的 `<audio autoPlay muted={textOnly}>` 直接播放 `MediaStream` 的。开启电话质感时，需要把角色的音轨接进 Web Audio：`MediaStreamAudioSourceNode` → 滤波 → 压缩 → destination。关闭时保持现在的播放路径不变。
- 注意 Chrome 的一个已知问题：来自 WebRTC 的远端 `MediaStream`，如果只接进 `AudioContext`，而没有挂在任何一个 media element 上，可能会没有声音。常见的规避办法是保留一个 `muted` 的 `<audio>` 来持有这个 stream。
- `AudioContext` 在用户点击拨号时创建或 `resume()`，避免被自动播放策略挂起。
- 「只看文字」在 Web Audio 这条路径上，要通过 GainNode 或者断开连接来实现静音。
- 滤波链的搭建最好做成一个纯函数或小 module，方便测试参数。

## 验收

- [ ] `callPreferences` 的单测覆盖新字段：默认值、读取旧数据时的兼容、保存。
- [ ] 设置页可以切换，刷新页面后仍然保留。
- [ ] 在真实应用里对比开关两种状态：打开后声音明显变"窄"、像打电话；关闭时和现在完全一样；开着电话质感时，「只看文字」仍然能静音；铃声等音效不受影响。
- [ ] `npm test`、`npm run lint`、类型检查通过。

## Comments

- 实现：`CallPreferences.phoneTexture`（默认关闭，旧数据按关闭）；设置页「通话音质」下方加了 Astryx `Switch`；她的声音的播放放进 `frontend/src/lib/characterVoice.ts`（`CharacterVoice`：关闭时 `<audio>` 直接播放，和原来一样；开启时 `<audio>` 静音、只持有 stream 以规避 Chrome 的问题，音轨走 高通 300Hz ×2 → 低通 3400Hz ×2 → 压缩（threshold -24dB、ratio 3）→ GainNode → destination，「只看文字」把 GainNode 调到 0）。`ConversationView.tsx` 只改了几行：通过 `useCharacterVoice` 拿到它，拨号的点击里按当前设置 `voice.dial(...)` 并唤醒 AudioContext。
- 电话质感在拨号时从偏好里读，没有经过 `LiveConversation` 的 preferences port：AudioContext 必须在用户点击里创建，放在视图里最直接，也避免和 ticket 01 同时改 `liveConversation.ts`。
- 已验证：`characterVoice`、`callPreferences` 的单测；`npm test`（230 通过）、`npm run typecheck`、`npm run build`；用 Playwright 确认设置页的开关能切换、刷新后保留，并且在 Chromium 里真实搭出同样的滤波链没有报错。仓库里没有 `npm run lint` 脚本。
- **还需要人耳确认**（agent 听不到声音）：在 Chrome 里真实通话，对比开关两种状态：开启后声音是否明显变"窄"、像打电话，压缩是否"轻微"；关闭时是否和以前完全一样；开启时「只看文字」是否静音；和 ticket 01 合并后，铃声、接通音、挂断音不受影响。
