# 通话层的 Spine 立绘

Label: wayfinder:map

## Destination

一份可以交给 agent 实现的 spec（`.scratch/spine-stand/spec.md` + `issues/`）：通话层叠一层与页游 ADV 一致的 stand Spine 立绘——待机会动、说话有口型、每段台词配情绪表情和动作、情绪在一次通话内延续、用户开口时她有反应，衣装由用户在本机选择。

## Notes

- 术语以 `CONTEXT.md` 为准：立绘、衣装、情绪、通话层、语气提示、只看文字。情绪 ≠ 语气提示。
- 素材在 `E:\Download\others\agent-test\shinycolors-spine`（Spine 3.6.53；`assets/spine/idols/{stand,stand_costume}/<enzaId>/data.{json,atlas,png}`，`spine_manifest.json` 有 idolId、衣装名）。stand + stand_costume 共 2215 套，每套约 0.7MB。
- 已知事实：`wait`、`smile1`、`surp1`、`yes`、`no`、`anger1`、`sad1`、`face_close`、`face_wait` 在全部 2215 套里都有；`hello`、`think` 只有约 60%；`lip_*` 命名不统一。
- 已定范围（charting 时的 grilling，2026-09-30）：只用 stand；只放通话层，叠在背景图上；衣装由用户选、存在本机；素材不进 git、部署时同步、只开放已配置的角色；心情在一次通话内延续；用户开口时的反应只靠前端（看向、点头），不理解内容。用户倾向用 Jev 判断情绪。
- 每个拍板类 ticket 都要调用 grilling 和 domain-modeling；UI 相关的遵守 AGENTS.md 的 Astryx 规则和 DESIGN.md「Call layer」。
- 这张地图只做计划：交付物是 spec，不是实现。

## Decisions so far

- [拍板：立绘素材怎么上线](issues/06-asset-delivery.md)：只同步已配置角色的全部 stand 衣装，放在部署时选定的 S3 兼容对象存储（公开可读、CORS、长期缓存），`characters.toml` 加偶像编号和默认衣装，缺素材时退回背景图；ADR-0003 补修订。
- [调研：Jev 能不能给台词判断情绪](issues/02-jev-emotion.md)：能。Choice 题型给出选项、各项概率和 confidence，一次请求可以判断整条回复；p50 约 0.4s，早于 Fish 首个音频；每段约 $0.00003；confidence 低或失败时要有兜底情绪。
- [调研：网页端怎么播放 Spine 3.6 的 stand 立绘](issues/01-spine-web-runtime.md)：用官方 spine-ts 3.6 的 `spine-webgl.js`，原样拷进仓库、在客户端加载；ADV 分轨道播放（0 身体、1 表情、2 点头、3 视线、5 口型），mix 0.3s；口型不看音量，说话时循环、说完闭嘴；许可证与 AGPL 冲突，另开 ticket 拍板。
- [拍板：Spine runtime 的许可证怎么处理](issues/08-spine-runtime-license.md)：暂不买 Editor 许可证、接受风险；runtime 原样放进单独的 vendor 目录，用 `<script>` 加载；项目许可证加 AGPL 第 7 节附加许可；见 ADR-0009。
- [调研：stand 动画词表的覆盖情况](issues/03-stand-animation-vocabulary.md)：七种情绪（平静、开心、害羞、惊讶、难过、生气、思考）都有高覆盖的身体和表情动画，要按衣装逐级找替代；fear 等覆盖率太低，不收；轨道 0 身体、1 表情、2 点头、3 视线、4 脸红、5 口型，叠加安全；口型是 `lip_<情绪>` 循环（停嘴不用 `_s`，改为冻结说话口型，见原型）。
- [拍板：情绪由谁来判断，词表是什么](issues/05-emotion-source-and-vocabulary.md)：通话中每段写完就调一次 Jev，和语音合成同时进行；七种情绪，同一次请求顺便判断点头或摇头；平淡的段沿用当前心情，下一条回复开头是平静时回到平静；置信度低、超时或失败都沿用当前心情；情绪不记进对话记录。
- [原型：通话层里的立绘](issues/04-stand-prototype.md)：手机用「大立绘」（从底部升起，字幕在上），电脑用「半身 ADV」（铺满做底，字幕在底部对话框里）；动作、过渡、看向你和点头都通过；spine-ts 3.6 剪裁 bug 要在自己的代码里绕开，停嘴要冻结说话口型第 0 帧（`animationEnd = 0`）；原型在分支 `prototype/spine-stand`。
- [拍板：口型跟什么走](issues/07-lip-sync.md)：pipecat 的开始/停止说话事件开关嘴（说话循环、停嘴冻结第 0 帧），不看音量；情绪和点头在这段声音开始播放时切换；只看文字时不动嘴，情绪随字幕切换；被打断时闭嘴并看向用户；收起通话层时暂停渲染。
- [调研：pipecat 怎么知道每段语音什么时候开始播放](issues/10-segment-playback-timing.md)：现有事件都标不出；可以在音频队列里插一条随播放发出的 `segment-playing` 消息（早 50–150ms），但 Fish 不给段落边界，要每段单独开会话（可能多出停顿）或各段并行；另开 ticket 拍板。
- [拍板：衣装在哪里选、怎么选](issues/09-outfit-picker.md)：对话页页首打电话键旁的「换衣装」，宽屏弹窗、窄屏底部面板；按卡片排列，私服/演出服切换，重复的只算一套；大预览加「穿这套」，存在本机；缩略图在同步素材时预先渲染。
- [拍板：每段语音开始播放的信号怎么做](issues/11-segment-start-signal.md)：每段一个 Fish 会话并预先开好下一个连接（实测不多出停顿，现开会话会停顿最长约 4 秒），段首插一条随播放发出的 `segment-playing` 消息，段落边界主动 flush；并行合成作为后备。
- [拍板：立绘在加载中、加载失败和减少动态效果时怎么表现](issues/12-stand-degraded-states.md)：空闲时预取当前衣装（省流量时不预取）；配了立绘就一直用立绘版布局，加载中只显示背景图、到了淡入；失败依次退到默认衣装、背景图，不提示；减少动态效果时去掉身体动作和升起入场，口型、表情、点头照常。
- [实测：手机上立绘的性能与内存](issues/13-mobile-performance.md)：Redmi Note 12 Turbo 上各档都稳 60 帧、每帧约 1ms，内存不随换衣装增长，上下文能恢复；定下像素比上限 2、最多 60 帧、PNG 不转 WebP；iPhone 留到实现后验收。

## Not yet specified

（暂无。）

## Out of scope

- cb（Q 版小人）立绘。
- 文字对话页的立绘。
- 按场合、季节自动换衣装。
- 心情跨通话保留。
- 给用户正在说的话另外调模型、做理解内容的即时反应（charting 时选了只靠前端）。
- 情绪分程度（例如「难过」加重成 `face_cry` 大哭）：要先看七种情绪做出来的效果才能判断，超出这张地图的终点（交出 spec），留给上线后另开。
