# 调研：网页端怎么播放 Spine 3.6 的 stand 立绘

对应 ticket：`.scratch/spine-stand/issues/01-spine-web-runtime.md`。调研日期 2026-09-30。

来源标记：
- **【一手】**：Esoteric Software 的官方仓库、许可证、文档，或者本地素材 `data.json` 本身。
- **【粉丝】**：只出自粉丝项目（它们都不是 Cygames/BNE 的官方代码），是推断，不是定论。
- **【实测】**：本次调研自己跑脚本、统计得到的数字。

## 结论速览

1. **推荐 runtime：官方 spine-ts 3.6 的 WebGL 后端（`spine-webgl.js`，3.6 分支 build 产物，不改动）**，放在前端静态资源里，只在客户端加载，自己在 React 组件里管理 canvas、rAF 循环和销毁。体积约 176 KB（min）/ 约 46 KB（min+gzip），不依赖任何框架，和 React 19 / Next 16 不冲突。
2. 备选：PixiJS v7 + `pixi-spine@4`（靠 `@pixi-spine/runtime-3.7` 去解析 3.6 数据）。页游 ADV 重现播放器就是这么跑的，但体积大几倍，官方明说 3.7 以下「支持有限」，PixiJS v7 这条线也已停止维护。
3. 排除：spine-ts **Canvas** 后端（不支持 mesh，stand 全是 mesh）；官方 npm 包 `@esotericsoftware/spine-*`（只有 4.x，读不了 3.6 数据）；`v8-spine37`（个人维护的 PixiJS v8 移植版）。
4. **许可证是最大风险**：不管用官方 spine-ts 还是 pixi-spine，都受 Spine Runtimes 许可证约束。把 runtime 集成进软件的人需要有效的 **Spine Editor 许可证**；3.6 分支自带的 v2.5 许可证更严，在没有书面许可的情况下只允许个人或内部使用。本项目是 AGPL-3.0，而 Spine runtime 不能按 AGPL 授权，需要单独隔离，最好再加一条 AGPL 附加许可（见第 3 节）。
5. **页游 ADV 的轨道布局**（出自粉丝重现播放器和它读取的游戏剧本 JSON）：track 0 = 身体动作（`wait*`、`smile1` 等），track 1 = 表情（`face_*` 或 `blank`），track 2 = 点头/摇头（`yes`/`no`，不循环），track 3 = 视线（`eye_*`），track 4 = 预留，track 5 = 口型（`lip_*`）。同一条轨道上换动画时 mix 0.3 秒。动画里的事件 `loop_start` 表示「开头播一次，之后从这个时间点开始循环」；`relay` 表示「从这个动画离开时，先播指定的放下手臂动画（`arm_down*`）」。口型不跟着音量走：语音播放期间循环播 `lip_<情绪>`，语音一结束就把这条轨道冻结在第 0 帧（闭嘴）；没有语音时放 `lip_<情绪>_s`（静态嘴形）。`blank` 是一个空动画，放在表情轨道上时，脸就交还给身体动作里自带的表情。

---

## 1. Runtime 候选

### 1.1 版本约束【一手】

- 本地素材 `data.json` 的 `skeleton.spine` 全部是 `3.6.53`（【实测】随机抽了 stand + stand_costume 共 300 套，全都是）。
- 官方规定：导出数据的 major.minor 版本必须和 runtime 版本一致，否则 runtime 读不了；升级 runtime 后必须用新版编辑器重新导出。来源：<https://esotericsoftware.com/spine-versioning>。
  → 能直接读这些数据的只有 **3.6 的 runtime**。3.7 的 runtime 能读，是 pixi-spine 自己在解析器里打了补丁，官方并不保证。我们手上没有 Spine 工程文件，也不能用新版编辑器重新导出（「导入 JSON 再导出」理论上可行，但需要编辑器许可证，而且会改动素材，这里不考虑）。
- stand 里用到的特性：mesh attachment（`1030010010` 里有 68 个 mesh）、deform、drawOrder、transform constraint、boundingbox、事件时间轴（【实测】）。

### 1.2 官方 spine-ts 3.6【一手】

来源：`EsotericSoftware/spine-runtimes` 的 `3.6` 分支（HEAD `654c20e5`，最后一次提交在 **2019-05-13**），目录 `spine-ts/`，README：<https://github.com/EsotericSoftware/spine-runtimes/blob/3.6/spine-ts/README.md>。

| 模块 | build 文件 | 原始大小 | 说明 |
|---|---|---|---|
| core | `spine-core.js` | 237 KB | 只有解析和动画状态，不负责渲染 |
| **webgl** | `spine-webgl.js` | 343 KB（terser 压缩后 176 KB，再 gzip 约 46 KB）【实测】 | 「WebGL & Widget backends supports all Spine features」 |
| canvas | `spine-canvas.js` | 247 KB | 「does not support color tinting, mesh attachments and clipping」→ **stand 用不了** |
| widget | `spine-widget.js` | 356 KB | 基于 WebGL 的开箱即用组件，控制粒度不够（这里要多轨道、要精确控制） |
| threejs | `spine-threejs.js` | 252 KB | 需要 three.js，不必要 |

- **维护状态**：分支已冻结，不会再有修复。npm 上没有官方的 3.6 包（`@esotericsoftware/spine-webgl` 从 4.0.1 起步，当前是 4.3.13）。只能把 build 文件拷进仓库（vendor）。
- **模块形态**：build 产物是 TypeScript namespace 编译出来的全局脚本（`var spine; (function (spine) {...})`）。README 说，要当 ES module 用就要在文件末尾自己加 `export { spine };`，但这等于修改 runtime，和 v2.5 许可证的「不得修改」冲突（见第 3 节）。所以建议**不改文件**：放进 `public/`，运行时用 `<script>` 注入，从 `window.spine` 取；类型用同一分支的 `spine-webgl.d.ts`。
- 渲染要点（3.6 API）：`spine.webgl.ManagedWebGLRenderingContext`、`AssetManager`（加载 json/atlas/png）、`SkeletonJson` + `AtlasAttachmentLoader`、`AnimationState` / `AnimationStateData`、`SceneRenderer` 或 `SkeletonRenderer` + `PolygonBatcher`。
- 【粉丝】ShinyColorsPet（第 4.3 节）用的是**完全相同的文件**：它的 THIRD_PARTY_NOTICES 里记的 SHA-256 `2883daee…891794`，和本次从 3.6 分支下载的 `spine-webgl.js` 一致【实测】。它在 Qt WebEngine 里跑 3.6.53 的 stand，60 个动画都能正常求值。它还记录了一条渲染经验：要在纹理上传前打开 `UNPACK_PREMULTIPLY_ALPHA_WEBGL`，同时设 `SkeletonRenderer.premultipliedAlpha = true`；否则部分模型（如 `1940100010`）脸上会出现白色瑕疵，关节处会有细线。这是粉丝项目的经验，原型阶段需要自己验证。

### 1.3 pixi-spine【一手，外加粉丝的使用证据】

- 仓库 `pixijs/spine`（没有归档，最后一次 push 在 2025-03-24），README：「Spine 3.7, 3.8, 4.0, 4.1 implementation for PixiJS v7」「For spine < 3.7 support is limited」。版本对应关系：PixiJS v5–v6 对应 pixi-spine v3.x，v7 对应 v4.x。PixiJS v8 + Spine 4.2 的 `pixijs/spine-v8` **已归档**，改由官方 `@esotericsoftware/spine-pixi-v8`（只支持 4.x）接手。
- 3.6 数据怎么读：`packages/loader-uni/src/versions.ts` 里的 `detectSpineVersion`，遇到版本号低于 3.7 的数据会写着「try parse old versions with 3.7」，交给 `@pixi-spine/runtime-3.7` 处理。
- npm：`pixi-spine@4.0.6`（2025-03），peerDependencies 是 `@pixi/*@^7`；license 字段写的是 `SEE SPINE-LICENSE`，**它本身就是 Spine Runtime 的衍生作品，许可证约束跟官方 runtime 一样，用它绕不开许可证**。
- 体积【实测】：`pixi.js@7.4.3` 的 `pixi.min.js` 456 KB / gzip 136 KB；`pixi-spine@4.0.6` 的 `dist/pixi-spine.js` 362 KB / gzip 95 KB（这个包含 3.7/3.8/4.1 三套 runtime，按需引入 `@pixi-spine/runtime-3.7` 可以小一些）。总体是官方 spine-webgl 的 4–5 倍。
- 【粉丝】ShinyColorsDB-EventViewer 用的是 `pixi.js v6.5.9` + `pixi-spine v3.0.13`（UMD 版，走 3.7 runtime 解析），能整段播放游戏剧情，说明「用 3.7 runtime 读 shiny colors 的 3.6 数据」在实际使用中可行。
- 什么时候值得用 Pixi：需要在同一个画布里做背景、多角色、滤镜、字幕等场景合成时。我们的通话层只需要一个角色叠在背景图上，背景图可以直接用 DOM/CSS 做，Pixi 带来的好处抵不上它的体积，而且 v7 已是旧线。

### 1.4 其他

- `v8-spine37`（npm，维护者 `cpk_`，只有一个版本 1.1.0，2025-01；license 同样是 `SEE SPINE-LICENSE`）：把 Spine 3.7 移植到 PixiJS v8 的个人包。【粉丝】ShinyColorsDB-SpineViewer 用的就是它（`public/v8-spine37.js`，gzip 约 61 KB，加上 pixi v8.5.2 gzip 约 183 KB）。维护风险高，不推荐。
- 官方 4.x（`@esotericsoftware/spine-webgl`、`spine-player`、`spine-pixi-v8`）：维护积极，但按 spine-versioning 的规定**读不了 3.6 数据**，排除。

### 1.5 与 Next 16 / React 19 共存

这几个 runtime 都不依赖 React，完全是命令式的 WebGL 调用，不存在「和 React 19 冲突」的问题。需要注意的是（这些是 Web/React 的通用做法，不来自 Spine 文档）：

- 只能在客户端运行：组件标 `"use client"`，在 `useEffect` 里注入脚本、创建 WebGL 上下文，不参与 SSR。
- App Router 在开发模式下默认开启 StrictMode，effect 会执行两次。cleanup 里必须取消 rAF、释放纹理（3.6 的 `AssetManager.dispose()`），并且最好用 `WEBGL_lose_context` 主动释放上下文。浏览器对同时存在的 WebGL 上下文有数量上限。
- 前端现有依赖（`next ^16.3.6`、`react ^19.3.0`、Astryx）都不牵涉 canvas，没有冲突点。立绘这一层只需要一个 `<canvas>` 元素叠在背景图上；它的外框和布局仍然按 AGENTS.md 的规则用 Astryx 组件来做。

## 2. 页游 ADV 怎么播放 stand

### 2.1 从素材本身能确认的事实【一手（素材 `data.json`）+ 实测】

以 `stand/1030010010`（3.6.53）为例，另随机抽了 300 套统计：

- 事件定义：300 套**全部**有 `loop_start` 和 `relay`；16 套有 `pose`，1 套有 `lip`。
- `loop_start`（不带参数）出现在 `wait1-4`、`hello`、`smile1-3`、`shy1-2`、`sad1-2`、`anger1-3`、`surp1-2`、`think`、`touch`、`wait_return_L/R` 里，时间在 1.7–6 秒之间。比如 `smile1` 全长 12.63 秒，`loop_start` 在 5.97 秒。
- `relay`（带字符串参数）出现在 t=0，参数是 `arm_down` / `arm_down_R` / `arm_down_L` / `arm_down_surp` / `arm_down_L2` 等。例如 `smile1 → arm_down`、`shy1 → arm_down_R`、`surp1 → arm_down_surp`。
- `blank`：299/300 套是 `{}`（没有任何时间轴，时长 0）。有 1 套在里面放了一个 `body_control` 的位移。
- `face_*` 只控制眼、眉、脸颊相关的骨骼、插槽和 deform。`face_close`、`face_smile*` 时长为 0（静态表情）；`face_wait`、`face_sad` 等时长 4–5 秒（带眨眼）。
- `lip_*` 只控制 `mouse`（有的套是 `mouth`）这一根骨骼和它的插槽。`lip_smile` 时长 1.5 秒，在 `mouse` 和 `mouth_open` 两个附件之间来回切换，并配合 scale 动画（一张一合的循环）。`lip_*_s` 时长为 0，是单帧的静态嘴形。`lip_a` 是张到最大的「あ」口型（出现在 230/300 套里）。
- `eye_front/left/right` 时长 0，只移动 `eyes`、`eye_L`、`eye_R` 骨骼。`yes` / `no` 只动 `face_control` 骨骼（1.33 秒 / 2 秒）。
- 身体动作（`wait`、`smile1` 等）会动 23–46 根骨骼，**也带着眼睛和眼皮插槽的关键帧**，也就是说身体动作里自带一套表情。

### 2.2 Spine 3.6 AnimationState 的语义【一手】

来源：`spine-ts/core/src/AnimationState.ts`（3.6 分支）。

- 按轨道序号从低到高依次 apply，track 0 用 `MixPose.current`，其余轨道用 `MixPose.currentLayered`（第 148 行）。高轨道在同一个属性上**覆盖**低轨道的结果；高轨道没有 key 的属性保持低轨道的值。所以把表情、口型、视线放在高轨道，就能盖住身体动作里自带的同名 key。
- 同一轨道换动画时，旧动画会在 `mixDuration` 内淡出（`applyMixingFrom`）。mix 时长来自 `AnimationStateData.setMix(from, to, dur)` 或 `defaultMix`，也可以直接改 `TrackEntry.mixDuration`。
- 官方用来清空轨道的方式是 `setEmptyAnimation(track, mixDuration)`（第 479 行），内部用的是一个时长 0、没有时间轴的 `emptyAnimation`（第 33 行）。**素材里的 `blank` 在数据上就等价于这个空动画**：把它放到表情轨道上，这条轨道就不再覆盖任何东西，身体动作里的表情重新显示出来；再配合 mix，就能平滑地过渡回去。（`blank` 是游戏设计的一部分，这一点是推断；它的数据形态和运行效果是一手事实。）
- `TrackEntry` 有 `alpha`、`timeScale`、`trackTime`、`loop`，`listener` 有 `complete`、`event` 等回调，可以用来实现 `loop_start` 和按音量混合的口型。

### 2.3 页游剧本怎么指挥 stand【粉丝】

来源：ShinyColorsDB-EventViewer（<https://github.com/ShinyColorsDB/ShinyColorsDB-EventViewer>，commit `ba51fdd`，`scripts/SpineManager.js`、`scripts/TrackManager.js`，**仓库没有 LICENSE 文件**）。它读取的剧本 JSON 来自 `https://viewer.shinycolors.moe/json/<type>/<id>.json`，字段名（`charAnim1..5`、`charAnim{n}Loop`、`charLipAnim`、`lipAnimDuration`、`charCategory` 等）应该就是游戏原始剧本的格式；代码注释里出现的 `TRACK_INDEXES.LIP_ANIM` 也像是照着游戏客户端的常量写的。**这些都是推断，没有拿到游戏客户端代码做对照。**

轨道分配（`_setCharacterAnimation(anim, loop, trackNo)`）：

| 剧本字段 | track | 【实测】随机抽 150 个剧本、共约 5,300 次指令的实际内容 |
|---|---|---|
| `charAnim1` | 0 | 全是身体动作：`wait*` 3187 次、`surp*` 447、`smile*` 444、`sad*` 396、`anger*` 276、`shy*` 270、`think` 173，其余是 `touch`/`hello`/`shrug`/`wink`/`serious`/`why`/`sleep` 等 |
| `charAnim2` | 1 | `face_*` 3538 次、`blank` 1205 次 |
| `charAnim3` | 2 | `yes` 96、`no` 54、`blank` 25；带 `charAnim3Loop: false` 的有 150 次 |
| `charAnim4` | 3 | `eye_right` 105、`eye_left` 69、`eye_front` 18、`blank` 166 |
| `charAnim5` | 4 | 样本里没出现 |
| `charLipAnim` | 5 | `lip_*` 4633 次 |

播放规则（`SpineManager.js`）：

- **循环**：`charAnim{n}Loop` 默认是 `true`。如果动画带有 `loop_start` 事件，就先不循环地播一遍，在 `complete` 回调里重新 `setAnimation` 同一个动画，并把 `trackTime` 设到 `loop_start` 的时间。效果是「开头的动作只做一次，之后循环尾段的姿势」。`wait`（无编号）没有 `loop_start`，整段循环。**注意：情绪身体动作播完开头后会停在它自己的循环尾段，不会自动回到 `wait`**；剧本要回到平静，得再显式下一次 `charAnim1: wait`（样本里很常见）。
- **mix**：同一轨道上从旧动画切到新动画，固定 `setMix(before, now, 0.3)`。
- **relay**：如果**旧动画**带有 `relay` 事件，先 `setAnimation(track, relay动画, false)`，再 `addAnimation(track, 新动画, loop)`，两段各 mix 0.3 秒。作用是先把举着的手臂放下（`arm_down*`），再进入新动作，避免手臂姿势直接跳变。
- **口型**：`charLipAnim` 放在 track 5，并且循环。语音结束时（`SoundManager` 在 `end` 或被下一句打断时回调 `stopLipAnimation`），把 lip 轨道的 `time` 设为 0、`timeScale` 设为 0，也就是冻结在第 0 帧（闭嘴）。有 `lipAnimDuration` 时，按秒数定时冻结。**口型完全不看音量。**
- 【实测】`charLipAnim` 和语音的关系：有语音时用非 `_s` 的 lip 共 3257 次，没语音时用 `_s` 共 994 次，有语音却用 `_s` 的 351 次，没语音却用非 `_s` 的 34 次。可以看出：`lip_<情绪>` = 说话时一张一合的循环，`lip_<情绪>_s` = 不说话时这种情绪的静态嘴形（`_s` 大概是 silent/static 的意思，这是推断）。
- `blank` 用在 track 1 / 2 / 3 上，作用是「这条轨道不再覆盖」：表情交还给身体动作，或者结束点头、结束视线偏移。
- 皮肤：先 `setSkinByName('normal')`，失败再退回 `default`（本地 300 套都只有 `default`）。

### 2.4 对我们的直接启发（建议，需要原型验证）

- 轨道沿用游戏的编号：0 身体 / 1 表情 / 2 点头摇头 / 3 视线 / 5 口型。这样本地素材的表现和游戏一致，排查问题时也可以对照 EventViewer。
- 情绪 → `charAnim1` 身体动作（遵守 `loop_start` 和 `relay`），加上 `charAnim2` 的 `face_*`（或 `blank`），再加上 lip 的情绪变体。
- 说话时：lip 轨道放 `lip_<情绪>` 并循环，TTS 停止时冻结到第 0 帧，或者切到 `lip_<情绪>_s`。想要更贴合声音，可以参考 ShinyColorsPet 和 Open-LLM-VTuber 的做法：用 `lip_a` 当作「张嘴」姿势，把 `TrackEntry.alpha` 设成实时 RMS。这是 ticket 07 要拍板的事。
- 用户开口时「看向/点头」：track 3 放 `eye_front`，track 2 放 `yes`（loop=false），结束后再放 `blank`。

## 3. Spine Runtime 许可证

### 3.1 文本【一手】

- **3.6 分支自带的是 Spine Runtimes Software License v2.5**（`spine-ts/LICENSE`，2013–2016）：许可范围是「solely for personal or internal use」；没有 Esoteric 的书面许可（即 Spine Software License 第 2 节）时，不得「modify, translate, adapt, or develop new applications using the Spine Runtimes」；二进制或源码再分发时必须附带这份许可证。3.6 的 README 也写着：「may only be used for personal or internal use, typically to evaluate Spine before purchasing. If you would like to incorporate a Spine Runtime into your applications, distribute software containing a Spine Runtime, or modify a Spine Runtime, then you will need a valid Spine license」。
- **现行版本是 Spine Runtimes License Agreement（2025-04-05，写明「Replaces all prior versions」）**，在 master 的 `LICENSE`，以及 <https://esotericsoftware.com/spine-runtimes-license>：把 runtime 集成进软件或制作衍生作品，要么符合 Spine Editor License Agreement 第 2 节，要么「each user of the Products must obtain their own Spine Editor license」，并且再分发时要附上许可证和版权声明。
- Spine Editor License 第 2 节（<https://esotericsoftware.com/spine-editor-license>）：2.1 规定，集成时必须持有有效的 Spine Editor 许可证，并且产品要「adds significant and primary functionality」；2.2–2.3 规定，满足条件后可以分发（许可期满后也可以）；2.4 规定，**集成或开发含 runtime 的衍生作品都需要有效的 Editor 许可证**。
- pixi-spine 和 v8-spine37 的 npm license 字段都是 `SEE SPINE-LICENSE`，适用同一套条款。

### 3.2 对本项目意味着什么（解读，不是法律意见）

1. **仓库主人（集成者）至少要持有一份有效的 Spine Editor 许可证**，才能合规地把 3.6 runtime 集成进 eidolon 并部署。按 v2.5 字面理解，没有许可证时只能个人或内部使用，公开部署不行。
2. **开源协作的问题**：按 2.4(b) 的字面意思，其他人如果修改或开发包含 runtime 的产物，也各自需要 Editor 许可证。ShinyColorsPet 的做法是**只放一个未改动的 `spine-webgl.js` + LICENSE + README**，并把它明确划出 GPL 的覆盖范围（「not licensed under this project's GPL-3.0-only license」）。
3. **和 AGPL-3.0 的关系**：Spine runtime 不能按 AGPL 再授权；AGPL 要求「Corresponding Source」覆盖整个作品。常见的处理方式是在项目许可证里加一条 GPL/AGPL 第 7 节的「附加许可」（例如「允许与 Esoteric Software 的 Spine Runtimes 组合并一起分发」），并把 runtime 放在单独的目录里、附上它自己的 LICENSE、不做修改。这需要仓库主人（版权人）自己拍板。
4. **不要修改 runtime 文件**（连 README 建议的 `export { spine }` 也不要加）。用 `<script>` 加载原文件，再从 `window.spine` 取用，这样最干净。
5. 素材（立绘本身）的版权归 BANDAI NAMCO 等权利人，这和 runtime 许可证是两回事。「素材不进 git、只开放已配置的角色」已由 map 定下，这里不展开。

## 4. 已有项目参考

| 项目 | 链接 | 许可证 | 技术栈 | 可借鉴的点 |
|---|---|---|---|---|
| ShinyColorsDB-EventViewer | <https://github.com/ShinyColorsDB/ShinyColorsDB-EventViewer> | **无 LICENSE**（默认保留所有权利，只能参考思路，不能拷代码） | 纯 JS，pixi.js 6.5.9 + pixi-spine 3.0.13（3.7 runtime） | 游戏剧本字段、轨道分配、`loop_start`/`relay`/lip 冻结的实现（第 2.3 节） |
| ShinyColorsDB-SpineViewer | <https://github.com/ShinyColorsDB/ShinyColorsDB-SpineViewer>（站点 spine.shinycolors.moe） | **无 LICENSE** | Vue 3 + pixi.js 8.5.2 + `v8-spine37` | 全部衣装的浏览器；动画按索引各占一条轨道、勾选即播，**不是** ADV 的播放方式；皮肤同样先试 `normal` 再退回 `default` |
| mitian233/ShinyColorsDB-SpineViewer-vue | <https://github.com/mitian233/ShinyColorsDB-SpineViewer-vue> | 无 LICENSE | 上面那个项目的 Vue 版分支 | 没有额外发现 |
| ShinyColorsPet | <https://github.com/jerygood870208/ShinyColorsPet>（commit `643e42d`） | GPL-3.0（Spine runtime 单独隔离） | Python/PySide6 + Qt WebEngine + **官方 spine-webgl 3.6** | 与本项目最接近的「闪耀色彩 AI 角色」：LLM 在回复里写 `[action:x]`/`[expression:x]` 标签，按 manifest 白名单过滤；情绪分组候选（happy→`smile1-4`、sad→`sad1-2`、angry→`anger1-3`、surprised→`surp1-2`、shy→`shy1-3`、thinking→`think`、agree→`yes*`、disagree→`no*`），表情分组 `face_*`；轨道分配 base0/gesture1/face2/lipsync3/gaze4（**和游戏不同**）；口型用 `lip_a` 当作 `animation_mix`，以 30Hz 的 RMS×8 作为 alpha；视线用 `eye_left/front/right`；ADR 记下了 PMA 修复和「全身手势在 base 轨道上直接替换 idle、mix 为 0」来避免抬起的手被清掉 |
| Project AIRI（`@proj-airi/stage-ui-spine`） | <https://github.com/moeru-ai/airi/tree/main/packages/stage-ui-spine> | MIT（包内 LICENSE.md 把 Spine runtime 另列） | Vue + 官方 `@esotericsoftware/spine-webgl` 4.x | 情绪枚举（happy/sad/angry/think/surprised/awkward/question/curious/neutral）→ 动画名；`SPINE_IDLE_TRACK = 0` 持续待机，`SPINE_EMOTION_TRACK = 1` 叠加一次性情绪动作；动画名缺失时退回骨架里存在的名字 |
| Open-LLM-VTuber | <https://github.com/Open-LLM-VTuber/Open-LLM-VTuber> | MIT（Live2D 示例模型另有许可） | Python 后端 + Live2D 前端 | `model_dict.json` 的 `emotionMap`：LLM 输出的情绪关键词 → 表情编号；后端把 TTS 音频按 20ms 切片算 RMS、归一化成 `volumes` 数组，和音频一起下发，前端按这个数组驱动嘴型（`utils/stream_audio.py`） |
| Lucie-AI | <https://github.com/vincenzo-afk/Lucie-AI> | MIT | FastAPI + PixiJS 8 + Live2D | LLM 输出 JSON `{text, emotion, gesture}`，情绪 → Live2D 参数目标值；前端用 Web Audio 实时计算振幅，驱动 `ParamMouthOpenY`；说话时暂停待机动作 |
| misaki-chatbot（碧蓝档案） | <https://github.com/andri-jpg/misaki-chatbot> | 无 LICENSE | Spine WebGL + GPT-SoVITS | 口型目前是「通用的张合循环」，README 把音素级口型列为待做（和游戏 ADV 的做法一样，不看音量） |
| AronaAI（碧蓝档案） | <https://github.com/jeff2009wang/AronaAI> | 无 LICENSE | Qt/C++ + spine-cpp | 桌面端 Spine 角色 + LLM，没有深入看 |

「情绪 → 动作」的共同模式【粉丝/第三方，仅供参考】：

- 情绪来源：要么 LLM 在回复里内嵌标签或 JSON（ShinyColorsPet、Lucie、Open-LLM-VTuber、AIRI），要么另外调一个分类器或规划模型（spindl 用 DistilBERT，Anima 用单独的 `/api/motion-plan`）。本项目倾向用 Jev，属于后一类，是 ticket 02/05 的范围。
- 情绪集合都只有 6–9 个粗粒度类别，再由每个模型各自的映射表落到具体动画名，并且**要按当前骨架实际有哪些动画来过滤或回退**。这一点对 2215 套覆盖率不一的 stand 尤其重要（ticket 03）。
- 分层：待机循环放在低轨道，情绪或手势叠在高轨道，或者直接替换 base 轨道。ShinyColorsPet 实测发现，把全身动作叠在待机上层会清掉抬手用的附件，于是改成直接替换 base 轨道。这和游戏的「track 0 直接换身体动作 + relay 放下手臂」是一致的。
- 口型：游戏和 misaki 用「播放期间循环张合」；ShinyColorsPet、Open-LLM-VTuber、Lucie 用「实时 RMS → 张嘴程度」。

## 5. 未解决的问题和风险

- 仓库主人有没有 Spine Editor 许可证、愿不愿意为 AGPL 加附加许可：这是能否上线的前提，需要拍板。
- 官方 3.6 WebGL 能不能正确渲染全部 2215 套：只有 ShinyColorsPet 的一套 fixture 和它的 PMA 修复记录可以参考，需要在原型（ticket 04）里抽样核对。
- `pose` 事件（16/300）、`lip` 事件（1/300）的用途不明；EventViewer 读了 `lip` 事件的字符串，但没有使用。
- 手机端的 WebGL 内存：每套一张 1024×1024 贴图，单角色应该没问题，但还没有实测。
- 本调研没能拿到游戏客户端代码，第 2.3 节的轨道语义都以 EventViewer 为准；EventViewer 用的是 3.7 runtime，和游戏实际用的 runtime 可能有细微差别。

## 附：本次核对过的一手材料

- `EsotericSoftware/spine-runtimes@3.6`（`654c20e5`）：`spine-ts/README.md`、`spine-ts/LICENSE`、`spine-ts/build/*`（大小）、`spine-ts/core/src/AnimationState.ts`。
- `EsotericSoftware/spine-runtimes` master `LICENSE`（2025-04-05）；<https://esotericsoftware.com/spine-runtimes-license>；<https://esotericsoftware.com/spine-editor-license>；<https://esotericsoftware.com/spine-versioning>。
- `pixijs/spine@1c2ee01`：README、`packages/loader-uni/src/versions.ts`；npm 上 `pixi-spine`、`@pixi-spine/runtime-3.7`、`v8-spine37`、`@esotericsoftware/spine-*` 的元数据。
- 本地素材：`E:\Download\others\agent-test\shinycolors-spine\assets\spine\idols\stand\1030010010\data.json` 的完整动画表，以及随机抽取的 300 套 stand/stand_costume。
