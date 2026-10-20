# 落地页设计调研 · 第 2 组：光、色、着色器作主视觉

调研日期：2026-10-10。对象：2024–2026 年获 Awwwards / FWA / CSSDA 奖项，或在 WebGL 圈有公认度、以光、色散、焦散、渐变场为主视觉，或者“颜色本身就是内容”的网站，共 6 个。

**怎么测的**：用 Node + Playwright 自写脚本（不走 MCP），Chromium 无头模式，但通过 `--use-angle=d3d11` 跑在真实显卡上（RTX 3060 Laptop），不是 SwiftShader 软件渲染。

- 电脑端：1440×900 视口，滚轮分小步推进，每帧停 1.2–1.8 秒后截图。
- 手机端：`devices['iPhone 13']` 模拟。先在 1.6 Mbps 下行、150 ms RTT、CPU 降速 4 倍的条件下量 LCP，再取消节流截图。
- JS 体积：把加载到的脚本全部落盘，本地 `gzip -9` 估算，所以是“估算 gz”，不是服务器实际传输量。
- 帧率：用 2 秒内 rAF 次数近似。桌面独显上普遍 100–145，只能看出“有没有明显掉帧”，不代表手机表现。
- 减弱动态（reduced motion）：用 `reducedMotion: 'reduce'` 再开一次页面，对比截图。同时在 JS 里搜 `prefers-reduced-motion` 看站点有没有处理。

所有数字都是粗测。截图在 [group2/](group2/) 目录。

---

## 1. 结论

### 1.1 可以直接借鉴的手法（按幕）

**① 色散要做多次光谱采样，不要做 RGB 三通道错位** —— 用在第 1 幕分光、第 8 幕汇聚、各幕之间的转场。

- **Igloo 的做法**：转场着色器沿桶形畸变方向采样 5 次，每次按一条光谱权重函数加权后累加。同时用蓝噪声纹理给每个像素做抖动，把采样之间的分层抹平，所以出来的是连续彩虹边（见 [igloo-t3](group2/igloo-t3.jpg)）。
- **Dispersion 的做法**：更彻底，出射时按 7 个波长分别算折射率（Cauchy 公式、真实阿贝数），再合成颜色。
- **我们怎么做**：在 OGL 的全屏片元着色器里，完整档 5 次采样、简化档 3 次、静态档 1 次，抖动用一张 64×64 的蓝噪声纹理。色散强度挂在两个 uniform 上：滚动进度，和 Lenis 给出的滚动速度（滚得越快，分得越开）。

**② 物理光谱要“量化”到 28 条官方色带** —— 第 1 幕的关键。

- **问题**：真实棱镜出来的是连续彩虹，会出现大量官方色之外的中间色（青绿、橙红之类）。这会冲淡“这一道光就是这一位偶像”的认知。
- **建议**：只在棱镜出口几百像素内保留连续色散（让人认出“这是分光”）。光线往外走，按出射角查一张 28×1 的调色板纹理，把颜色吸附成官方色，光束也从模糊扇面收拢成 28 条边缘清晰的光带。官方色只存在这张纹理里，着色器只读不改。
- **出射顺序要取舍**：Dropbox 的 18 个强调色是**按色相排序**的（见 [dropboxcolor-7](group2/dropboxcolor-7.jpg)），多色读起来像一条平静的光谱。我们第 2 幕却要按组合分段，二者冲突。可选做法：
  - 第 1 幕按色相出射，进入第 2 幕时光带“归队”，重排成组合顺序。这个重排本身就是一个好看的转场。
  - 或者一开始就按组合出射，放弃物理正确。
  - 这需要设计定。

**③ 每个官方色离线配好一组“同色相”的 token，不要在运行时随手 mix**

这一条在第 2 幕聚焦、第 3 幕字幕、第 4 幕来电都要用。

- **Dropbox 首页**：每块色块都是“饱和底色 + 同色相深色墨”，比如黄底配深棕引号、青底配深青 logo、橙红底配酒红 Aa（见 [dropbox-6](group2/dropbox-6.jpg)、[dropbox-m3](group2/dropbox-m3.jpg)）。
- **Dropbox 的 /color 页**：整页背景会随滚动换成当前强调色的**极深同色相**，比如墨绿底配石灰绿字、深棕底配橙字、深紫底配淡紫字（见 [dropboxcolor-2](group2/dropboxcolor-2.jpg)、[dropboxcolor-3](group2/dropboxcolor-3.jpg)、[dropboxcolor-4](group2/dropboxcolor-4.jpg)）。
- **我们的做法**：28 色各自离线算 4 个值：
  - `core`：官方 HEX，不改；
  - `deep`：同色相，OKLCH 的 L≈0.16–0.20，C 压低，用作聚焦时的背景；
  - `glow`：同色相、L 更高，用作光晕；
  - `ink`：放在 core 上能读的文字色。

  第 2 幕聚焦某位偶像时，背景从中性黑过渡到她的 `deep`。这样既满足“永远深色”，又让每位偶像拥有自己的夜色。所有插值都在 OKLab 里做，不要在 sRGB 里做：sRGB 线性插值时，粉和蓝之间会发灰发脏。

**④ 亮色做线，暗色做面** —— 第 1、2 幕。

- **实测数据**：官方色里，#144384 在纯黑上的对比度只有 2.2:1（OKLCH 的 L 为 0.39）；#ffbad6 是 13.2:1，#ffe012 是 15.9:1。
- **后果**：同样宽度、同样强度的光束，深蓝几乎看不见，亮黄会刺眼。
- **解法一：每条光束 = 白热核心 + 官方色光晕**。光学上也成立：强光的核心接近白。光晕宽度和强度按该色的感知亮度反向补偿，深色更宽更亮，浅色收窄。Igloo 冰块边缘、Cerebrium 光路都是这个结构：一个热高光加一圈色。
- **解法二：深色偶像在聚焦时以“面”出现**，比如她的 `deep→core` 大面积场。Dropbox 首页的藏青块就是这样立住的。

**⑤ 光与 DOM 文字的三种已验证叠法**，按需选用：

| 叠法 | 先例 | 我们用在 |
|---|---|---|
| a. 着色器在下、DOM 文字在上（默认） | Cerebrium、Gentle Rain | 大部分幕 |
| b. 光层在上：一张 `pointer-events:none` 的 canvas，用混合模式盖在 DOM 上 | Daylight：`alpha:false` 的 WebGL canvas 以 `mix-blend-mode: multiply` 盖住全页。白色等于不变，只会压暗，所以叶影扫过时文字始终可读（见 [daylight-2](group2/daylight-2.jpg)） | 深色版本把 multiply 换成 `screen`：黑色等于不变，只会提亮。第 1 幕光束扫过标题、第 6 幕光迹从文字上掠过 |
| c. 文字画进纹理，让光“穿过”文字 | Dispersion：用 2D canvas `fillText` 画成纹理，放在玻璃后面，被折射、翻转并带上色边（见 [dispersion-1](group2/dispersion-1.jpg)）。Igloo 则把整个 UI 用 MSDF 画在 WebGL 里，做 glitch 和乱码动画（见 [igloo-4](group2/igloo-4.jpg)） | 只用于第 0 幕标题和第 2 幕竖排巨大日文名“被光扫过”的瞬间；同时保留一份与纹理对齐的 DOM 文本，给 SEO、读屏和复制用 |

**⑥ 焦散用便宜的做法** —— 第 6 幕剧情回忆（抽象光迹），也可以给第 3 幕字幕区当底纹。

- **Igloo（便宜版）**：一张预烘焙的焦散 KTX2 贴图，按两种尺度、两个方向滚动，两次采样取 `min`，再乘回底色。只要一个 pass、两次采样。
- **Gentle Rain（真实版）**：细分平面在顶点着色器里按水面法线图折射，用面积变化求亮度，渲染到 FBO 后再模糊。色散焦散是同一网格画 3 遍，每遍一个颜色通道、各用不同的折射率（eta）。
- **建议**：我们用便宜版。真实版只留给完整档的第 6 幕。

**⑦ 光路脉冲，做“记忆在偶像间传递”** —— 第 5 幕。

- **Cerebrium 的做法**：发光网络的路径是静态网格，什么都不动。着色器只让一段不透明度遮罩沿 UV 方向前进，每条路径的偏移、速度、间隔各不相同，所以看起来像信号在网络里流动。
- **我们怎么做**：28 个光点之间预先算好曲线，一条“传话”就是沿曲线跑的一段光，颜色从发送者的 core 渐变到接收者的 core。成本几乎为零，手机也能跑。

**⑧ “会记住的表面”** —— 第 5 幕的彩蛋。

Cerebrium 的护盾把鼠标射线命中点写进一张临时纹理，用作遮罩点亮附近的六边形，再慢慢淡去，官方说法是“短暂记住每次交互”。我们可以让指针在光谱上留下的痕迹缓慢消散，正好呼应“她们会记住你说过的事”。

**⑨ 三档效果，直接照抄这套结构**

| 站点 | 初始分档依据 | 运行中降级 |
|---|---|---|
| Daylight | `detect-gpu` 的 `getGPUTier` | WebGL canvas 的 DPR 固定为 1 |
| Igloo | DPR 封顶：DPR≤2 的设备取 min(dpr, 1.15)，否则取 min(dpr, 1.5) | 开启 adaptiveDPR |
| Dispersion | 指针类型：`(hover:none)` 时 DPR 上限 1.5，否则 2 | 平均帧时 >24 ms 就把 DPR 降 0.25，最低 0.75，最多降 6 次 |
| Gentle Rain | — | 保存最近 40 帧，若 40 帧总耗时 ≥1 秒就降一档：2 档（色散焦散）→ 1 档（单通道）→ 0 档（关闭，换成 1×1 白纹理）。手机端直接不建 WebGL（见 [gentlerain-m1](group2/gentlerain-m1.jpg)） |

我们的做法：

- **首屏前定初始档**：综合 GPU tier、`(hover:none)`、`prefers-reduced-motion` 和 `navigator.connection.saveData`。
- **运行中只降不升**：按帧时降档，避免来回抖动。
- **每档改三样东西**：DPR、色散采样次数、焦散开关。

**⑩ 减弱动态的好范本是 Dispersion**

- 把时间冻结（uTime=0），弹簧直接到位，取消自转和开场回弹，但**着色器照常渲染一帧好看的静态画面**（见 [dispersion-rm](group2/dispersion-rm.jpg)）。
- Daylight 在 reduce 下取消 500vh 的钉住段落，改成普通流式排版。

我们的静态档应该是“定格的光谱”，而不是“没有光”。

**⑪ 弹簧可以用解析式**

Dispersion 的开场用 `1 − e^(−k·t)·cos(ω·t)` 型的阻尼振荡（参数大约 k=4.2、ω=6.5），不需要逐帧积分。我们的“自写弹簧”在不需要中途打断的场合（开场、归队）可以直接用解析式；需要被指针打断的场合再用半隐式积分。

### 1.2 要避开的套路

- **RGB 三通道错位当色散**：只有三条硬边，像故障滤镜，很廉价。获奖站都用 ≥5 次采样，或按波长计算。
- **色散全屏常开**：Igloo 的色散只在转场进度（uProgress）推进时出现，冰块材质上也只在局部，并用边缘 smoothstep 遮罩控制强度。色散是“状态改变”的语言，常开会让 28 色一起变脏。
- **全屏 bloom 把多色糊成白**：Cerebrium 用的是 UnrealBloom（5 级 mip），它自己也说调参的难点是“亮到能发光，但不让 bloom 冲掉细节”。而它全站只有一个色相。28 色同屏时建议不做全屏 bloom，让每条光束在自己的着色器里画衰减光晕；非要做的话，阈值调高并限幅。
- **加色叠加让交叠处变白变灰**：光束交叠用 `max` 或 screen 公式，不要直接相加；同时减少同屏交叠。
- **“深色 + 发光渐变”的 AI 站同质化**：Gentle Rain 的案例研究明说就是为了避开它才改用暖橙。我们永远是深色发光，更要靠“官方色就是内容”来区分，不要另造品牌渐变色。
- **用 WebGL 画全部 UI**（Igloo）：我们有中日双语字幕、登录、读屏需求，成本太高。只在少量标题瞬间用纹理文字（见 1.1 第 ⑤ 条 c）。
- **把 WebGPU/TSL 当主路线**：Cerebrium 起初用 three 的 WebGPURenderer + TSL，着色器编译接近 20 秒，最后整套退回 WebGL。
- **用 loader 冒充 LCP**：Igloo 的 LCP 元素是 loader 的 `::before` 伪元素，2.2–2.5 秒的数字没有意义，真正的内容要等十几 MB 资源加载完。

### 1.3 对暂定方案的修正建议

**棱镜隐喻：可行，有直接先例**

- Dispersion 就是“SDF 棱镜 + 分波长折射”，单文件约 15 KB 传输，没有用任何库。
- **修正一：光谱要量化**，见 1.1 第 ② 条，避免出现官方色之外的颜色。
- **修正二：分光后的“光”要能被看见**，见 1.1 第 ④ 条。深蓝系偶像需要白芯和更宽的光晕，否则在深色底上消失。
- **修正三：棱镜别做成真 3D 光线追踪**。Dispersion 那种按像素 raymarch、循环 56–96 步的做法在手机上太重。棱镜本体用 2D SDF 三角形加边缘高光就够了，“折射”只是对一张光束纹理做 UV 偏移再多次采样。

**OGL：合适**

- 有生产先例：Daylight（Awwwards SOTD + FWA 当日最佳）就用 OGL，通过 react-ogl 接入。
- 体积：jsDelivr 打包的 OGL 1.0.11 全量 ESM 实测 39 KB gz；只引 Renderer/Program/Mesh/Triangle/Texture/RenderTarget 估计十几 KB（推断）。对比 three r183 的 module+core 约 185 KB gz（实测 85+100）。
- 我们的视觉主要是全屏片元着色器加少量网格（光路曲线），不需要 three 的场景图、PBR 和加载器。
- **注意**：OGL 不带后处理链。乒乓 FBO、模糊、转场合成要自己写，量不大。

**单张全屏 canvas + Spine 额外 canvas：可行**

- **单 canvas 有先例**：Cerebrium 一个 canvas 装多个环境、各自一套后处理，换页没有 loading 屏；Igloo 也只有一个 WebGL2 上下文。
- **两个 canvas 先叠放**：Spine canvas 放在 OGL canvas 之上、DOM 文字之下。立绘和光的融合靠在 Spine 之上再叠一层 `screen` 的 CSS 渐变或伪元素，比强行共享 gl 上下文安全：Spine 3.6 的 WebGL 运行时会改 gl 状态，共享上下文容易互相污染（推断）。
- **Spine canvas 的尺寸**：只覆盖立绘区域，不做全屏；DPR ≤1.5。只在聚焦时创建或激活，离开后暂停 rAF；手机上离开时考虑用 `WEBGL_lose_context` 释放，因为 iOS Safari 的并发 WebGL 上下文数量有限。
- **两个 canvas 共用一个 rAF 时钟**，GSAP ticker 或 Lenis 的 raf 都可以。
- **着色器预编译**：Igloo 的案例研究提到，在初始加载和后台空闲时分批编译着色器。我们第 0 幕就编译第 1、2 幕的 program，第 2 幕空闲时再编译第 5、6 幕的，避免滚到某幕时卡一下。

**28 色同屏**

- 同屏“满饱和满亮度”的颜色控制在 3–5 个。横滚光谱只有聚焦附近几道是满强度，其余降到低 L、低 C 的“余烬”态。这和 Dropbox 色片“只有被悬停的那张抽出来”是同一个思路。
- 交互可以借鉴 Dropbox 的色卡行（见 [dropboxcolor-7](group2/dropboxcolor-7.jpg)）：悬停的那张抽出，并显示名称和 HEX；邻居按非线性衰减抬起，案例研究里还说用了自定义网格来防止悬停冲突。第 2 幕可以做成：每道光都是一个可聚焦、可点击的 DOM 元素，着色器层只负责发光和晕染，键盘和读屏也能用。
- 深色大面积渐变必须加颗粒或抖动，否则会出现色带。Igloo、Gentle Rain 都有抖动或颗粒，Daylight 有纸面颗粒。

**性能预算：首屏 JS ≤150 KB gz 很紧，但能做到**

本组实测（估算 gz）：

| 站点 | JS 体积 |
|---|---|
| Dispersion | 0，内联在 15 KB 的 HTML 里 |
| Gentle Rain | 自研 WebGL 包约 135 KB |
| Cerebrium | BackgroundCanvas 一个包约 332 KB |
| Igloo | 主包约 407 KB |
| Daylight | 自有 JS 约 863 KB |

除了 Dispersion，没有一个守得住 150 KB。我们的建议：

- **首屏只放 HTML、CSS 和一段很小的启动脚本**。第 0 幕的白光用 CSS 径向渐变或 SVG 就能画出来，作为 LCP 的背景。LCP 元素必须是 DOM 文本，canvas 不参与 LCP 计算。
- **OGL、着色器、GSAP/ScrollTrigger 都在 LCP 之后动态 import**。实测 GSAP 28 KB + ScrollTrigger 18 KB + Lenis 5 KB，合计约 51 KB gz；加上 Next/React 运行时（推断约 90–100 KB gz），首屏已经顶到预算线，所以动画库必须延后加载。
- **字体是隐藏的大头**：日文字体必须子集化，第 0 幕只预载用到的几个字。测到的 LCP 好成绩（Dispersion 在节流手机上 2.1 秒）都来自“LCP 是 DOM 文本，且字体很轻”。Cerebrium 和 Dropbox 的 LCP 同样是文本，但被几百 KB 的 JS 和同意弹窗拖到节流下 16–19 秒。
- **DPR 上限**：完整档桌面 ≤2、手机 ≤1.5，简化档 1，静态档单帧渲染后停止 rAF。

---

## 2. 逐站拆解

### 2.1 Igloo Inc

- **URL**：https://www.igloo.inc/
- **制作**：abeto × Bureaux
- **奖项**：
  - Awwwards **年度最佳网站（SOTY）2024 + 年度开发者奖 2024**（已核实：Awwwards 年度榜和 Awwwards 官方 LinkedIn 2025-03-17 公告）
  - SOTD，评分 7.92（已核实，Awwwards 站点页）
  - SOTD 日期 2024-07-23（第三方 uicoach 记录，推断）
  - Business & Services Honors 2024 年 7 月（已核实）
- **技术栈**（官方案例研究 + 运行时）：
  - three r165（`__THREE__`=165）、Svelte、GSAP、Vite、three-mesh-bvh
  - Draco / Basis(KTX2) / EXR / MSDF 各有独立 worker，音频用 AudioWorklet
  - 主线程 1 个 WebGL2 上下文：开 alpha，关深度和抗锯齿，后处理用 FXAA。没有检测到挂在 DOM 上的 canvas，挂载方式特殊；没有调用 WebGPU。
- **体积和 LCP**：
  - 主包 App3D 约 407 KB gz（1.45 MB 原始），自有 JS 合计约 496 KB gz
  - 总传输约 15 MB：图片/纹理 10.7 MB，音频 2.9 MB，模型 0.5 MB
  - LCP：桌面 2.5 秒，节流手机 2.2 秒，但 LCP 元素是 loader 的 `::before`，没有意义
- **截图**：
  - 电脑：[1](group2/igloo-1.jpg) · [2](group2/igloo-2.jpg) · [转场中 t3](group2/igloo-t3.jpg) · [3](group2/igloo-3.jpg) · [4](group2/igloo-4.jpg) · [5](group2/igloo-5.jpg) · [6](group2/igloo-6.jpg)
  - 手机：[m1](group2/igloo-m1.jpg) · [m2](group2/igloo-m2.jpg) · [m3](group2/igloo-m3.jpg)
  - 减弱动态：[rm](group2/igloo-rm.jpg)

**拆解**：

- **视觉和颜色**：几乎去饱和的冷灰蓝单色系，雪、冰、雾。全站唯一的“彩色”来自色散，只在两个地方出现：
  - 段落之间的转场（见 [igloo-t3](group2/igloo-t3.jpg)）：色散 + 块状像素位移（官方叫 tech displacement）+ 霜冻溶解三者混合；
  - 冰块材质的折射边缘（见 [igloo-4](group2/igloo-4.jpg)）。

  单色底让色散一出现就非常醒目。
- **色散实现**（从公开 JS 读出思路，未复制）：
  - 一个 `chromatic_aberration` 函数沿桶形畸变方向采样 5 次（`CA_ITERATIONS=5`），每次的权重由一条把 t∈[0,1] 映射成红→绿→蓝的光谱函数给出，最后按权重总和归一化；
  - 用蓝噪声纹理对每像素的采样起点做抖动，注释写的就是“隐藏色差的接缝”；
  - 强度由屏幕边缘 smoothstep 遮罩乘以转场进度 `uProgress` 控制，画面中心几乎不偏。
- **焦散**：冰下的预烘焙 `caustics.ktx2`，按两种尺度、反向滚动采样两次取 `min`，再乘以底色的蓝通道后加回。只要一个 pass。
- **光与文字的层级**：UI 全部在 WebGL 里用 MSDF 字体渲染，方便做 glitch 和逐字乱码；代价是文本不可选，读屏也差（推断）。
- **鼠标交互**：footer 的粒子随悬停的链接重组成不同形状（体积数据由自研 VDB 导出器生成），粒子按速度变色并发光。
- **滚动如何驱动着色器**：三段内容无限循环；滚轮推进转场进度，统一喂给转场着色器。
- **手机**：同一套体验，竖构图（见 [igloo-m2](group2/igloo-m2.jpg)）。DPR 封顶 1.15（DPR≤2 的设备）或 1.5，开 adaptiveDPR。
- **帧率体感**：桌面独显 108–139 rAF/s，转场时无明显卡顿。
- **减弱动态**：**没有响应**。JS 里没有 `prefers-reduced-motion`，开场线框动画照放（见 [igloo-rm](group2/igloo-rm.jpg)）。

**给我们的启发**：色散应该是转场语言，不是常驻滤镜；用 5 次采样加蓝噪声，比 RGB 三次偏移高级得多；单色或深色的底，会让光谱一出现就成为主角。

### 2.2 Gentle Rain（gentlerain.ai）

- **URL**：https://gentlerain.ai/。**原域名已失效**，没有 DNS 记录。本次抓取改用 Wayback 存档 https://web.archive.org/web/20250917052141/https://www.gentlerain.ai/
- **制作**：Zajno Studio + 创意开发 Andrew Encharm
- **奖项**：
  - Awwwards **SOTD 2024-12-25**，评分 7.28（已核实，Awwwards 站点页）
  - Zajno 作品页自述 Awwwards×2、CSSDA×3、FWA×1（工作室自述，未逐一核实）
- **技术栈**：Webflow + jQuery + GSAP 3.12.5 + ScrollTrigger + Lenis 1.0.23 + 基于 three r169 的自研 WebGL 包。一张全屏 WebGL2 canvas，`premultipliedAlpha:false`、`pointer-events:none`，压在 DOM 下面。
- **体积和 LCP**：
  - 自研 WebGL 包约 135 KB gz，Webflow 约 156 KB gz，去掉存档注入脚本后约 376 KB gz（估算）
  - 视频约 7.9 MB
  - LCP 受存档代理影响，不可用
- **截图**：
  - 电脑：[1](group2/gentlerain-1.jpg) · [2](group2/gentlerain-2.jpg) · [3](group2/gentlerain-3.jpg) · [4](group2/gentlerain-4.jpg) · [5](group2/gentlerain-5.jpg) · [6](group2/gentlerain-6.jpg)
  - 手机：[m1](group2/gentlerain-m1.jpg) · [m2](group2/gentlerain-m2.jpg) · [m3](group2/gentlerain-m3.jpg)
  - 减弱动态：[rm](group2/gentlerain-rm.jpg)

**拆解**：

- **颜色**：只有两色，暖橙 #FD7024 和奶黄 #FFF0B3，全屏颗粒。案例研究明确说，大部分 AI 网站都是“深色 + 发光渐变”，他们要避开。
- **主视觉**：首屏“雨落水面”的焦散光，字标被水面折射扭曲（见 [gentlerain-1](group2/gentlerain-1.jpg) 中的 t）。实现思路（从 JS 读出，未复制）：
  - 一张按视口细分的平面网格。顶点着色器用水面法线图和 `refract` 算出折射前后的落点，片元着色器按两者面积变化求亮度，也就是经典的网格焦散；
  - 结果写进 FBO，再做一次可分离模糊。
  - “色散焦散”模式把同一张网格画 3 遍，每遍用一个通道遮罩、不同的折射率倒数（例如 1/1.9、1/1.6），叠出彩色焦散边。案例研究的说法是“焦散 + 抖动造就了柔和感”。
- **运行时降级**（三档，最值得抄）：
  - 一个性能监视器保存最近 40 帧时间戳，如果 40 帧总耗时 ≥1 秒（约等于低于 40fps），就把 level 减 1 并广播；
  - level 2 = 三通道色散焦散，level 1 = 单通道焦散，level 0 = 关闭（焦散贴图换成 1×1 白纹理，后续代码不用分支）；
  - 另有 lowFps 事件会重建场景渲染目标。
- **手机**：直接不创建 WebGL canvas，退回静态排版和颗粒背景（见 [gentlerain-m1](group2/gentlerain-m1.jpg)）。
- **光与文字的层级**：WebGL 层在下，DOM 文字在上；部分元素在 WebGL 里复刻了 HTML 的行为，案例研究说这很耗时。
- **减弱动态**：只有 Webflow 交互层自带的处理，WebGL 层没看到（推断）。

**给我们的启发**：三档降级可以写成一个“性能 level 事件”，各效果模块自己订阅；关闭某个效果时换成中性纹理，而不是到处写 if；手机直接走静态档也是可以接受的获奖做法。

### 2.3 Daylight（daylightcomputer.com）

- **URL**：https://daylightcomputer.com/
- **制作**：basement.studio
- **奖项**：
  - Awwwards **SOTD 2024-06-18 + 开发者奖**（已核实：Awwwards 站点页 + Awwwards 官方 X 当日帖）
  - **FWA 当日最佳 2024-05-28**（已核实，FWA 每日转载）
  - Awwwards E-commerce Honors 2024 年 6 月
  - Ecommerce Design Awards 当日最佳 2024-06-04
  - 注：站点之后改版加了电商和 Kids 模块，本次抓到的是 2026 年现行版，主视觉“阳光叶影”还在。
- **技术栈**：
  - Next.js（App Router）+ React，**OGL（经 react-ogl 接入）**，GSAP + ScrollTrigger，Lenis，`detect-gpu`（`getGPUTier` 懒加载），Rive，hls.js
  - 桌面 3 个 canvas：两张全屏、`pointer-events:none` 的（WebGL `alpha:false` 一张，WebGL2 一张），外加一个首屏用的
- **体积和 LCP**：
  - 自有 JS 约 863 KB gz（含懒加载），加上第三方追踪约 1.6 MB gz；总传输约 3.9 MB
  - LCP：桌面 3.4 秒（图片），节流手机 7.3 秒
- **截图**：
  - 电脑：[1](group2/daylight-1.jpg) · [2](group2/daylight-2.jpg) · [3](group2/daylight-3.jpg) · [4](group2/daylight-4.jpg) · [5](group2/daylight-5.jpg) · [6](group2/daylight-6.jpg)
  - 手机：[m1](group2/daylight-m1.jpg) · [m2](group2/daylight-m2.jpg) · [m3](group2/daylight-m3.jpg)
  - 减弱动态：[rm](group2/daylight-rm.jpg)

**拆解**：

- **光本身就是主视觉**：一组实例化的叶片网格（带 alpha 贴图），用正交“太阳”相机渲染进阴影 FBO。`dayProgress` 控制太阳位置，也就是一天里的时刻。
- **光层在内容之上**：阴影结果画在全屏 canvas 上，以 `mix-blend-multiply` + `pointer-events:none` 盖住整页。canvas 不透明且底是白色，白色乘任何颜色都不变，所以只有阴影处变暗。文字永远可读，叶影又确实“照”在文字上（见 [daylight-2](group2/daylight-2.jpg)、[daylight-3](group2/daylight-3.jpg)、[daylight-m2](group2/daylight-m2.jpg)）。
- **颜色**：暖白纸色 + 颗粒，只有一个橙色 #FF9D00 作为行动色；后半段转成深色区块（见 [daylight-5](group2/daylight-5.jpg)）。
- **滚动**：Lenis + ScrollTrigger。介绍段是 500vh 的钉住序列，还有面板从右侧横向推入（见 [daylight-3](group2/daylight-3.jpg) 右侧），是竖滚驱动横移的做法。
- **手机**：WebGL canvas 的 DPR 固定为 1（390×664），叶影保留。
- **减弱动态**：有响应。React store 读 `prefers-reduced-motion`，Tailwind 的 `motion-safe` / `motion-reduce` 让 500vh 钉住段在 reduce 下变成普通流式排版。
- **帧率体感**：桌面 129–142 rAF/s。

**给我们的启发**：OGL 在获奖生产站点里跑得好好的；“光层盖在 DOM 上 + 混合模式”是让光与文字共处、又不牺牲可读性的最稳方案。我们深色底对应 `screen`。

### 2.4 Dropbox Brand（brand.dropbox.com）

- **URL**：https://brand.dropbox.com/ ，重点看 https://brand.dropbox.com/color
- **制作**：Daybreak Studio
- **奖项**：
  - Awwwards **SOTD 2025-02-12**，评分 7.67（已核实）
  - **SOTM 2025 年 2 月 + 开发者奖**（已核实，Awwwards 月度榜）
  - Webby 获奖：“最佳用户体验”和“最佳移动端响应式设计”（来源是 Webflow 客户案例页，未查 Webby 官网）
- **技术栈**：Webflow + jQuery + 内嵌自定义 JS + Rive（/color 页有一个 WebGL2 canvas，是 Rive 运行时），没有 three 或 GSAP 全局对象。案例研究还提到：色卡用非线性缓动和自定义网格防止悬停冲突；菜单的拉伸回弹用对关键帧散点做四次回归拟合得到。
- **体积和 LCP**：
  - 页面 JS 被 Dropbox 的隐私同意框架淹没（同意 iframe 相关脚本约 1 MB gz），站点自有部分无法单独衡量，没有参考价值
  - LCP：桌面 5.4–5.6 秒；节流手机首页 18.9 秒、/color 5.5 秒
- **截图**：
  - 首页：[1](group2/dropbox-1.jpg) · [2](group2/dropbox-2.jpg) · [3](group2/dropbox-3.jpg) · [4](group2/dropbox-4.jpg) · [5](group2/dropbox-5.jpg) · [6](group2/dropbox-6.jpg)
  - /color 页：[1](group2/dropboxcolor-1.jpg) · [2](group2/dropboxcolor-2.jpg) · [3](group2/dropboxcolor-3.jpg) · [4](group2/dropboxcolor-4.jpg) · [5](group2/dropboxcolor-5.jpg) · [6](group2/dropboxcolor-6.jpg) · [色卡行 7](group2/dropboxcolor-7.jpg)
  - 手机：[首页 m3](group2/dropbox-m3.jpg) · [color m1](group2/dropboxcolor-m1.jpg) · [color m3](group2/dropboxcolor-m3.jpg)
  - 减弱动态：[rm](group2/dropbox-rm.jpg)
  - 注：抓取时用 CSS 隐藏了 Cookie 同意 iframe（`#ccpa-iframe`）

**拆解**：

- **多色同屏不乱的四个具体做法**：
  1. **每块只用两色，且同色相**：饱和底配同色相的深色“墨”（见 [dropbox-6](group2/dropbox-6.jpg)），块与块之间用白缝隔开。
  2. **整页背景随当前色变成它的极深同色相**：/color 页的大标题随滚动从描边变实心，同时背景从墨绿换到深棕再到深紫，文字对应换成石灰绿、橙、淡紫，色块图标也跟着换（见 [dropboxcolor-2](group2/dropboxcolor-2.jpg)、[dropboxcolor-3](group2/dropboxcolor-3.jpg)、[dropboxcolor-4](group2/dropboxcolor-4.jpg)）。这几乎就是我们“聚焦某位偶像时夜色染成她的颜色”的现成样板。
  3. **按色相排序**：18 个强调色排成一行文件夹标签，从品红、粉、酒红、橙红、赭、橙、土黄、黄，到墨绿、石灰绿、深青、青、藏青、雾蓝、紫、淡紫（见 [dropboxcolor-7](group2/dropboxcolor-7.jpg)）。
  4. **悬停即“抽出”**：被悬停的那张抬起并显示名称和 HEX（图中 Lime #B4DC19），左右邻居按衰减抬起。
- **没有着色器色彩**：所有颜色都是 DOM/CSS 平涂，再加少量 Rive 动画。正因为是平涂，颜色才“准”，可以拿来对照我们的官方色约束。
- **手机**：bento 改成两列堆叠（见 [dropbox-m3](group2/dropbox-m3.jpg)），/color 的变色标题保留（见 [dropboxcolor-m3](group2/dropboxcolor-m3.jpg)）。
- **减弱动态**：Webflow 交互层的处理。

**给我们的启发**：28 色的组织办法（同色相成组、深底配色、按色相排序、悬停抽出）可以直接用在第 2 幕的 DOM 层；着色器只负责“光感”，不负责“颜色的准确”。

### 2.5 Cerebrium

- **URL**：https://www.cerebrium.ai/
- **制作**：KOKI-KIKO（创意总监 Louis Paquet），WebGL 由 Mathis Biabiany 负责，3D 由 Célia Lopez 负责
- **奖项**：Awwwards **SOTD 2026-09-10**，评分 7.39（已核实，Awwwards 站点页）；开发者奖 7.5（dokle 报道，未在 Awwwards 页面逐项核对）
- **技术栈**（Codrops 案例研究 + 运行时）：
  - Astro，three r183 的 WebGLRenderer。起初用 WebGPURenderer + TSL，因着色器编译近 20 秒退回 WebGL：材质改用 `onBeforeCompile` 注入 GLSL，粒子改成浮点纹理乒乓 GPGPU，后处理换成 EffectComposer（含 UnrealBloom）
  - GSAP、Lenis、MeshLine、Lottie
  - 单张全屏 WebGL2 canvas（开 alpha 和深度，关抗锯齿），手机 DPR 2
- **体积和 LCP**：
  - BackgroundCanvas 一个包约 332 KB gz，自有 JS 约 652 KB gz
  - 总传输约 2.1 MB，其中模型 0.8 MB
  - LCP：桌面 4.8 秒（H1），节流手机 16.5 秒
- **截图**：
  - 电脑：[1](group2/cerebrium-1.jpg) · [2](group2/cerebrium-2.jpg) · [3](group2/cerebrium-3.jpg) · [4](group2/cerebrium-4.jpg) · [5](group2/cerebrium-5.jpg) · [6](group2/cerebrium-6.jpg)
  - 手机：[m1](group2/cerebrium-m1.jpg) · [m2](group2/cerebrium-m2.jpg) · [m3](group2/cerebrium-m3.jpg)
  - 减弱动态：[rm](group2/cerebrium-rm.jpg)

**拆解**：

- **一个色相统治全站**：洋红丝带、深海军蓝和近黑底，所有场景共用一张自定义紫色 HDRI 做环境光；每个物体只有“同一种洋红填充 + 一个热高光”（见 [cerebrium-1](group2/cerebrium-1.jpg)、[cerebrium-4](group2/cerebrium-4.jpg)）。dokle 的评语是“固定布局、固定光，只让一个元素承载变化”。
- **一个 canvas，多个环境**：每个环境有自己的材质、粒子、灯光和后处理链，页面切换无缝，不出 loading 屏。可以直接佐证我们的单 canvas 架构。
- **光路脉冲**：静态网格 + 沿 UV 移动的不透明度遮罩，每条路径的偏移、速度、间隔随机；按相机距离逐步揭示网络。
- **会记住的护盾**：菲涅尔 + 噪声 + 六边形网格叠加；鼠标射线命中点写入临时纹理，局部点亮后慢慢淡去。
- **光与文字的层级**：DOM 在 canvas 之上。页面后半段直接切成浅色 DOM 区块（见 [cerebrium-2](group2/cerebrium-2.jpg)、[cerebrium-5](group2/cerebrium-5.jpg)），canvas 退成卡片里的小窗，说明“全程着色器”并不是必须的。
- **滚动**：Lenis + ScrollTrigger 驱动 C4D 烘焙的相机动画，镜头运动不在浏览器里插值。
- **手机**：同构，DPR 2；首屏把“按住”交互换成播放按钮（见 [cerebrium-m1](group2/cerebrium-m1.jpg)）。
- **帧率体感**：桌面顶部 145 rAF/s，滚到底时测到 49，有掉帧；手机模拟 104。
- **减弱动态**：代码里有 `reducedMotion` 和 `(hover:none)` 媒体查询的状态，但截图看不出差别（见 [cerebrium-rm](group2/cerebrium-rm.jpg)），推断只作用于部分动画。

**给我们的启发**：单 canvas 多场景的架构可行；第 5 幕“传话”用光路脉冲；第 5 幕彩蛋用“记忆纹理”；以及一个反面提醒：它只有一个色相才敢用全屏 bloom，我们不行。

### 2.6 Dispersion（Ohad Aviv）

- **URL**：https://oavivo.github.io/dispersion/
- **作者**：Ohad Aviv，2026 年 10 月
- **认可**：**Muzli Picks**（已核实，Muzli 页面）。没有查到 Awwwards/FWA/CSSDA 记录，发布才两天左右。奖项层级低于其余五站；纳入它，是因为它是“棱镜 / 分波长色散 + 滚动叙事”最直接的手法参照。
- **技术栈**：不用任何库，单个 HTML 文件 39 KB（约 15 KB 传输），WebGL2 每帧一次 draw call，约 270 行片元着色器，没有后处理；标题文字用 2D canvas 画成纹理。
- **体积和 LCP**：JS 约 0（内联）；LCP 桌面 2.5 秒，节流手机 2.1 秒（段落文本）。
- **截图**：
  - 电脑：[1](group2/dispersion-1.jpg) · [2](group2/dispersion-2.jpg) · [3](group2/dispersion-3.jpg) · [4](group2/dispersion-4.jpg) · [5](group2/dispersion-5.jpg) · [6](group2/dispersion-6.jpg)
  - 手机：[m1](group2/dispersion-m1.jpg) · [m2](group2/dispersion-m2.jpg) · [m3](group2/dispersion-m3.jpg)
  - 减弱动态：[rm](group2/dispersion-rm.jpg)

**拆解**：

- **滚动驱动的形体 morph**：水滴 → 透镜 → 棱镜 → 明亮式切割宝石 → 水晶，都是 SDF，滚动时在相邻两个 SDF 之间插值。指针处是第二个 SDF，用平滑最小值融进主体，像液体被拉开又合拢。
- **色散**：光线 march 进玻璃，按 Snell 定律折射；出不去就在内表面全反射，再找出口。出射时按 400–700 nm 的 7 个波长分别算折射率（由真实材料的折射率和阿贝数拟合 Cauchy 公式），再按波长对应的颜色加权合成，所以边缘是平滑光谱，不是 RGB 三条。色散强度刻意放大 3 倍以便看清。右下角实时显示折射率、阿贝数、spread。
- **文字在光的后面**：标题画在玻璃后的“墙”上，透过玻璃看是放大、翻转、带色边的（见 [dispersion-1](group2/dispersion-1.jpg)、[dispersion-m2](group2/dispersion-m2.jpg)）。正文是普通 DOM，在左侧排版。
- **阴影和焦散**：从墙面往光源追踪的射线穿过同一个 SDF，得到软阴影和带色边的焦散亮核。
- **颜色**：开头是浅灰白底，滚到“水晶”段转成深色舞台加竖向光柱（见 [dispersion-6](group2/dispersion-6.jpg)）。光谱只出现在折射边缘，面积极小，所以显得贵。
- **降级**：
  - DPR 上限：`(hover:none)` 时 1.5，否则 2；手机实测 585×996，即 1.5 倍
  - 自适应：平均帧时 >24 ms 就把 DPR 降 0.25，最低 0.75，最多 6 次
  - 页脚实时显示 fps 和 GPU 型号
- **减弱动态**：有响应。时间冻结、弹簧直接到位、取消自转和开场回弹，但仍渲染一帧完整的着色器画面（见 [dispersion-rm](group2/dispersion-rm.jpg)）。
- **帧率体感**：桌面 145 rAF/s 稳定。片元循环 56–96 步、每像素 7 个波长，在中低端手机上会吃力（推断），所以它靠自适应 DPR 托底。

**给我们的启发**：棱镜隐喻在网页上能做到很美、很轻；但真 raymarch 太重，我们只取它的“分波长加权合成”“文字在光后面”“reduce 下定格而非关闭”和“解析式弹簧”。

---

## 3. 放弃的候选和原因

| 候选 | 情况 | 放弃原因 |
|---|---|---|
| Lusion v3（lusion.co） | Awwwards SOTD 2023-10-02，SOTY 2023，CSSDA 2023 年度最佳 | 获奖时间是 2023 年，超出 2024–2026 范围 |
| Oryzo AI（Lusion） | Awwwards SOTD 2026-04-13，SOTM 2026 年 4 月（已核实） | 主视觉是 3D↔2D 转场和粒子，配色只有橙加黑，与“光、色作主视觉”关系弱 |
| Lumen（romaincoupey.com/lumen） | 2026 年 7 月，WebGPU + WebGL2 回退，5 种光学现象随滚动呈现 | 没查到奖项；手法与 Dispersion 高度重合，保留了后者 |
| Huly（huly.io） | 首屏有光束 | 没能核实奖项；托管服务已宣布关停，站点前景不明 |
| Totem.earth（OFF+BRAND） | 据 webgpu.com 报道获 Awwwards SOTD、FWA、CSSDA，有竖向光束和烟雾 | 原域名已失效，只剩工作室托管的版本；年份未核实 |
| Cartier Watches & Wonders 2025（Immersive Garden） | Awwwards SOTM 2025 年 8 月 | 重心是 3D 产品宇宙，不是光或色作主视觉；时间有限未抓 |
| Unseen Studio 自家站 | Awwwards SOTD 2023-02 | 超出时间范围；2024 年的客户站以图片或 3D 为主 |
| Spectral-Glass（Saqoosha）、liquidGL、各类色散组件库 | WebGPU 分波长色散演示或组件 | 是演示或库，不是获奖网站；只作技术背景 |
| Gentle Rain 原站 | — | 不是放弃，是改用 Wayback 存档：原域名 gentlerain.ai 已没有 DNS 记录 |

---

## 附：方法备注

- 抓取脚本在仓库外 `%TEMP%/landing-research/group2/`：`capture.mjs`、`grepjs.mjs`、`jsweight.mjs`、`mobile-shots.mjs`、`dropbox-chips.mjs`。脚本、抓到的 JS 和日志都没有进仓库。
- “从公开 JS 看出的着色器思路”都只用文字描述，没有复制代码、着色器或素材。
- 手机截图来自 Chromium 的 iPhone 13 模拟，用的是桌面显卡，不能代表真机 GPU 表现；节流 LCP 只作横向比较。
