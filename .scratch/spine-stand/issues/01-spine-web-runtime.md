# 01: 调研：网页端怎么播放 Spine 3.6 的 stand 立绘

Type: research
Status: resolved
Blocked by: none

## Question

在 Next 16 / React 19 的前端里，用哪个 runtime 播放 Spine 3.6.53 的 stand 立绘（spine-ts 3.6 WebGL / canvas、pixi-spine 对应 3.6 的版本，或其他），它们的维护状态、包体积、能否与 React 19 共存；Spine Runtime 许可证对这种用法有什么限制。

页游 ADV 是怎么播放 stand 的：几条轨道、body / face / lip / eye 各放哪条、待机怎么循环、动作之间怎么 mix、口型怎么驱动、`blank` 等动画的作用。

必须搜索并参考已有项目：闪耀色彩的粉丝 Spine viewer、ADV/剧情重现播放器（GitHub 等），以及其他游戏的 Spine/Live2D 实时对话、AI 角色项目中「情绪 → 动作」的做法。记下每个项目的许可证；一手来源（EsotericSoftware/spine-runtimes 3.6 分支、Spine Runtime License）为准绳，标明哪些结论只来自粉丝项目。

## Research

调研在分支 `research/spine-web-runtime` 上进行，结论写在 [`research/spine-web-runtime.md`](../research/spine-web-runtime.md)（2026-10-01 从该分支挪进 main，分支已删除）。

## Answer

详细结论见 [`research/spine-web-runtime.md`](../research/spine-web-runtime.md)，下面是摘要：

- **推荐的 runtime**：官方 spine-ts 3.6 分支的 `spine-webgl.js`（压缩后约 176KB，gzip 后约 46KB）。它不依赖 React，只在客户端用 `<script>` 加载、通过 `window.spine` 调用，文件原样使用、不做修改。3.6 分支从 2019 年起就不再更新，也没有 npm 包，只能把文件拷进仓库；粉丝项目 ShinyColorsPet 用的就是同一个文件（校验和一致）。React 组件卸载时必须清理干净动画循环、贴图和 WebGL context，因为开发模式下 effect 会执行两次。
- **排除的方案**：canvas 后端画不了 mesh，而所有 stand 都用到了 mesh；官方 4.x 包读不了 3.6 的数据；`v8-spine37` 是个人维护的移植，风险太大。备选是 PixiJS v7 加 `pixi-spine@4`，但它对 3.7 以下的版本只是「有限支持」，体积大 4–5 倍，PixiJS v7 本身也已经是旧版本线。
- **许可证**（调研 agent 的解读，不是法律意见）：换成 pixi-spine 也受同一份 Spine 许可证约束。接入 runtime 的人需要有效的 Spine Editor 许可证；3.6 文件自带的许可证更严格，没有书面许可只允许个人或内部使用，并且禁止修改。本项目是 AGPL，Spine runtime 不能以 AGPL 发布。
- **ADV 的轨道**（来自粉丝重现播放器 ShinyColorsDB-EventViewer 和 150 份游戏剧情脚本，不是游戏客户端代码）：track 0 放身体动作，1 放表情或 `blank`，2 放只播一次的 `yes`/`no`，3 放 `eye_*` 视线，5 放 `lip_*` 口型。同一轨道切换动画时 mix 0.3s。`loop_start` 事件的意思是「开头播一次，之后从这里循环」，情绪动作会停在循环里，不会自己回到 `wait`。`relay` 事件的意思是「离开这个动作时先播 `arm_down*`」。`blank` 是空动画，放到某条轨道上就把控制权交还给下面的轨道。
- **口型**：不看音量。说话时循环播 `lip_<情绪>`，说完停在第 0 帧（闭嘴）；`lip_*_s` 是不说话时的静态嘴型。
- 文件里还整理了 ShinyColorsPet、AIRI、Open-LLM-VTuber 等项目把情绪映射到动作的做法。

**新发现的决策**：许可证问题（AGPL 与 Spine 许可证冲突、对公众开放与「仅限个人或内部使用」冲突）要由人拍板，已另开 ticket。
