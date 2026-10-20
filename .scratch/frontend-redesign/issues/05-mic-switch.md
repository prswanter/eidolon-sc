# 05: 通话中切换麦克风

**What to build:** 通话层的「切换麦克风」打开一个设备列表，选中后当场换成那个麦克风，通话不断；这个设备同时成为以后通话的默认麦克风。设置页里的麦克风选择改名为「默认麦克风」。不做输出设备切换。规则见 `../spec.md`「通话层」。

**Blocked by:** 04

**Status:** ready-for-agent

- [x] 实现 `frontend/src/lib/microphone.ts` 里的 `updateMic()`（现在是空实现）：换掉 WebRTC 发送的音轨，不重新协商，不断开通话；静音状态保持
- [x] 设备列表用 Astryx `BottomSheet`，当前设备标明「正在使用」，选中行用她的 `paper` 色和 `paperMuted` 次要字
- [x] 选中的设备写进通话偏好（`callPreferences.ts`），下次通话默认用它；设备被拔掉时退回系统默认，并提示
- [x] 设置页文案改为「默认麦克风」
- [x] 测试：偏好的读写与回退；真实通话中切换一次，确认对方能继续听到

## Comments

**2026-09-28 实现完成**（Status 不动，理由同 01）：

- **怎么换音轨**：`SmallWebRTCTransport` 对自定义的 media manager 没有公开的换轨接口。它自带的 media manager 用的是 `getAudioTransceiver().sender.replaceTrack()`，这里也这么做（`call.ts` 的 `audioSender()`）。`replaceTrack` 不需要重新协商，通话不断。transport 重连时会重新读 `tracks()`，所以换上的音轨在重连后仍然有效。这个方法不在 transport 的类型声明里，将来升级 Pipecat 时要确认它还在；不在了会报错，旧麦克风照用。
- **`microphone.ts`**：
  - `updateMic(id)` 打开新设备，按旧音轨的静音状态设好（换完再同步一次，防止换轨途中按了静音），交给通话发送，然后停掉旧音轨；
  - 切换排队执行，最后选的那个生效；
  - 挂断后不再切换；
  - 打不开或发不出去时报 `MicUnavailable`，旧麦克风照用。
  - 正在用的设备被拔掉（音轨 `ended`）时，自动换成系统默认。换不上（没有别的麦克风）时通话照常继续，但提示「麦克风断开了」。
  - `listMicrophones()` 从设置页搬到这里，两处共用。
- **`LiveConversation`**：
  - 新增 `switchMic()`；快照多出 `micId`（正在用的设备，空白为系统默认）和 `micNotice`（`fell_back` / `unavailable` / `lost`）；
  - 切换成功后，把选中的设备写进偏好。
- **界面**：
  - `MicSheet.tsx`：用 `BottomSheet`，列出「系统默认」和各个麦克风；正在用的那个写「正在使用」，行底铺她的 paper（`listRow`）。只在接通后可用，通话一结束就关上。
  - 麦克风的提示显示在通话层计时下方。
  - 设置页改为「默认麦克风」。
- **设备被拔掉时的偏好**（自己的决定，请确认）：保存的默认麦克风没连上时，这次通话用系统默认并提示，但**不清掉偏好**，插回去下次通话就又用它。设置页把它列为「已选的麦克风（现在没有连接）」。
- **测试**：
  - `microphone.test.ts`（假的 `mediaDevices`）覆盖：打开与回退、换轨后停旧轨、静音保持（包括换轨途中按静音）、切换排队、拔出后回退、拔出后无麦克风可用、挂断时切换还没完成。
  - `callPreferences.test.ts` 覆盖偏好的读写与回退。
  - `liveConversation.test.ts` 覆盖切换、偏好、提示和竞态。
- **真实通话验证**（Playwright Chromium 的假设备，播放一段日语语音，后端用真实 Soniox）：
  - 接通后，后端的实时识别有字；
  - 先按静音，再切到 Fake Audio Input 2：通话不断，静音仍在，30 秒内后端没有收到任何识别；
  - 取消静音后，后端从新麦克风识别出字；
  - 偏好里的 `micId` 换成了新设备，再打开列表时它标着「正在使用」；
  - 保存的麦克风不存在时，通话层提示「没有找到选定的麦克风，已改用系统默认」；设置页显示「默认麦克风」；
  - 系统设为减少动态效果时，列表面板没有位移动画。

  浅色和深色的截图在本地 `logs/t05-*.png`（不入库）。没有在真实设备上模拟拔出（由单元测试覆盖）。
- **没有做的**：`CONTEXT.md` 没有给「默认麦克风」加词条；`DESIGN.md` 里还写着原型的 `selectedRow()`（现在叫 `listRow()`），留给 07 一起整理。
