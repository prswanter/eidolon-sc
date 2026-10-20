# 01: 铃声、接通音、挂断音

**What to build:** 让拨号、接通、结束各有对应的声音。背景见 `../spec.md`，术语见 `CONTEXT.md` 的「铃声」「接通音」「挂断音」。

**Blocked by:** None (can start immediately)

**Status:** resolved

## 素材（都提交进仓库，放在 `frontend/public/sounds/`，这个目录现在还不存在）

- `ringback.mp3`：取自仓库根目录的 `打电话铃声.mp3`（37 秒，48kHz 立体声），用 ffmpeg 转成单声道、约 64kbps。转好后删掉根目录的原文件。用户已确认这段铃声可以公开分发。
- `connect.ogg`：Kenney「Interface Sounds」里的 `Audio/confirmation_001.ogg`（CC0，https://kenney.nl/assets/interface-sounds ，zip：https://kenney.nl/media/pages/assets/interface-sounds/fa43c1dd4d-1677589452/kenney_interface-sounds.zip ）。
- `hang-up.mp3`：Felfa 的「busy signal_europe」（CC0，https://freesound.org/people/Felfa/sounds/178821/ ），使用免登录的预览版 https://cdn.freesound.org/previews/178/178821_2103589-hq.mp3 （1.6 秒，三声 425Hz）。
- 在 `frontend/public/sounds/` 下放一个简短的 `CREDITS.md`，写明后两个文件的来源和 CC0 许可。

## 规则

- **铃声**：
  - 用户点下开始通话或重新拨打时立即循环播放，浏览器弹出麦克风权限框时也照样响；
  - 一接通就停，不刻意多响一会儿，不推迟接通；
  - 通话在接通前结束时也要停，包括取消拨号、麦克风被拒、超出限额、自带密钥调用失败、没能接通。
- **接通音**：进入 `connected` 时播放一次。
- **挂断音**：
  - 只要铃声响过，通话进入 `ended` 时就播放一次。实际上就是每一种结束方式都播，包括用户自己挂断、拨号时取消、后端告知结束、连接断开，以及上面列出的各种接通前失败；
  - 通话结束后，同一个 `ended` 状态重复渲染时不能重复播放；
  - 离开对话页时来不及播放，不用强求。
- 三种音效都**不受**「只看文字」（`textOnly`）和收起通话层的影响，也不套用电话质感。
- 播放是由用户的点击触发的，一般不会被浏览器的自动播放策略拦下；万一 `play()` 被拒绝，吞掉错误即可，不影响通话本身。

## 实现提示

- 通话状态机在 `frontend/src/lib/liveConversation.ts`，状态依次是 `idle → dialing → connected → ended`。音效可以根据状态的切换来驱动，最好做成一个小 module（例如 `lib/callTones.ts`），接收"状态从 A 变成 B"，决定播放或停止什么，方便单测。
- 播放本身放在 `ConversationView.tsx` 里，或者做成一个注入的 port。`liveConversation.ts` 本身不直接接触 `Audio`。

## 验收

- [x] 三个音效文件和 `CREDITS.md` 已提交，根目录的 `打电话铃声.mp3` 已删除（删除由 coordinator 在合并后完成）。
- [x] 单测覆盖以下切换：idle→dialing 开始响铃；dialing→connected 停止铃声并播放接通音；dialing→ended、connected→ended 停止铃声并播放挂断音；ended→idle 以及同一状态重复渲染时什么都不做；重新拨打会再次响铃。
- [ ] 在真实应用里走一遍：拨号时听到铃声，接通后听到接通音，挂断后听到挂断音；开着「只看文字」时音效照常播放。
- [x] `npm test`、`npm run lint`、类型检查通过（frontend 没有 `lint` 脚本，这一项以 `npm run build` 代替）。

## Comments

- 切换规则在 `frontend/src/lib/callTones.ts`（单测 `callTones.test.ts`），播放在 `components/conversations/useCallTones.ts`，`ConversationView.tsx` 只加了一行 `useCallTones(call.phase)`。用户自己挂断时状态直接回到 `idle`、不经过 `ended`，所以规则是「从 dialing/connected 变成任何非通话中的状态」就停铃并播挂断音。
- `frontend/Dockerfile` 补了 `COPY --from=build /app/public ./public`：standalone 输出不带 `public/`，不补的话线上音效会 404。
- `ringback.mp3` 由根目录原文件转成单声道 64kbps（约 290KB）；`hang-up.mp3` 确认是 1.6 秒、三声约 425Hz 的 Felfa 预览版；三个文件的平均响度在 -10 到 -14 dB 之间，差不多。
- 验证：`npm test` 227 个全过，typecheck、`npm run build` 通过。用 Playwright 对生产构建（mock 掉 API）检查了播放调用：拨号即 `play` 铃声（loop），接通前失败时停铃并播挂断音，结束画面停留时不重播，重拨再次响铃，拨号中用户挂断会停铃并播挂断音，收起通话层不影响铃声，离开页面时铃声停止、不播挂断音。
- **还需要人耳确认**：真实接通后的接通音（没有后端，接通状态没法走到）；开着「只看文字」时三种音效照常能听到；音量和听感是否合适，铃声循环接缝是否自然。另外 iOS Safari 可能拒绝不在点击当下发起的播放（接通音和挂断音风险更大，被拒时静默），而且 Safari 17 以前不支持 Ogg，`connect.ogg` 在老版本上会没声，需要用手机试一下，不行就把接通音转成 mp3。
