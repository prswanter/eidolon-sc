# 第 3 组调研：日文排版 + 角色/偶像/动画/游戏官方站

调研日期：2026-10-10。共看了 8 个站：2 个必看的偶像大师官方站，加 6 个获奖或被日本设计收录站收录的角色、偶像、动画、音乐类站点。

做法：在仓库外用 Node + Playwright（Chromium 无头，1440×900 和 iPhone 13 两种尺寸）自己写脚本抓取。用 CDP Network 事件统计传输体积；LCP 用 PerformanceObserver 取粗值；字体和排版数据来自 getComputedStyle；动画数量来自 `document.getAnimations()`，分别在 reduced-motion 开和关两种情况下各测一次。有 cookie 横幅、弹窗、声音选择闸门的站，脚本会先关掉或点过去再截图。所有体积和 LCP 都是单次测量的粗值，网络环境是本机经代理访问日本站点，只适合用来比较数量级。

---

## 1. 结论

### 1.1 可以借鉴的具体手法

| # | 手法（出处） | 用在哪一幕 | 怎么做 |
|---|---|---|---|
| A | **竖排名牌横向排开**。あかね噺的「登場人物」做成寄席的名牌板，十几块竖排名牌从右往左排成一排（[akane-2](group3/akane-2.jpg)） | 第 2 幕 | 每道光本身就是一块竖排名牌：一位偶像对应一条细长的光柱，柱里是竖排的巨大日文名。名牌之间不画框线，只靠光的明暗区分。组合之间留一道更宽的暗隙 |
| B | **角色色接管整页**。パラライ按队轮播时，背景、纸屑、灯光都换成队色（[paralive-1](group3/paralive-1.jpg)、[paralive-m1](group3/paralive-m1.jpg)）；すいせい官网全站只用她的个人色 #003CFF 加荧光黄 #F5FF14 点缀（[suisei-2](group3/suisei-2.jpg)） | 第 2 幕 | 聚焦某位偶像时，环境光（背景渐变、粒子、光谱的辉光）过渡到她的印象色，其余 27 道光降到约 20% 亮度并去饱和。印象色只做光，不做色块或卡片底色 |
| C | **组合是一级分段，偶像是二级**。シャニマス官网先列 8 个组合，再进组合页看成员（[shinycolors-idol-1](group3/shinycolors-idol-1.jpg)）；BMSG 在人像墙的行与行之间夹组合名走马灯（[bmsgfes-artist-1](group3/bmsgfes-artist-1.jpg)） | 第 2 幕 | 8 个组合段的起点各放一个细窄的「刻度」：组合的拉丁名（可变展示字体，细字重）加片假名小字。只用文字，不用组合 logo |
| D | **点按钮放一条语音，同时只放一条**。シャニマス个人页的 VOICE 1/2/3 和学マス的「自己紹介1/2」是同一套脚本：点击时 `new Audio(.../voice_N.mp3)`，先停掉上一条再播（[shinycolors-member-1](group3/shinycolors-member-1.jpg)、[gakumas-idol-1](group3/gakumas-idol-1.jpg)） | 第 2 幕 | 沿用「一次只放一句、切换就淡出上一句」的规则，但加上同步的日语原文加中文字幕。官方没有字幕，这是我们和官方拉开距离的地方 |
| E | **竖排长文，注音用小字括注**。あかね噺的故事简介整段 `vertical-rl`：标语 32px，正文 24px，假名注音用 16px 括注（[akane-4](group3/akane-4.jpg)） | 第 3 幕 | 日语原文竖排在右，中文字幕横排在左下，对照着看。注音改用 `<ruby>`，不用括号 |
| F | **两侧竖排导航轨**。あかね噺左右两条黑边栏写着竖排的「公式」「もくじ」；BMSG 两侧有竖排的时间码和资讯滚动条；違国日記右侧有竖排的英文副标（[bmsgfes-1](group3/bmsgfes-1.jpg)、[ikoku-1](group3/ikoku-1.jpg)） | 全局 | 左侧放一条竖排的日文幕名作为进度指示（例：「白光」「分光」「声」「記憶」）。字号 12–14px，当前幕高亮成白色 |
| G | **一根细线贯穿全页**。違国日記用一根手绘感的浅蓝细线在各 section 之间蜿蜒，把整页串起来（[ikoku-2](group3/ikoku-2.jpg)、[ikoku-6](group3/ikoku-6.jpg)） | 第 6 幕，也可全局 | 白光细线从第 0 幕的那束光一直延伸下去。第 6 幕的「抽象光迹」就是这根线的放大版。用 SVG path 加 `stroke-dashoffset` 随滚动推进 |
| H | **大字号汉字按网格排**。少女革命計画首屏 6 个汉字各占一格，叠在立绘上，粗黑体、`palt`、负字距（[grp-1](group3/grp-1.jpg)） | 第 1 幕和第 8 幕的幕标题 | 2–4 个汉字的幕标题按网格摆放，单字 15–20vw。用明朝体的话会比原站更安静 |
| I | **3D 主体加拖拽或滚轮导航**。BMSG 把皇冠字标做成 3D 物体，各板块（ARTIST、SPONSOR 等）绕它切换，按 DIVE 进入（[bmsgfes-3](group3/bmsgfes-3.jpg)） | 第 0–1 幕 | 只借「一个主体贯穿、滚动只换角度和光」这个思路：棱镜作为唯一的 3D 主体，各幕只改变光路。不要照搬它的资源规模（见 1.2） |
| J | **安静的长文排版**。違国日記的故事简介居中横排，行间距很大，字距略松，背景只有淡云（[ikoku-3](group3/ikoku-3.jpg)） | 第 7 幕 | 诚实事项做成居中、行高约 2.2 的中文短段落，不加图标和卡片。这一幕是全片动效最少的地方 |

### 1.2 要避开的套路

- **首屏被横幅和弹窗遮住**。シャニマス和学マス都有 OneTrust cookie 横幅占住顶部约 90px；あかね噺进站先弹出第 2 期祝贺图的弹窗（第一次截图整屏都是弹窗）。我们的首屏只放第 0 幕的白光。
- **闸门叠闸门**。パラライ要先选声音 ON/OFF，再点票根上的 CLICK（或 SKIP）才进主页（[paralive-rm](group3/paralive-rm.jpg) 是闸门画面）；BMSG 要等 ENTER 按钮出现，本机测得 LCP 28–36 秒。评审和用户都会在这里流失。
- **资源失控**。BMSG 的 10 个 `logo-N.glb` 加起来约 35MB；シャニマス首页图片 31MB，主视觉是一张 900KB 的 PNG，手机 LCP 约 16.9 秒。
- **Google Fonts 日文按 unicode-range 切片**。結果是 33–106 个字体请求、657KB–1MB（違国日記 106 个文件约 1MB）。我们的日文文本是固定的，完全不需要这样切。
- **完全不理会 prefers-reduced-motion**。8 个站里没有一个真正处理：开启 reduce 后 `getAnimations()` 的数量基本不变，学マス的主视觉视频照样播放。只有すいせい的 CSS 里有一条，还是来自 Contact Form 7 插件。我们把这件事做好就是加分项。
- **证件照卡片式的 carousel 名单**。学マス把十几人做成横向的证件照卡片轮播（[gakumas-idol-2](group3/gakumas-idol-2.jpg)），シャニマス把组合做成 banner 轮播。能用，但很平庸。
- **角色名和台词做成图片字**。シャニマス个人页的汉字名、竖排台词都是图片，DOM 里没有对应文字，不能选、读屏器读不到、也没法换字体。我们的名字和台词必须是真文本。

### 1.3 避免与官方撞脸

两个官方站的视觉签名（下面这些我们都**不能用**）：

| 元素 | シャニマス | 学マス |
|---|---|---|
| 底色和气氛 | 浅天蓝、白羽毛、天空云 | 白底、橙色渐变导航条、校徽菱形纹 |
| 标题式样 | 上面是 Quicksand 细体全大写宽字距的「IDOL」，下面是片假名「アイドル」 | 上面是 Poppins 粗体大号英文，旁边是宽字距的日文 |
| 日文字体 | Noto Sans JP；**正文 fallback 是 Shippori Mincho B1** | IBM Plex Sans JP（200–500），介绍文用 Zen Antique Soft |
| 字距 | 组合名、按钮文字都是 0.3em 宽字距（24px 配 7.2px） | 标题 0.3em，竖排名字 0.06em |
| 个人页模板 | 左边是印象色色条里的竖排台词，右边是印象色的罗马字大名、细汉字名、VOICE 1/2/3、profile 表 | 几乎一样：红色色条竖排台词、罗马字加细汉字名、自己紹介 1/2 语音按钮、profile 表 |

由此得出的规则：
1. **不用「竖排台词放在印象色色条里，加罗马字大名，加语音按钮，加 profile 表」这套个人页组合**。这是 iM@S 官方共用的模板，粉丝一眼就认得出来。第 2 幕聚焦时只出现：竖排日文名（白色，名字本身发她的色光）、一位立绘、一句台词字幕。不放身高、生日、三围这类资料表。
2. **永远深色**。两个官方站都是浅色，深色本身就是最大的区分点，这个方向保持不变。
3. 不用羽毛、天空、云；不用 Quicksand、Poppins；不用「英文大标题加片假名小字」的双层标题。
4. **不用 Shippori Mincho B1**，因为它就是シャニマス官网的正文字体（见 1.4）。
5. 印象色只用来做光（辉光、粒子、文字发光），不用来做色块底或色条，因为色块正是官方的用法。
6. 字距反着来：官方都是松散的 0.3em 宽字距，我们的大字用 0 或负字距加 `palt`，小字正常字距。
7. 不出现官方 logo、组合 logo、「THE IDOLM@STER」字标。组合名一律用文字。首屏和页脚都要有「非官方粉丝作品」的明确声明。

### 1.4 对暂定方案的修正建议

**字体**
- **把 Shippori Mincho B1 换掉。** シャニマス官网 body 的 `font-family` 就是 `"Shippori Mincho B1", serif`，还从 Google Fonts 加载了它。我们再用它做主展示字体，等于和官方共用一个字体。建议日文展示改用 **Zen Old Mincho**（OFL）。学マス用的是同家族的 Zen Antique Soft，但 Old Mincho 的字形差别足够大；它比 Shippori 更古典，笔画对比更强，和我们深色加发光的风格更搭。备选是 Kaisei Tokumin 或 Noto Serif JP，都是 OFL。
- **CJK web font 体积怎么控制。** 这次实测：Google Fonts 切片方式 33–106 个文件，657KB–1MB；Adobe Fonts 动态子集方式（少女革命計画、あかね噺）6–7 个文件，142–284KB。BMSG 也是 Adobe，但单个 kozuka 子集就有 373KB。落地页上的日文是固定的：28 个名字、28 句招呼、几个幕标题。所以应该**在构建时按实际文本做静态子集**（pyftsubset 或 glyphhanger），自托管 woff2。按每个字重几百字估算，日文明朝两个字重合计应在 40–80KB；中文 Noto Sans SC 也按落地页的文案做子集，估计 100–200KB。这样可以比观测到的最好水平再小一档。（以上是估算，需实测。）
- **子集要保留竖排字形。** pyftsubset 要加 `--layout-features+=vert,vrt2,vpal,palt`，并且把竖排标点（、。「」ー…）收进子集。あかね噺把竖排里的「、。“”」单独包成 span，回退到系统 `serif`，很可能就是子集里缺了竖排标点，结果标点换了字体，看得出不协调。
- **字距调整。** 横排日文标题开 `palt`（すいせい、少女革命計画、BMSG、あかね噺都开了）；竖排开 `vpal`（字体是否支持需要验证）。大字号用负字距，例如少女革命計画是 -0.02em。

**竖排**
- 只用于日文（名字、招呼、幕名轨）。中文说明一律横排，避免在同一屏里出现两种语言的竖排。
- 手机端也保持竖排。あかね噺在手机上仍然竖排，正文缩到约 14–20px（[akane-m2](group3/akane-m2.jpg) 上方）。竖排名字反而适合窄而高的手机屏：每位偶像占一列，左右滑动切换。
- 技术要点：`writing-mode: vertical-rl; text-orientation: mixed;` 两位数字用 `text-combine-upright: digits 2`；姓和名之间用全角空格，或者拆成两列。

**28 人按组合的横滚光谱**
- **顺序按组合，不按色相。** シャニマス官方的组合顺序是 イルミネーションスターズ → アンティーカ → 放課後クライマックスガールズ → アルストロメリア → ストレイライト → ノクチル → シーズ → コメティック（取自首页和偶像页 DOM），粉丝对这个顺序很熟。建议第 1 幕分光的那一刻按色相排成彩虹，进入第 2 幕时光束「重新归队」成 8 个组合段。这个重排本身就可以做成第 1→2 幕的转场，也顺便解释了「为什么是这个顺序」。
- **滚动方向可以考虑从右往左。** 日文竖排的阅读方向是从右到左，あかね噺的名牌板也是从右排起。光谱从右往左推进，名字的阅读顺序就和竖排一致；但中文用户习惯从左往右，需要做原型测试。
- **聚焦的反馈**：环境光换成她的印象色（手法 B），其余降亮，立绘淡入。同一时间只挂一个 Spine，和官方的做法一致。
- 不做卡片或 carousel（见 1.2）。

**声音规则**
- 观测结果：8 个站都没有有声自动播放，学マス和パラライ的视频是 muted autoplay。有声音设计的两个站都用显式闸门：パラライ让用户二选一 ON/OFF，选 ON 后用 Howler 播 9 首按队区分的 BGM（bgm-1~9.mp3，约 3.5MB）；BMSG 用 ENTER 按钮的点击来解锁音频，之后有 main.mp3 作 BGM，click、dive、page 作音效。官方偶像大师站只在点语音按钮时播一条。
- 建议：
  1. **开场不设声音闸门。** 首屏必须立刻出现白光，不能让评审先做选择题。
  2. **默认静音。** 第 2 幕「点击偶像」这个动作本身就是用户手势：第一次点击直接播放招呼，同时在右上角出现常驻的 SOUND 开关（参考パラライ的波形小图标）。之后的点击都遵守这个开关。
  3. **不放 BGM，不做 hover 音效。** 每句语音不超过约 3 秒，同时只播一条，播放时字幕同步出现。
  4. **第 4 幕的来电不能自己响铃。** 必须等用户点「接听」才出声，铃声只做成视觉上的振动和光的脉冲。
  5. 语音按需加载，只拉当前聚焦偶像的那一条（opus 或 m4a，约 30–50KB 一条）。不要像パラライ那样一次预载几 MB。
- prefers-reduced-motion：既然 8 个站都没做，我们在 reduce 模式下要做到：光谱不做惯性横滚，改成逐段吸附；光的流动改为静态渐变；Spine 只显示静帧。

---

## 2. 逐站拆解

### 2.1 シャニマス官网（必看）
- URL：https://shinycolors.idolmaster-official.jp/
- 奖项：无（官方站，必看对象）
- 技术栈：jQuery、Swiper、lottie，加 OneTrust 和两个 GTM。没有 WebGL 或 canvas。偶像页用原生 `new Audio()` 放语音。
- 体积（首页桌面）：JS 1041KB（其中 lib.js 537KB），字体 657KB / 33 个文件（Google Fonts：Noto Sans JP、Shippori Mincho B1、Quicksand），图片约 31MB，共 165 个请求。
- LCP 粗测：桌面 6–8 秒（主视觉 `kv_pc.png`，918KB），手机约 16.9 秒（手机也加载了 kv_pc.png）。
- reduced-motion：不响应（动画 2 → 2）。
- 拆解：
  - 排版：标题用 Quicksand 细体全大写，宽字距 0.2em。组合名用 Noto Sans JP 24px，字距 0.3em。body 字体是 Shippori Mincho B1，但页面上大部分文字被 Noto Sans JP 覆盖（Noto 42 个元素，Shippori 只有 5 个）。真正的竖排只有页脚的「PAGE TOP」；个人页的竖排台词是图片。
  - 名单信息架构：首页依次是组合 banner 轮播，8 个组合 logo 一行，然后进组合页（3–5 人横排，名字做成方框按钮），再进个人页。个人页依次排着：印象色色条里的竖排台词、印象色罗马字大名、细字汉字名、CV、VOICE 1/2/3、简介、profile 表（[shinycolors-member-1](group3/shinycolors-member-1.jpg)）。
  - 印象色用法：只用在个人页的台词色条和罗马字上，其余地方都是统一的天蓝色。
  - 动效：轮播加 lottie 小装饰，非常克制。
  - 手机端：单栏，组合 banner 竖向堆叠。
  - 声音：只有点个人页的 VOICE 按钮才播，切换时停掉上一条，没有字幕。
- 截图：[1](group3/shinycolors-1.jpg)、[2](group3/shinycolors-2.jpg)、[3](group3/shinycolors-3.jpg)、[4](group3/shinycolors-4.jpg)、[5](group3/shinycolors-5.jpg)；偶像总览 [idol-1](group3/shinycolors-idol-1.jpg)、[idol-2](group3/shinycolors-idol-2.jpg)；组合页 [unit-1](group3/shinycolors-unit-1.jpg)、[unit-2](group3/shinycolors-unit-2.jpg)；个人页 [member-1](group3/shinycolors-member-1.jpg)、[member-2](group3/shinycolors-member-2.jpg)；手机 [m1](group3/shinycolors-m1.jpg)、[m2](group3/shinycolors-m2.jpg)、[m3](group3/shinycolors-m3.jpg)。

### 2.2 学園アイドルマスター（学マス）官网（必看）
- URL：https://gakuen.idolmaster-official.jp/ ，偶像页 /idol/
- 奖项：无（官方站，必看对象）
- 技术栈：jQuery、GSAP（TweenMax）、Swiper，Three.js 只用于「パンフレット」翻页书（onebook3d），canvas-confetti，OneTrust。主视觉是一段 muted autoplay 的 mp4。
- 体积：JS 731KB，字体 779KB / 67 个文件（Google Fonts：IBM Plex Sans JP 三个字重、Poppins、Zen Antique Soft），图片 7.5MB。
- LCP 粗测：桌面约 4.4–5.6 秒，手机约 5–6.9 秒（主视觉框 frame_pc.png，853KB）。
- reduced-motion：不响应，视频照常播放。
- 拆解：
  - 排版：首屏左侧竖排手写体标语「君と出会い、夢に翔ける」（图片）。导航是汉字主标配 Poppins 副标。intro 文用 Zen Antique Soft，字距 0.3em，营造类似明朝的气氛。偶像名竖排，用 IBM Plex Sans JP 200、49px、字距 0.06em，旁边配 16px 的 Poppins 罗马字（DOM 实测 `vertical-rl`）。
  - 名单：「学園名簿」是横向证件照卡片 carousel，卡片底是每人的印象色，加汉字名和罗马字，下面有分页点。个人页是笔记本活页的样式，左边竖排台词色条，右边是 profile 表和自己紹介 1/2 语音按钮。
  - 印象色：卡片底色、台词色条。全站主色是橙色。
  - 动效：GSAP 做入场，悬停时卡片变淡。
  - 手机端：MENU 按钮，竖排标语改成横排手写字（[gakumas-m1](group3/gakumas-m1.jpg)）。
  - 声音：和シャニマス是同一套 voice.js（点击 `new Audio`，停掉上一条）。
- 截图：[1](group3/gakumas-1.jpg)、[2](group3/gakumas-2.jpg)、[3](group3/gakumas-3.jpg)、[4](group3/gakumas-4.jpg)、[5](group3/gakumas-5.jpg)、[6](group3/gakumas-6.jpg)；偶像页 [idol-1](group3/gakumas-idol-1.jpg)、[idol-2](group3/gakumas-idol-2.jpg)；手机 [m1](group3/gakumas-m1.jpg)、[m2](group3/gakumas-m2.jpg)、[m3](group3/gakumas-m3.jpg)。

### 2.3 BMSG FES'25（tote inc.）
- URL：https://bmsgfes.tokyo/2025/ 。获奖时用的是根域名，现在根域名已换成 STUDIO 搭的 '26 版，'25 版保存在 /2025/ 路径下。
- 奖项：
  - CSS Winner Site of the Day，2025-09-29（**已核实**）
  - Awwwards Honorable Mention（**已核实**，页面上没显示日期）
  - FWA 发过 Insights 文章（https://thefwa.com/article/insights-bmsg-fes25 ），因此**推断**获得过 FWA of the Day，但未核实
  - Muzli 和 OKAY DEV 收录，2025 年 9–10 月
- 技术栈：Three.js（4 个全屏 canvas）、GSAP、ScrollTrigger、LocomotiveScroll、Swiper、jQuery；Adobe Fonts（kozuka-mincho-pr6n、ivyora-display、bomboniere、timberline、bebas-neue-pro）。音频有 enter.mp3、main.mp3（BGM）、click、dive、page 等音效。
- 体积：JS 782KB，字体 1502KB / 32 个文件（单个 kozuka 子集 373KB），图片 12MB，**fetch 加载的 10 个 glb 共约 35MB**，共 583 个请求。
- LCP 粗测：桌面 28–36 秒（等 3D 资源加载完才出 ENTER），手机约 2.6 秒（手机走的是轻量版）。
- reduced-motion：不响应。
- 拆解：
  - 排版：拉丁衬线展示字 ivyora-display 和小冢明朝混排，日文大字用明朝，配负字距和 `palt`。两侧有竖排的时间码和资讯滚动条（rotate 后的横排文字）。整站黑白单色。
  - 名单：ARTIST 板块是一面倾斜的无限人像墙，行与行之间夹组合名走马灯；所有人像统一做琥珀色调色，大约 30 人看起来像同一套东西（[bmsgfes-artist-1](group3/bmsgfes-artist-1.jpg)）。
  - 代表色：不用个人色，全靠统一调色。这和我们的「一人一色」正好相反，可以作为对照组。
  - 动效：皇冠字标是 3D 物体，滚轮或拖拽绕它切换板块，按 DIVE 进入时穿过「Logo Tunnel」。
  - 手机端：同样的 3D 字标，竖向的 SWIPE 提示（[bmsgfes-m1](group3/bmsgfes-m1.jpg)）。
  - 声音：ENTER 闸门，点击即解锁音频。右下角有一个 footer-audio 波形开关。
- 截图：[1](group3/bmsgfes-1.jpg)、[2](group3/bmsgfes-2.jpg)、[3](group3/bmsgfes-3.jpg)、[4](group3/bmsgfes-4.jpg)、[5](group3/bmsgfes-5.jpg)、[6](group3/bmsgfes-6.jpg)；艺人墙 [artist-1](group3/bmsgfes-artist-1.jpg)、[artist-2](group3/bmsgfes-artist-2.jpg)；手机 [m1](group3/bmsgfes-m1.jpg)、[m2](group3/bmsgfes-m2.jpg)、[m3](group3/bmsgfes-m3.jpg)；reduced-motion [rm](group3/bmsgfes-rm.jpg)。

### 2.4 星街すいせい Official Site
- URL：https://hoshimachi-suisei.jp/
- 奖项：SANKOU!「キャラクター･バーチャルタレント」分类收录，2026-05-28（**已核实**，实装 Kaito Note）
- 技术栈：WordPress 主题，自写 main.js（打包，137KB），里面打包了 GSAP、ScrollTrigger 和 Lenis（全局变量里没有暴露，从脚本内容确认）。字体是 Google Fonts 的 Noto Sans JP，加自托管的 Avantt（woff2，约 50KB 一个字重）和 YakuHanJP。
- 体积：JS 327KB，字体 983KB / 42 个文件（Noto Sans JP 切片占大头），图片 5.4MB。
- LCP 粗测：桌面约 2.7 秒，手机约 2.7 秒（LCP 是文字元素）。这是 8 个站里最快的。
- reduced-motion：不响应（动画 9 → 9）。
- 拆解：
  - 排版：拉丁 Avantt 做超大字号标题（184–189px，负字距），YakuHanJP 把日文标点压成半宽，全站开 `palt`。日文 logo「星街すいせい」是细线条的造字。没有竖排。
  - 印象色：整个设计系统只用一种颜色：主色 #003CFF，点缀荧光黄 #F5FF14，内容区底色是灰蓝 #CDDEE5，body 底色是深藏青 #000F30（均为 getComputedStyle 实测）。这是「个人色就是品牌色」最彻底的做法。
  - 动效：字母逐个入场；MV 区块用 4 列网格加细竖线做背景。
  - 手机端：主视觉竖构图，MENU 色块在右上角，下面是资讯跑马灯（[suisei-m1](group3/suisei-m1.jpg)）。
  - 声音：无。
- 截图：[1](group3/suisei-1.jpg)、[2](group3/suisei-2.jpg)、[3](group3/suisei-3.jpg)、[4](group3/suisei-4.jpg)、[5](group3/suisei-5.jpg)、[6](group3/suisei-6.jpg)；手机 [m1](group3/suisei-m1.jpg)、[m2](group3/suisei-m2.jpg)、[m3](group3/suisei-m3.jpg)。

### 2.5 TVアニメ『あかね噺』公式サイト
- URL：https://akane-banashi.com/
- 奖项：Web Design Clip [L] 收录（**已核实**收录页 https://lp.webdesignclip.com/akane-banashi/ ，收录日期页面未显示）
- 技术栈：jQuery、GSAP、ScrollTrigger（CDN）、Lenis、Swiper；Adobe Fonts（VDL V7明朝、futura-pt、秀英明朝）；嵌入了 YouTube iframe。
- 体积：JS 1412KB（YouTube 嵌入占约 900KB），字体 **284KB / 7 个文件**（Adobe 动态子集），图片 8.5MB，「其他」12.6MB（主要是 YouTube 嵌入和视频相关请求，推断）。
- LCP 粗测：桌面约 4.1 秒，手机约 4.8 秒。
- reduced-motion：不响应。
- 拆解：
  - 竖排是这一站的核心。介绍文整段 `vertical-rl`：标语 32px、正文 24px、行高 48px、字距 0.07em。注音用 16px 括注。竖排里的、。“”被单独包成 span，用 `serif` 回退（[akane-4](group3/akane-4.jpg)）。左右两条黑边栏放竖排的「公式」「もくじ」。板块标题是竖排的寄席文字招牌（造字，图片）。
  - 名单：「登場人物」做成寄席的名牌板，十二块竖排名牌从右往左排，第一块黑底写「登場人物」作为题签（[akane-2](group3/akane-2.jpg)）。
  - 代表色：主视觉三联竖幅，每人一个底色（青、红、金）。
  - 和柄纹样（青海波、麻叶）加金箔点做装饰。这对我们是**反面参考**：装饰性的和风符号太多，会削弱深色加光的简洁感。
  - 手机端：竖排保留，按比例缩小；STAFF/CAST 改成横排列表（[akane-m2](group3/akane-m2.jpg)）。
  - 声音：无。
- 截图：[1](group3/akane-1.jpg)、[2](group3/akane-2.jpg)、[3](group3/akane-3.jpg)、[4](group3/akane-4.jpg)、[5](group3/akane-5.jpg)、[6](group3/akane-6.jpg)；手机 [m1](group3/akane-m1.jpg)、[m2](group3/akane-m2.jpg)、[m3](group3/akane-m3.jpg)；reduced-motion [rm](group3/akane-rm.jpg)。

### 2.6 Paradox Live 5th Anniversary Special Site
- URL：https://paradoxlive.jp/5thanniversary/
- 奖项：SANKOU! 收录，2025-02-20（**已核实**，制作：株式会社イロコト）
- 技术栈：GSAP、ScrollTrigger、Three.js（3 个全屏 canvas）、Lenis、Swiper、**Howler**（WebAudio）；WOVN 做 AI 翻译切换；Adobe Fonts 的 itc-avant-garde-gothic-pro 加 Google Fonts 的 Noto Sans JP。
- 体积：JS 739KB，字体 1254KB / 47 个文件，图片 8.5MB，选了声音 ON 之后音频约 3.5MB（bgm-1~9.mp3）。
- LCP 粗测：桌面约 6.5 秒，手机约 5.4 秒。
- reduced-motion：不响应。
- 拆解：
  - 闸门：第一层是声音 ON/OFF 二选一（[paralive-rm](group3/paralive-rm.jpg)，reduced-motion 下也一样），第二层是票根上的 CLICK（也可以 SKIP），然后才进主视觉。
  - 名单和代表色：主视觉按队轮播，每支队伍有自己的舞台插画、队伍 logo、BGM（推断按 bgm-N 对应各队），整页的纸屑和光色也跟着换成队色（[paralive-1](group3/paralive-1.jpg) 是金色的 BURAIKAN，[paralive-m1](group3/paralive-m1.jpg) 是绿色的 AMPRULE）。这是「组合段切换时整页换环境光」的现成例子。
  - 排版：拉丁 Avant Garde 粗体做大标题（78px，字距 0.06em），日文用 Noto Sans JP 加黑底白字标签。没有竖排；导航旋转 90° 贴在侧边。
  - 布局：三栏固定，左边 logo 固定，中间内容滚动，右边导航固定（[paralive-2](group3/paralive-2.jpg)）。
  - 手机端：单栏，上面是双人 CRT 质感特写，下面是舞台图，再下面是观众剪影。
  - 声音：常驻的 SOUND 波形开关在左上，ON 之后才播放。
- 截图：[1](group3/paralive-1.jpg)、[2](group3/paralive-2.jpg)、[3](group3/paralive-3.jpg)、[4](group3/paralive-4.jpg)、[5](group3/paralive-5.jpg)、[6](group3/paralive-6.jpg)；手机 [m1](group3/paralive-m1.jpg)、[m2](group3/paralive-m2.jpg)、[m3](group3/paralive-m3.jpg)；闸门 [rm](group3/paralive-rm.jpg)。

### 2.7 少女革命計画 GIRLS REVOLUTION PROJECT（KAMITSUBAKI STUDIO）
- URL：https://girlsrevolutionproject.jp/
- 奖项：SANKOU! 收录，2024-08-14（**已核实**，制作：.MP inc / ARKREIS）
- 技术栈：WordPress，vendor.js 里有 GSAP 和 Swiper；19 个小 canvas 做「花」的粒子装饰；Adobe Fonts（ryo-gothic-plusn、neulis-sans）。
- 体积：JS 412KB，字体 **142KB / 6 个文件**（Adobe 动态子集，每个约 24KB），图片 1.8MB，「其他」1.9MB。共 33 个请求，是 8 个站里最轻的。
- LCP 粗测：桌面约 9.3 秒（主视觉 webp，可能被入场动画推迟），手机约 5.7 秒。
- reduced-motion：不响应（94 个动画全部照跑）。
- 拆解：
  - 排版：首屏 6 个超大汉字「少女革命計画」按网格摆放，叠在立绘右侧，用 ryo-gothic 粗体，全站开 `palt`。拉丁 neulis-sans 60px 粗体，字距 -0.02em。背景是细网格加电路线条，把「秘密协议」的科幻感做了出来。
  - 名单：两个组合（深世紀、罪十罰），每组三人横排，下面是组合造字 logo 加一句定位语加 MORE（[grp-3](group3/grp-3.jpg)、[grp-4](group3/grp-4.jpg)）。
  - 代表色：组合区块分别用白底和黑底来区分；个人色只在服装上体现。
  - 声音：无。
- 截图：[1](group3/grp-1.jpg)、[2](group3/grp-2.jpg)、[3](group3/grp-3.jpg)、[4](group3/grp-4.jpg)、[5](group3/grp-5.jpg)、[6](group3/grp-6.jpg)；手机 [m1](group3/grp-m1.jpg)、[m2](group3/grp-m2.jpg)、[m3](group3/grp-m3.jpg)。

### 2.8 TVアニメ『違国日記』公式サイト
- URL：https://ikoku-anime.com/ （不带浏览器 UA 的 curl 会返回 403，Playwright 访问正常）
- 奖项：Web Design Clip [L] 收录（**已核实**收录页 https://lp.webdesignclip.com/ikoku-anime/ ，日期页面未显示，按内容推断是 2025–2026 年）
- 技术栈：GSAP、ScrollTrigger、Lenis、Swiper；Google Fonts（Zen Kaku Gothic Antique、Caudex）。
- 体积：JS 293KB，字体 **1014KB / 106 个文件**（Google 切片的反面典型），图片 2.6MB。
- LCP 粗测：桌面约 4.0 秒，手机约 4.2 秒。
- reduced-motion：不响应。
- 拆解：
  - 排版：作品名「違国日記」是竖排的明朝 logo（图片），右侧有竖排的 Caudex 英文副标。Promotion Movie 这类大标题用 Caudex 100px，字距 0.06em，带渐变色。正文居中，用 Zen Kaku Gothic，`palt`，行距很大（[ikoku-3](group3/ikoku-3.jpg)）。
  - 名单：角色名用 64px 的 Zen Kaku Gothic，字距 0.06em。
  - 动效：一根浅蓝手绘细线在各 section 间蜿蜒，把整页串起来，是这一站最好的手法（[ikoku-2](group3/ikoku-2.jpg)、[ikoku-6](group3/ikoku-6.jpg)）。
  - 手机端：单栏，细线保留。
  - 声音：无。
- 截图：[1](group3/ikoku-1.jpg)、[2](group3/ikoku-2.jpg)、[3](group3/ikoku-3.jpg)、[4](group3/ikoku-4.jpg)、[5](group3/ikoku-5.jpg)、[6](group3/ikoku-6.jpg)；手机 [m1](group3/ikoku-m1.jpg)、[m2](group3/ikoku-m2.jpg)、[m3](group3/ikoku-m3.jpg)。

### 2.9 横向对比

| 站 | JS | 字体（体积 / 文件数 / 来源） | LCP 桌面 / 手机 | reduced-motion | 声音 |
|---|---|---|---|---|---|
| シャニマス | 1041KB | 657KB / 33 / Google | 6–8s / 16.9s | 无 | 点击 VOICE 放单条 |
| 学マス | 731KB | 779KB / 67 / Google | 4.4–5.6s / 5–6.9s | 无 | 点击自己紹介放单条 |
| BMSG FES'25 | 782KB（另有 glb 35MB） | 1502KB / 32 / Adobe | 28–36s / 2.6s | 无 | ENTER 闸门，BGM 加音效 |
| 星街すいせい | 327KB | 983KB / 42 / Google 加自托管 | 2.7s / 2.7s | 无 | 无 |
| あかね噺 | 1412KB | 284KB / 7 / Adobe | 4.1s / 4.8s | 无 | 无 |
| Paradox Live 5th | 739KB | 1254KB / 47 / Adobe 加 Google | 6.5s / 5.4s | 无 | ON/OFF 闸门，Howler 播队伍 BGM |
| 少女革命計画 | 412KB | 142KB / 6 / Adobe | 9.3s / 5.7s | 无 | 无 |
| 違国日記 | 293KB | 1014KB / 106 / Google | 4.0s / 4.2s | 无 | 无 |

---

## 3. 放弃的候选和原因

| 候选 | 原因 |
|---|---|
| bmsgfes.tokyo 根域名（BMSG FES'26） | 已换成 STUDIO 搭的 '26 版，不是获奖版本，改抓 /2025/ 存档 |
| 中禅寺先生物怪講義録 chuzenji-anime.jp（A2me 推荐，竖排明朝） | 不带 UA 时返回 403。手法和あかね噺重叠（竖排、明朝、和风），时间有限，优先看了あかね噺 |
| 劇場版まどか☆マギカ〈ワルプルギスの廻天〉（Web Design Clip [L] 收录） | 电影单作站，和「名单、组合、竖排」这几个重点关系弱 |
| 『ダンダダン』5周年特設（SANKOU! 2026-05-28） | 漫画周年站，和偶像名单关系弱 |
| 花譜 寓話特設（SANKOU! 2024-12-31） | 单人歌手，和すいせい重叠 |
| STELLAR IDOL PROJECT siprj.com | 结构很接近（6 个 label 的偶像），但查不到获奖或收录 |
| プロジェクトセカイ、ラブライブ！蓮ノ空 | 组合加印象色的结构相关，但没有核实到获奖或收录，时间有限没看 |
| IZANAMI（baqemono，Awwwards SOTD 2026-07-18）、/zeroz（SHIFTBRAIN，SOTD 2026-08-24） | 获奖可靠，但属于品牌或企业站，不是角色类 |
| KPP 10th（IN FOCUS，FWA 和 CSSDA SOTD 2022） | 太旧，不在「近两年」范围内 |
| スター☆トゥインクルプリキュア（Awwwards Nominee） | 年代久，而且只是 Nominee |
