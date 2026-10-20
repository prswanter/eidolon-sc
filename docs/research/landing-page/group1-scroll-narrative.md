# 第 1 组调研：滚动叙事（竖滚 / 横滚 / 钉住 / 节奏 / 转场）

调研日期：2026-10-10。对象是 2024–2026 年 Awwwards SOTY / SOTM / SOTD 里偏产品、品牌叙事的站。每个站都用 Node + Playwright 实际跑过：电脑 1440×900 用 `mouse.wheel` 每步 100px 慢滚，手机用 iPhone 13 设备描述，另跑一遍 `reducedMotion: 'reduce'` 做对比。截图在 [`group1/`](group1/) 目录。

> 测量口径（看数字前先读）：
> - **JS 体积**：用 CDP `Network.loadingFinished.encodedDataLength` 统计，是压缩后的传输字节，**包含第三方统计脚本**（GTM、gtag 等），每站单次测量。
> - **LCP**：页面内 `PerformanceObserver('largest-contentful-paint')` 读数，单次实验室测量。电脑端不限速；手机端用 CDP 模拟约 9 Mbps 下行、170ms RTT、CPU 降速 4 倍（接近 DevTools 的「Fast 4G + 中端机」）。只能当量级参考，跟 CrUX 实测不能比。
> - **技术栈**：运行时全局变量、DOM 痕迹，再加上对首方 JS 包做特征串匹配。特征串可能误报，下文只写能互相印证的结果。
> - **钉住方式**：数页面里 `.pin-spacer`（GSAP pin 的产物）和 `position: sticky` 元素。横向轨道的判断方法：宽度超过视口 1.6 倍、并且带 transform 的元素，记录它在滚动过程中的 translateX。

---

## 结论

### 一、可以借鉴的手法（按我们的幕次排）

| # | 手法 | 来源 | 用在哪一幕、怎么用 |
|---|---|---|---|
| 1 | **一个主角物体贯穿所有场景，镜头不切** | Oryzo（软木杯垫在每个场景里变形、换位，一直在）、OceanX（科考船固定在画面中央，海面和章节在它脚下流过）、Inkwell（约 30 张卡片 → 环 → 弧 → 排 → 斜向堆叠 → 收成一个立方体） | 让**那束白光 / 那个光点**当唯一主角，在那张全屏 OGL canvas 上从第 0 幕一直活到第 8 幕：0 幕是一条线，1 幕穿过棱镜，2 幕散成 28 道，5 幕变成在偶像之间跳的光粒，8 幕收拢成手机屏幕。DOM 段落（3、4、7 幕）期间它也不消失，退到背景里当一条细线或一个点。各幕之间靠它的形变来转场，不用淡入淡出或硬切。 |
| 2 | **「环 → 直线 → 堆叠 → 收拢」的群体编排** | Inkwell 开头那一环约 30 张图，数量和我们的 28 几乎一样 | 第 1→2 幕：28 道色光先扇形散开（环或弧），随滚动「拉直」成横向光谱，2 幕再横滚着把它展开。2 幕结束时 28 道光反向收拢成一束，交给第 3 幕。数量对得上，这套编排几乎可以直接映射过来。 |
| 3 | **按章节串起来的横向轨道** | Capitolium：每个章节是一条横向轨道（实测宽 6383 / 6160 / 9284px），下一章作为一整张带自己页眉的面板从右侧推入；底部有常驻的「CHAPITRE I/II」胶囊，大号花体章节名（Les arcades、Salle du conseil）横压在图片上 | 第 2 幕按**组合分段**（283 的 8 个组合，以项目数据为准）：每个组合一段横向轨道，段与段之间用整页推入的方式交接；底部常驻胶囊显示当前组合名；**竖排巨大日文名**的位置相当于 Capitolium 的花体章节名，压在立绘上、比立绘滚得更慢，形成视差。 |
| 4 | **钉住用 CSS `position: sticky` 加滚动进度，不用 pin-spacer** | 6 个入选站 `.pin-spacer` 数量全部为 0。Lando 用 `.horizontal-pin-sticky` 加 `.horizontal-track` 的 translateX（实测竖滚约 3800px 对应横移 3143px），Capitolium 用 `block-story__pin` 等 sticky 容器，Shopify 用 Tailwind 的 `sticky top-0 h-screen` | 第 2 幕横滚的实现：外层高度等于横向距离乘以系数，内层 `sticky; top:0; height:100svh`，translateX 由 Lenis 的滚动进度驱动，经过自写弹簧平滑后写入。**可以不引入 ScrollTrigger**（省大约 18KB gz），布局抖动也比 pin-spacer 少。 |
| 5 | **横滚途中背景连续变化** | Lando：等高线纹样一路连贯，底色在横移中从墨绿渐变到灰绿再到米色 | 第 2 幕的底色保持深色，但把聚焦偶像的印象色以很低的饱和度渗进背景（比如 4–8% 明度的色偏），让「换人」这件事在全屏范围都被感知到，又不打破「永远深色」。 |
| 6 | **只能看、不能跳的进度指示** | Inkwell 顶部的 pathfinder（Intro / Vision / Applications / Talents）只显示所在章节，不支持跳转；OceanX 页眉下有一根细进度线，另有 Chapters 菜单；Shopify 左侧常驻目录带条目计数 | 全站顶部（或左缘）放一根**光谱进度线**：随滚动依次被 28 色「点亮」，进度条本身就是隐喻。9 幕的名称用极小字号显示当前幕。是否允许跳转：第 2 幕允许按组合跳，其余幕不提供跳转（照 Inkwell 的做法保住叙事顺序），但右上角常驻「登录」入口，作为唯一的捷径（Lando 的 STORE 按钮全程常驻，Terminal 的 CTA 也全程常驻）。 |
| 7 | **滚动驱动的笔迹 / 描线** | Lando 的签名以 SVG 描边形式随滚动写出，压在人像和两行字幕带上（`lando-02.jpg`） | 第 6 幕「剧情回忆（抽象光迹）」：光迹路径用描边进度绑定滚动；第 3 幕可以借这个思路，让中文字幕像「被光扫过」一样逐字出现（不要打字机效果，要扫光）。 |
| 8 | **长按改变状态** | Inkwell 手机端：「CLICK & HOLD TO CHANGE THE TONE OF VOICE」 | 第 4 幕来电模拟：**长按接听**，用按压时长驱动一圈色光收束，松手即接通。第 3 幕也可以用长按在「日语原文 / 中文字幕」之间切换。这比悬停更适合手机。 |
| 9 | **主角物体嵌进文字** | Oryzo 的「it's w◯able」：杯垫替代了字母 | 第 0 或第 8 幕：白光点落在文案里，变成某个字的点画，或者「」的位置。很小的一招，记忆点很强。 |
| 10 | **声音由用户主动打开，默认静音，开关常驻** | OceanX 的「Enter experience」点击同时解锁音频，左上角显示「AUDIO ON」；Igloo 左下角常驻「Sound: Off」 | **不设进入门槛**（理由见下文「要避开的套路」）。把第 2 幕「点击偶像听一句招呼」当作天然的用户手势：第一次点击才创建 AudioContext；之后左下角常驻一个小号声音开关，默认关闭。 |
| 11 | **手机端的三种降级** | Lando：横向轨道直接改成竖向堆叠；Oryzo：横滚段改成分页卡片加短横线页码；Shopify：手机端去掉 WebGL 背景，整页变成文档流（JS 从 1012KB 降到 280KB，总传输从 2.8MB 降到 634KB） | 这三种正好对应我们的完整 / 简化 / 静态三级。手机完整版：第 2 幕改成**按组合的横向分页卡片**（Oryzo 式，单手可以左右滑）。简化版：28 位竖向列表，名字仍然竖排（Lando 式）。静态版：Shopify 式文档流，不加载 canvas。 |

### 二、已经被用滥、要避开的套路

- **「Enter experience」进入门槛和 0→100 加载计数**：OceanX、Capitolium 都要点一下才能进入。代价是首屏只剩 logo 加按钮，手机 LCP 被拖到 6–40 秒（见各站数据），也挡住了直接想登录的人。我们是「落地页加登录」，不是品牌展馆。
- **接管滚轮的虚拟滚动**（Igloo、OceanX 用滚轮驱动 WebGL 进度，`scrollHeight` 等于视口高度）：键盘、页内查找、读屏、浏览器回到原位置全部失效，自动化脚本在手机上也滚不动。我们坚持原生滚动加 Lenis。
- **巨型跑马灯字带垫在人像后面**（Lando 第二屏）、**bento 网格数据卡**（Zentry 的 970GB+ / 100M+）、**合作方 logo 墙**、**FAQ 手风琴**：都是模板化的标配，没有一个跟我们的叙事有关。
- **卡片从 0.9 缩放到 1 的通用钉住横滚画廊**：模板市场上已经泛滥。我们的横滚必须承载「光谱」这个意义，不能做成一排卡片。
- **用透明度动画压住首屏文字**：Shopify 电脑端 LCP 元素是一段 `opacity-0` 的副标题，结果 LCP 被推到 16.5 秒。首屏标题必须一开始就可见，动画只能做「已经可见之后」的增强。
- **Cookie 横幅成了 LCP**（Inkwell 的 LCP 元素是 `P.cookie`）：我们不上第三方统计，就不需要横幅。
- **滚动逐帧序列图**（Oryzo 的同类站、More Nutrition、Optikka 都靠上千张帧图）：体积大，已经被用滥，也和我们「单张 canvas 实时着色」的方向相反。
- **光标跟随圆点、磁吸按钮**：几乎每个参评站都有，不加分。

### 三、对暂定方案的修正建议

1. **幕结构：9 幕偏长，建议压到 7 幕的体感。** 参照实测文档高度：Lando 12.7k px，Inkwell 28.3k px，Capitolium 31k px，Oryzo 55.8k px（靠密集的笑点撑住）。建议电脑端总长控制在 **22–28 屏（2–2.5 万 px）**，其中第 2 幕独占 8–10 屏。具体做法：
   - 第 5 幕（记忆传递）和第 6 幕（剧情回忆光迹）**合并成一幕**，或者把第 6 幕压成 1–1.5 屏的过场：两者在视觉上都是「光在偶像之间流动」，拆开容易重复。
   - 第 7 幕（诚实事项）**完全静止**，不做任何滚动动画。这在节奏上是「休止符」，正好衬出第 8 幕汇聚成白光的高潮。
2. **横竖交替只做一次主横滚。** 入选站的横滚用得都很克制：Lando 1 段，Oryzo 2 段短的，Capitolium 是一整套章节系统（全站的主结构就是横向）。我们建议只有**第 2 幕是长横滚**。如果还想要第二次横向，只在第 5 幕做一段 1–2 屏的短横移（光粒从一位偶像「传」到另一位，方向从左到右），不要更多。
3. **横滚的竖横比**：Lando 约 1.2:1（竖滚 px 比横移 px），Capitolium 约 2:1（偏慢，适合看大图）。第 2 幕建议 **1.3–1.5:1**，每位偶像在聚焦位停留约 0.35 屏，再加组合之间的整页推入。28 人的横向总距离大约 9–11 个视口宽，对应 12–15 屏竖滚。如果嫌长，就把每位的停留压到 0.25 屏，同时提供「按组合跳转」。
4. **技术栈**：
   - **钉住改用 CSS sticky**（6/6 入选站都没用 pin-spacer），ScrollTrigger 可以不引入。GSAP 只在确实需要时间轴编排时引入核心库（约 27KB gz），或者干脆全部交给自写弹簧加进度映射。
   - **Lenis 参数参考**：Capitolium 用 duration 加 expo 缓动（`1.001 - 2^(-10t)`），`smoothTouch:false`，`touchMultiplier:2`，在特定条件下 `wheelMultiplier` 取 0.5；Lando 和 Inkwell 用 Lenis 默认（`syncTouch:false`）；Shopify 用 `lerp:0.1`。建议我们用 `lerp≈0.1`，**触屏不做平滑**（原生惯性），保留 `syncTouch:false`。
   - OGL 单 canvas 的方向是对的：Inkwell 也用 OGL（官方案例写的是 Vue + OGL + Rapier + GSAP），Lusion 用的是改过的 three r178。OGL 比 three 轻得多，能撑住我们的预算。
5. **预算的现实对照**：入选站**没有一个**能满足「首屏 JS ≤150KB gz、手机 4G LCP ≤2.5s」。JS 最少的是 Igloo（420KB），其次 Lando（575KB，含 jQuery 和 Webflow 运行时）；Inkwell 2MB。手机 LCP 只有 Igloo 2.2s（而它的 LCP 元素是加载动画的伪元素，没有参考价值）和 Zentry 2.6s 接近目标。结论：**我们的预算比获奖站严格一个数量级，这本身就是差异化，但也意味着**：
   - LCP 元素必须是 SSR 出来的 HTML 标题文字（日文明朝体子集预加载，或者先用系统字体占位），canvas 一律在 LCP 之后、空闲时再初始化；
   - 第 2 幕的 Spine 运行时和立绘资源，要在用户滚近第 2 幕时才按组合分批加载（Oryzo、Capitolium 首屏就拉了 7–13MB 的图片和视频，这是反面例子）。
6. **字体**：Lando 用高对比衬线展示体（Brier）配可变无衬线（Mona Sans）；Capitolium 用衬线大写配 Edwardian Script 花体；Shopify 用 Neue Montreal 配 ImperialScript；Oryzo 自述 99% 的文字只用一个字族、只用 4 个颜色。规律是**两套字族加一个点缀**。我们暂定的是「日文明朝 + 拉丁可变展示体 + Noto Sans SC」三套，再加上 CJK 字体的体积，建议**去掉独立的拉丁展示字体**：拉丁字母直接用明朝体自带的字形，或者只给 1–2 处大号数字和标题用一个极小的子集。
7. **深色与明暗节奏**：Lando、Capitolium、Zentry 都靠深浅段落交替制造节奏（Zentry 的 ScrollTrigger 表里有一串专门切换主题的 `themeTrigger`）。「永远深色」可以保留，但要做**亮度节奏**来代替主题切换：第 1 幕分光是第一次亮度峰值，第 7 幕是最暗、最静的一段，第 8 幕白光漫满全屏是最终峰值。这样做符合棱镜隐喻，也避免整页一个亮度到底。
8. **prefers-reduced-motion 是我们可以赢的地方**：6 个入选站在 `reduce` 下截图**看不出任何差异**，CSS 里 `prefers-reduced-motion` 规则数全为 0（Shopify 和 Lando 的 JS 里有 matchMedia 检查，但主体动效没有降级）。我们的「静态级」要真正做出来：不初始化 canvas、横滚段改竖排、所有滚动驱动的变化改成已完成态。这一条可以写进验收标准。

---

## 入选站点拆解

### 1. Lando Norris（landonorris.com）

- **奖项**：Awwwards **SOTY 2025**（已核实：Awwwards Sites of the Year 列表，以及 Annual Awards Winners 页，同时拿到 Users' Choice）；**SOTM 2025 年 11 月**（推断：OFF+BRAND 在 2025-12-09 发帖「A Site of the Month for the World Champion」，加上 SOTM 列表中的位置）；SOTD 8.18 分（已核实分数，具体日期未查到，推断在 2025 年 11 月）；CSSDA WOTM（已核实 cssdesignawards.com 页面）；FWA of the Day（只有工作室案例页的说法，未独立核实）。工作室 OFF+BRAND。
- **技术栈**：Webflow（`data-wf-site`、jQuery 3.5.1）加自托管的大包 `lando-by-OFF+BRAND.05.js`（362KB）。包内能匹配到 three（`__THREE__` 为 r174）、Lenis（`smoothWheel:true, syncTouch:false`）、GSAP 加 ScrollTrigger、Rive（工作室服务清单里也列了 Rive）。字体：Brier（衬线展示体）、Mona Sans Variable。
- **粗测**：电脑端 JS 575KB / 总计 5.7MB（滚完 7.6MB），LCP 约 3.1s；手机端 JS 576KB / 7.2MB，LCP 约 4.0s（LCP 元素是一张人像 IMG）。文档高度 12.7k px（手机 8.8k）。
- **幕结构与节奏**：大约 7 段。①人像加 3D 头盔面罩开场（`lando-01`）→ ②「致辞」：大号衬线与无衬线混排的两行字幕带横向移动，人像缩小，荧光黄签名随滚动描出（`lando-02`）→ ③标语「BRINGING IT ALL IN…」→ ④**横向轨道**：散落的照片拼贴，每张带「地点, 年份」小注，底色从墨绿过渡到米色（`lando-03`、`lando-04`）→ ⑤ON TRACK / OFF TRACK 二分入口（`lando-05`）→ ⑥头盔名人堂网格 → ⑦冠军商店、合作方、社交卡扇面 → 荧光黄页脚（`lando-06`）。节奏是「大字声明 → 横向漫游 → 二选一 → 陈列」交替。
- **滚动编排**：横滚用 CSS sticky 实现（`.horizontal-pin-sticky` 包住 `.horizontal-track`，轨道宽 4583px）。实测在 scrollY 约 2.0k 到 5.8k 之间，translateX 从 -273 走到 -3143，竖横比约 1.2:1，没有 pin-spacer。整页叠了一层连续的等高线 SVG 纹样（赛道地形的意象），横滚过程中它把各段「缝」在一起。
- **转场**：签名描线、字带横移和人像缩放同时进行；章节之间用底色插值过渡，而不是硬切。
- **排版与配色**：#D2FF00 荧光黄加 #111112，衬线（Brier）与粗体无衬线在同一行混排，形成「一半优雅、一半赛车」的张力。
- **鼠标交互**：首屏头盔跟随鼠标（Awwwards 标签里有 Gestures / Interaction）。
- **声音**：未见声音开关。
- **手机端**：横向轨道整体改成竖向的「照片 + 地点年份」流（`lando-m02`）；首屏改成 logo 形状的遮罩人像，配荧光黄底（`lando-m01`）；ON/OFF TRACK 改成上下两块（`lando-m03`）。
- **reduced-motion**：截图没有差异（`lando-rm01`）。Webflow 运行时里有 matchMedia 检查，但主体动效照常播放。
- 截图：[01 首屏](group1/lando-01.jpg) · [02 签名描线](group1/lando-02.jpg) · [03 横滚起点](group1/lando-03.jpg) · [04 横滚中段](group1/lando-04.jpg) · [05 二分入口](group1/lando-05.jpg) · [06 页脚](group1/lando-06.jpg) · 手机 [m01](group1/lando-m01.jpg) [m02](group1/lando-m02.jpg) [m03](group1/lando-m03.jpg) · [reduce](group1/lando-rm01.jpg)

### 2. Oryzo AI（oryzo.ai）

- **奖项**：Awwwards **SOTD 2026-04-13**（7.86 分，已核实）；**SOTM 2026 年 4 月**（已核实 SOTM 列表）。工作室 Lusion（自发项目：把一个软木杯垫当成「AI 时代的产品发布」来讲，是一个恶搞作品）。
- **技术栈**：Astro（`/_astro/hoisted.*.js`），three r178「modified by Lusion」（`window.__THREE__` 原文），页面上 6 个 canvas，Vimeo 播放器嵌入。没有检测到 Lenis，也没有检测到 GSAP 全局变量（有自研滚动层的可能）。字体：halyard（text 和 display 两个可变字族）、Literata、DM Mono。
- **粗测**：电脑端 JS 789KB（其中 Vimeo 约 460KB），总计 16.5MB（图片 7.6MB，XHR 7MB）。LCP 读数 21.6s：LCP 元素是加载结束后才出现的视频缩略图，这个数主要说明「加载动画后面才出 LCP」的代价。手机端 JS 307KB / 9.8MB，LCP 约 4.6s。文档高度 55.8k px（手机 41.7k）。
- **幕结构与节奏**：一个「产品发布会」脚本：主视觉（桌面上的杯垫）→ Powered by AI* → 「it's w◯able」（杯垫替代字母）→ **横向**生活方式拼贴（中央杯垫、两侧照片向左流动，`oryzo-03`）→ 杂志封面 → 桌面俯拍 → 巨字 ORYZO → 微距材质 → 「sustainability」切开的树皮（`oryzo-05`）→ 评价 → **第二段横向**「Runs on…」兼容性（`oryzo-06`）→ 历代古器配杯垫 → 收尾一句点题：「IF WE CAN SELL A COASTER, IMAGINE WHAT WE CAN DO FOR YOUR BRAND」。笑点大约每 2–3 屏一个，靠这个撑住了 55k px 的长度。
- **滚动编排**：两段横向轨道。第一段宽 4451px，在 scrollY 约 9.2k 到 18.5k 之间平移约 3.9k px，竖横比约 2.4:1，慢；第二段宽 8165px，在 46k 到 51k 之间。两段都靠 sticky 容器（`section__inner`）。杯垫这个 3D 主角在各段之间**连续形变、换位**，没有任何一次切镜头。
- **转场**：用物体连续性代替转场；文字和物体互相遮挡（巨字压在物体后面，或者被物体穿过）。
- **排版与配色**：自述只用 4 个颜色（奶油、近黑、橄榄、橙），99% 的文字用同一字族。
- **手机端**：横滚段改成有页码短横线的分页卡片（`oryzo-m03`）；中间插入线框示意图来代替部分 3D 场景（`oryzo-m02`）。
- **reduced-motion**：没有差异（`oryzo-rm01`）。
- **对我们的启发**：主角物体全程不下场，这是第 1 条借鉴的最佳样本；「把主角嵌进文字」是第 9 条。反面例子：首屏前的加载动画，以及 16MB 的总量。
- 截图：[01 主视觉](group1/oryzo-01.jpg) · [02 物体嵌字](group1/oryzo-02.jpg) · [03 横滚段](group1/oryzo-03.jpg) · [04 俯拍](group1/oryzo-04.jpg) · [05 材质](group1/oryzo-05.jpg) · [06 第二段横滚](group1/oryzo-06.jpg) · 手机 [m01](group1/oryzo-m01.jpg) [m02](group1/oryzo-m02.jpg) [m03](group1/oryzo-m03.jpg) · [reduce](group1/oryzo-rm01.jpg)

### 3. Capitolium（collabcapitolium.fr）

- **奖项**：Awwwards **SOTD 2026-05-18**（7.4 分，已核实；标签里有 Horizontal Layout、Fullscreen、GSAP、Nuxt.js）。制作方 Supercolor、Local Studio、Jonas Reymondin。内容是图卢兹足球俱乐部与图卢兹体育场橄榄球俱乐部联名球衣的品牌叙事（「在市政厅里漫步」）。
- **技术栈**：Nuxt（Vue），Lenis（duration 加 expo 缓动，`smoothTouch:false`、`touchMultiplier:2`、`wheelMultiplier` 按条件取 0.5 或 1），包内有 GSAP 和 ScrollTrigger 的特征串，3 个全屏 canvas（WebGL 库未能确定）。CMS 用 Kirby（工作室页面写的）。字体：gin（粗体展示）、Edwardian Script、Times。
- **粗测**：电脑端 JS 1135KB（其中第三方约 800KB：Axeptio、gtag×2、GTM、FB 等），首屏 22.6MB（视频 13MB），滚完 52MB。电脑 LCP 约 5.6s；手机 4G 下 LCP 约 34–40s（要先点 Cookie 和「Entrer」，首屏是大视频）。文档高度 31k px。
- **幕结构与节奏**：Cookie 加「ENTRER」门槛 → 市政厅立面加引言（`capitolium-01`）→ 「PLUS QU'UN MAILLOT」竖向球衣展示（`capitolium-02`）→ **第一章「Les arcades」横向轨道**：拱形遮罩的照片、文字栏、球衣静物、球员肖像沿横向依次排开，花体大字章节名横压在画面上（`capitolium-03`）→ **第二章「Salle du conseil」作为一整张新面板从右侧推入**，带自己的页眉（`capitolium-04`、`capitolium-05`）→ 室内全景加花体字（`capitolium-06`）→ 第三章……
- **滚动编排**：实测三条 `.chapter__track`（6383 / 6160 / 9284px）依次横移。第一条在 scrollY 7.5k 到 23k 之间走完 6383px，竖横比约 2.4:1。钉住全部靠 sticky（`block-story__pin`、`block-collection__sticky`、`block-weekend__sticky` 等），没有 pin-spacer。底部常驻「≡ CHAPITRE I ≡」胶囊，顶栏常驻「CAPITOLIUM」加当前章节名。
- **转场**：章节之间是「整页面板横向推入」，旧章节被新章节的页眉一并推走，像翻一本横向装订的书（`capitolium-04` 是正好处在交接瞬间的一帧）。
- **排版与配色**：奶油色 #F0E3CF 配石墨色 #58595B，加金色点缀；全大写衬线标题、花体章节名、拱形图片遮罩。所有母题都来自市政厅建筑本身。
- **手机端**：章节改成竖向，拱形卡片左右露边，暗示可以横滑；章节胶囊保留（`capitolium-m01`、`capitolium-m02`）；周边产品区改成双列拼贴（`capitolium-m03`）。
- **reduced-motion**：没有差异（`capitolium-rm01`）。
- **对我们的启发**：这是「竖滚进入 → 按章节横滚 → 章节之间整页推入」最完整的样本，直接对应第 2 幕按组合分段（第 3 条借鉴）；母题取自题材本身（拱形对应市政厅），我们对应的是「棱镜、光缝」形状的遮罩。反面例子：进入门槛和首屏大视频。
- 截图：[01 立面引言](group1/capitolium-01.jpg) · [02 竖向球衣](group1/capitolium-02.jpg) · [03 第一章横滚](group1/capitolium-03.jpg) · [04 章节推入瞬间](group1/capitolium-04.jpg) · [05 第二章](group1/capitolium-05.jpg) · [06 全景加花体](group1/capitolium-06.jpg) · 手机 [m01](group1/capitolium-m01.jpg) [m02](group1/capitolium-m02.jpg) [m03](group1/capitolium-m03.jpg) · [reduce](group1/capitolium-rm01.jpg)

### 4. OceanX 2025 Year in Review（2025.oceanx.org）

- **奖项**：Awwwards **SOTD 2026-02-23**（7.44 分，已核实；标签 Horizontal Layout、Scrolling、WebGL、Three.js、Blender）。制作方 Unseen Studio 与 PROPAGANDE。
- **技术栈**：Nuxt，three r181，包内有 GSAP、ScrollTrigger、Howler 的特征串。**虚拟滚动**：`scrollHeight` 等于视口高度，滚轮驱动内部进度。字体：Zeist、DM（Mono）。
- **粗测**：电脑端 JS 1.58MB（其中 gtag 约 550KB），总计 27.7MB（Fetch 22MB，主要是 3D 和纹理资源）。LCP 约 4.6s（逐字动画的标题 `DIV.--char`）。手机端 LCP 约 6.3s。
- **幕结构与节奏**：加载环「LOADING ASSETS」→ 地球加标题「A Year of Discovery」加「ENTER EXPERIENCE」（`oceanx-01`）→ 进入后切到俯视海面，科考船固定在画面中央向前航行，**7 个章节**（UNOC3、Africa、Cabo Verde、Indian Ocean、Timor……）的文字面板在左下依次滑入、滑出（`oceanx-02` 到 `oceanx-05`）→ 收尾回到地球「Share the Journey」（`oceanx-06`）。首尾都是地球，形成闭环。
- **滚动编排**：滚轮推进的是「航程」，不是页面。船不动，世界相对它移动，海浪尾迹随速度变化。章节文字从右往左穿过画面（`oceanx-05` 是正在离场的一帧）。这其实就是一种「横滚」，只是由 WebGL 世界来承载。
- **声音**：点击「ENTER EXPERIENCE」这个手势同时打开音频，左上角显示「AUDIO ON」开关，右上角是 Chapters 菜单，页眉下一根细进度线。
- **手机端**：同样要先点「进入」（我们的自动点击没能真正进入体验，只截到加载页和首页：`oceanx-m01`、`oceanx-m02`）。
- **reduced-motion**：没有差异（`oceanx-rm01`）。
- **对我们的启发**：「主角固定、世界流动」的横向推进非常适合第 5 幕「记忆在偶像间传递」：光粒固定在中央，偶像依次从右侧流过。首尾闭环（地球 → 地球）对应我们的白光 → 白光。反面例子：虚拟滚动、进入门槛、27MB 资源。
- 截图：[01 入口](group1/oceanx-01.jpg) · [02 章节 1](group1/oceanx-02.jpg) · [03 章节 2](group1/oceanx-03.jpg) · [04 章节 4](group1/oceanx-04.jpg) · [05 文字离场](group1/oceanx-05.jpg) · [06 收尾地球](group1/oceanx-06.jpg) · 手机 [m01](group1/oceanx-m01.jpg) [m02](group1/oceanx-m02.jpg) · [reduce](group1/oceanx-rm01.jpg)

### 5. Inkwell（inkwell.tech）

- **奖项**：Awwwards **SOTD 2025-05-26**（7.61 分，已核实；标签 Scrolling、Transitions、Storytelling、3D）。工作室 SavoirFaire。Awwwards 上有官方案例文章（2025-06-25）。
- **技术栈**：案例文章自述 **Vue.js 加 Vue Custom Renderer 加 OGL 加 GSAP，物理用 RapierJS**。运行时证实了 Nuxt、Lenis（`syncTouch:false`），包内能匹配到 OGL 和 Rapier。只有 1 个全屏 canvas，DOM 和 3D 由同一套组件树驱动。字体：FK Grotesk、FK Grotesk Mono。
- **粗测**：电脑端 JS 2.0MB（主包 1245KB），总计 6.4MB；LCP 约 4.6s，而 **LCP 元素是 Cookie 横幅**（`P.cookie`）。手机端 JS 1.8MB / 3.7MB。文档高度 28.3k px。
- **幕结构与节奏**：案例里说他们先写梗概、定三幕结构、画分镜，「每个滚动段是一场戏」。实测：约 30 张图组成的旋转圆环（`inkwell-01`）→ 环展开成弧（`inkwell-02`）→ 排成一列透视卡片（`inkwell-03`）→ 斜向等距堆叠，配应用场景标签（`inkwell-04`）→ 收拢成一个小立方体 → 天空渐变加细圆环「Inkwell is the Intelligence Layer…」（`inkwell-05`）→ 人像气泡漂浮、聚合到品牌标志（`inkwell-06`）→ 应用领域列表 → 联系表单。
- **滚动编排**：不靠钉住（1 个 sticky 容器），所有群体编排都在 canvas 里按滚动进度插值，DOM 文字层只负责字幕式的说明。顶部有一个**只显示、不能跳转**的 pathfinder（Intro / Vision / Applications / Talents）。
- **鼠标交互**：标题微交互、气泡悬停。手机端有「CLICK & HOLD TO CHANGE THE TONE OF VOICE」长按交互（`inkwell-m02`）。
- **手机端**：后半段的场景改成圆角大卡片的全屏渐变，下方提示「KEEP SCROLLING」（`inkwell-m01` 到 `inkwell-m03`）。
- **reduced-motion**：没有差异（`inkwell-rm01`）。
- **对我们的启发**：技术路线（OGL 单 canvas 加 Vue 组件驱动）跟我们最像，而且证明 OGL 撑得起 SOTD 级的群体编排；「约 30 个元素：环 → 线 → 堆 → 收」可以直接映射到 28 道光（第 2 条借鉴）。反面例子：2MB JS，Cookie 横幅当了 LCP。
- 截图：[01 圆环](group1/inkwell-01.jpg) · [02 弧](group1/inkwell-02.jpg) · [03 一列](group1/inkwell-03.jpg) · [04 斜向堆叠](group1/inkwell-04.jpg) · [05 天空圆环](group1/inkwell-05.jpg) · [06 人像聚合](group1/inkwell-06.jpg) · 手机 [m01](group1/inkwell-m01.jpg) [m02 长按交互](group1/inkwell-m02.jpg) [m03](group1/inkwell-m03.jpg) · [reduce](group1/inkwell-rm01.jpg)

### 6. Shopify Editions Winter '26：The Renaissance Edition（shopify.com/editions/winter2026）

- **奖项**：Awwwards **SOTD 2026-02-09**（7.92 分，已核实）；**SOTM 2026 年 2 月**（已核实 SOTM 列表）。Shopify Design 团队与 Danetag 等人合作。
- **技术栈**：Shopify Hydrogen / Oxygen（`cdn.shopify.com/oxygen-v2`），Lenis（`lerp:0.1`），three r181 用在 `Background-*.js`（312KB）。包内有 Theatre.js 和 Rive 的特征串，还有 `prefers-reduced-motion` 的 matchMedia 检查（`window.REDUCE_MOTION`）。字体：Neue Montreal、Inter Variable，点缀用 HWCigars、ImperialScript。
- **粗测**：电脑端 JS 1012KB（第三方约 315KB），首屏 2.8MB，滚完 22.6MB；LCP 读数 16.5s，LCP 元素是一段初始 `opacity-0` 的副标题，被入场动画推迟了。**手机端 JS 只有 280KB，总计 634KB**，LCP 约 4.0s。文档高度 53k px。
- **幕结构与节奏**：150 多项产品更新，按 22 个类目（Sidekick、Agentic、Online、Retail、Marketing、Checkout……）排成章节。每个类目开头是一幅文艺复兴油画拼贴（人物手持手机、滑板、粉色购物袋，`shopify-01`、`shopify-04`、`shopify-05`），之后是功能卡片和清单（`shopify-02`、`shopify-03`）。结尾是密集的功能清单（`shopify-06`）。节奏是「一幅大画 → 若干功能 → 下一幅大画」，非常规律。
- **滚动编排**：多个 `sticky top-0 h-screen` 层叠，油画和下一段之间用撕纸、遮罩过渡（`shopify-03` 能看到撕纸边缘）。**左侧常驻章节目录**，带编号 1–22，当前项高亮。
- **手机端**：完全去掉油画 WebGL 背景，首屏是黑底细线框加标题（`shopify-m01`），往下就是纯文档流的功能卡片（`shopify-m02`、`shopify-m03`）。这是「静态级」做得最彻底的样本。
- **reduced-motion**：截图上看不出明显差异（`shopify-rm01`）。代码里有检查，可能只作用于部分组件。
- **对我们的启发**：①长内容靠「每章一幅大画加常驻目录」维持节奏；②手机端果断降到文档流，传输量砍掉 75% 以上；③反面例子：入场动画把 LCP 推到 16 秒。
- 截图：[01 首屏油画](group1/shopify-01.jpg) · [02 Sidekick 功能](group1/shopify-02.jpg) · [03 撕纸转场](group1/shopify-03.jpg) · [04 Marketing 章](group1/shopify-04.jpg) · [05 Checkout 章](group1/shopify-05.jpg) · [06 功能清单](group1/shopify-06.jpg) · 手机 [m01](group1/shopify-m01.jpg) [m02](group1/shopify-m02.jpg) [m03](group1/shopify-m03.jpg) · [reduce](group1/shopify-rm01.jpg)

### 汇总表

| 站 | 奖项（核实情况） | 框架 / 滚动 / 3D | JS（含第三方） | 首屏总量 | LCP 电脑 / 手机 4G | 文档高度 | 横向轨道 | 钉住方式 | reduce 下 |
|---|---|---|---|---|---|---|---|---|---|
| Lando Norris | SOTY 2025 ✔，SOTM 2025-11（推断） | Webflow / Lenis / three | 575KB | 5.7MB | 3.1s / 4.0s | 12.7k | 1 段，约 1.2:1 | sticky | 无变化 |
| Oryzo AI | SOTD 2026-04-13 ✔，SOTM 2026-04 ✔ | Astro / 自研 / three（改） | 789KB | 16.5MB | 21.6s* / 4.6s | 55.8k | 2 段，约 2.4:1 | sticky | 无变化 |
| Capitolium | SOTD 2026-05-18 ✔ | Nuxt / Lenis / canvas×3 | 1135KB | 22.6MB | 5.6s / 约 35s* | 31k | 3 段章节，约 2.4:1 | sticky | 无变化 |
| OceanX 2025 | SOTD 2026-02-23 ✔ | Nuxt / 虚拟滚动 / three | 1581KB | 27.7MB | 4.6s / 6.3s | 虚拟 | WebGL 世界横移 | 无（虚拟） | 无变化 |
| Inkwell | SOTD 2025-05-26 ✔ | Nuxt / Lenis / OGL + Rapier | 2003KB | 6.4MB | 4.6s* / — | 28.3k | 无（canvas 内编排） | 1 个 sticky | 无变化 |
| Shopify Renaissance | SOTD 2026-02-09 ✔，SOTM 2026-02 ✔ | Hydrogen / Lenis / three | 1012KB（手机 280KB） | 2.8MB（手机 0.6MB） | 16.5s* / 4.0s | 53k | 无 | sticky 层叠 | 基本无变化 |

\* Oryzo 的 LCP 是加载动画之后出现的视频缩略图；Capitolium 手机端要先过 Cookie 和「Entrer」，首屏是大视频；Inkwell 的 LCP 是 Cookie 横幅；Shopify 的 LCP 被 opacity 入场动画推迟。Inkwell 手机端的 LCP 观察器没有返回值。

---

## 放弃或未展开的候选

| 候选 | 奖项 | 放弃原因 |
|---|---|---|
| Opal Tadpole（opalcamera.com/opal-tadpole） | SOTY 2024，SOTD 2024-01-11 ✔ | **获奖页面已经下线**：原地址重定向到 op.al 首页（2026 年的「the table」宣言长文页），获奖时的产品叙事无法复现。截图只留在临时目录，没有入库。 |
| Igloo Inc（igloo.inc） | SOTY 2024 ✔（Business & Services Honors 2024-07） | 已抓取。它是**虚拟滚动的无限循环**（冰屋 → 光球 → 企鹅 → 冰屋），没有钉住和横滚，跟本组主题关系不大；手机端的虚拟滚动也没法自动化驱动。值得记一笔：JS 只有 420KB（单个 three 包），左下角常驻「Sound: Off」，默认静音。 |
| Zentry（zentry.com） | SOTM 2024-08 ✔ | 已抓取。纯竖滚，JS 3.2MB（Spline 加物理引擎）。有一点有参考价值：它暴露了 `ScrollTrigger.getAll()`，能看到一串专门切换深浅主题的 `themeTrigger`，相当于「深浅段落节奏」的工程做法；正文第三节第 7 条已经引用。 |
| Terminal Industries（terminal-industries.com） | SOTM 2025-09 ✔（SOTD 7.68 分） | 已抓取。B2B SaaS 的常规竖向段落（计算器、FAQ、表单），叙事性弱；视频 10MB，手机 LCP 约 18s。只有开头「卡车 → 线框隧道 + 逐字标题」那一段转场可以参考。 |
| Fluid Glass（fluid.glass） | SOTD 2026-03-30 ✔ | 已抓取首页和 /approach 页。横滚只出现在 /approach 的一小段工艺流程里，属于建筑 B2B 网站，叙事分量不够；自动滚动步长也错过了那一小段。 |
| Messenger（abeto） | SOTY 2025 ✔ | 没有抓取。它是游戏化的 3D 探索，不是滚动叙事。 |
| Cartier Watches & Wonders 2025（Immersive Garden） | SOTM 2025-08 ✔ | 没有抓取。6 个 3D 场景靠点击切换，不是滚动叙事。 |
| More Nutrition、Working Stiff Films、Into the Amazon 等 | SOTD 2025 | 没有抓取。前两个分别以逐帧序列图、纯 DOM 时间轴为卖点，技术上和上面的入选站重复；Into the Amazon 偏媒体长文。时间留给了更贴近横竖交替的站。 |

---

## 附：方法与复现

- 抓取脚本在仓库外：`%TEMP%\landing-research\group1\capture.mjs`（单站抓取：电脑、reduce、手机三段）和 `contact.mjs`（拼接缩略图总览）。每站的原始数据（技术栈、网络分类、横向轨道探针、sticky 列表、LCP）也在那里：`out\<站>.json`。
- 需要先点进入或 Cookie 的站，用环境变量 `PRECLICK` 指定按钮文字（Capitolium：「OK pour moi」「Entrer」；OceanX：「Enter experience」）。
- 只记录手法，没有把任何站点的代码、着色器、素材复制进仓库；`group1/` 里的截图只用于内部调研。
