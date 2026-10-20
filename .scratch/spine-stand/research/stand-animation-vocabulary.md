# 调研：stand 动画词表的覆盖情况

对应 ticket：`.scratch/spine-stand/issues/03-stand-animation-vocabulary.md`。调研日期 2026-09-30。

来源标记（沿用 ticket 01 调研 `research/spine-web-runtime.md` 的写法）：
- **【一手·素材】**：直接读本地素材 `E:\Download\others\agent-test\shinycolors-spine\assets\spine\idols\{stand,stand_costume}\<enzaId>\data.json`（Spine 3.6.53 JSON）和 `spine_manifest.json`。
- **【实测】**：本次用脚本对全部素材统计出的数字。脚本在同目录：`analyze_stand_animations.py`（主统计）、`lip_pairs.py`（口型附件对照）。主脚本会把 2215 套 JSON 全部读进内存，跑一次约 10 分钟、峰值内存约 10 GB。
- **【粉丝】**：只出自粉丝项目（不是 Cygames/BNE 的官方代码），是推断，不是定论。
- **【Spine 文档】**：Esoteric Software 官方文档 <https://esotericsoftware.com/spine-applying-animations>。

统计范围：stand 1210 套 + stand_costume 1005 套 = **2215 套**，`skeleton.spine` 全部是 `3.6.53`【实测】。manifest 里 stand + stand_costume 共 2223 条，差的 8 条在 `spine_unavailable.log` 里（CDN 上没有）。
两位已配置角色：櫻木真乃 idolId 1，**90 套**；月岡恋鐘 idolId 4，**87 套**（按 manifest 的 idolId 过滤）。

## 结论速览

1. **分类**：2215 套里一共出现 317 个不同的动画名。按前缀和数据形态可分为：body 动作 71 个、`face_*` 65 个、`lip_*` 69 个、`arm_*` 40 个（只做 relay 过渡）、`eye_*` 8 个、点头摇头 `yes/no(2)` 4 个、脸部叠加 `cheek_red`/`tear*` 3 个、道具开关 `*_on/*_off` 33 个、`skill*` 7 个、`blank` 1 个、调试残留 16 个（`z01_body`、`aaa`、`***` 等，各只出现在 1–2 套里）。
2. **全体 100% 都有的**只有：`wait`、`wait1`、`wait2`、`wait3`、`smile1`、`surp1`、`yes`、`no`、`face_wait`、`face_close`、`blank`。`anger1`、`sad1`、`smile2`、`sad2`、`anger2` 也在 99.7% 以上。`face_smile` 80%、`face_surp` 79%、`hello`/`think` 各 59%、`lip_*` 各 75–87%。
3. **两位角色的素材是两套不同的「方言」**：真乃没有 `lip_wait`、`lip_shy`、`lip_surp`（说话用）、`lip_a`、`face_serious`，但有 `lip_trouble`；恋鐘没有 `face_surp`、`face_smile2`、`face_anger2`、`lip_anger_s`，但有 `lip_wait`、`lip_shy`、`lip_surp`、`lip_a`、`cheek_red`、`face_doya`。同一个角色的各套衣装之间几乎一致（差别主要在 `hello`：真乃 99%，恋鐘 71%）。所以**情绪→动画的映射必须每个名字都有回退链，并且按衣装实际有的动画来解析**。
4. **`lip_*` 命名**：`lip_<情绪>` = 说话时一张一合的短循环（中位 1.57 秒，只在 2 种嘴形附件之间切换）；`lip_<情绪>_s` = 同一情绪**不说话时的静态嘴形**（时长 0，只有 1 个附件关键帧），`_s2`、`_s3` 是同一情绪的其他静态嘴形。85–100% 的情况下 `_s` 的嘴形就是 `lip_<情绪>` 第 0 帧的嘴形，但不总是（例如真乃 `lip_trouble_s` 是张嘴的 `mouth_open2`）。`lip_a` **不是**说话循环：它在第 0.07–0.17 秒切到张嘴，然后**一直保持张嘴直到第 10 秒**，是「あ」的张口定格（惊呼、愣住）；`lip_i`、`lip_fa`、`lip_ha` 同理，是「い」「ふぁ」「は」的定格。
5. **循环与否**（由数据结构决定，不是由名字）：body 动作 94% 带 `loop_start` 事件（「开头播一次，之后从 `loop_start` 起循环尾段」），时长中位 9 秒、`loop_start` 中位 3.3 秒；`wait`（无编号）没有 `loop_start`，整段循环，中位 5.3 秒。`face_*` 的「有眨眼」版时长约 3.33 秒、循环眨眼；「静态」版时长 0（`face_close` 100%、`face_smile` 77%、`face_smile2` 50%）。`eye_*`、`lip_*_s`、`cheek_red` 全部时长 0，是静态姿势。`yes`/`no` 是一次性动作，1.3–2.3 秒。`arm_*` 是 0.67–0.73 秒的一次性过渡。
6. **叠加安全性**：body 动作会写全身，包括眼睛（100%）和嘴（57–100%）、头部控制骨骼；所以表情、视线、点头、口型都必须放在**比 body 高的轨道**上去覆盖它。`face_*` 与 `lip_*` 之间几乎不冲突（`face_smile`×`lip_smile` 0/1530 套有重叠，`face_wait`×`lip_wait` 15/1887）；`face_*` 与 `eye_*` 96% 冲突（都写 `eyes` 骨骼），所以视线轨道要高于表情轨道；`yes/no` 只写头部控制骨骼，与表情不冲突（0%），但会覆盖 body 的头部动作，而且**最后一帧不回零**，播完要清掉。沿用游戏 ADV 的轨道编号（0 body / 1 face / 2 yes·no / 3 eye / 4 脸红等叠加 / 5 lip）是安全的。
7. **回退**：凡是「缺 A」的衣装，本次统计的回退候选几乎都 100% 存在：`think`→`think1`/`think2`→（`wait4` + `face_serious`/`face_close`）；`hello`→`smile2`；`smile3`→`smile2`；`face_smile`→`face_smile1`/`face_smile2`；`face_surp`→`blank`（交还给 `surp1` 自带的表情）或 `face_wait`；`face_anger`→`face_anger1`/`face_anger2`；`lip_<情绪>`→`lip_smile`→`lip_wait`；`lip_<情绪>_s`→「冻结 `lip_<情绪>` 第 0 帧」。唯一没有好替代的是 `face_shy`（缺它的 70 套里只有 6 套有 `face_shy2`/`face_smile`）和 fear / jito（全体只有 11–12%，两位角色都是 0%）。

---

## 1. 动画名的分类【实测】

分类规则见 `analyze_stand_animations.py` 的 `category()`。括号里是出现的套数（满分 2215）。

| 类别 | 名字数 | 最常见的名字 | 数据形态 |
|---|---|---|---|
| body 动作 | 71 | `wait` `wait1` `wait2` `wait3` `smile1` `surp1`(2215)、`anger1` `sad1`(2214)、`smile2`(2213)、`sad2`(2210)、`anger2`(2208)、`wait4`(2134)、`surp2`(2051)、`touch`(1977)、`shy1`(1958)、`shy2`(1703)、`hello`(1314)、`think`(1311)、`smile3`(1011)、`anger3`(570)、`wait5`(485)、`surp3`(445)、`sleep`(399)、`smile4`(311)、`wink`(253)、`think1`(211)、`shy3`(179)、`think2`(129) …… 另有 `hero` `decide` `pain` `play` `shrug` `serious` `why` `sigh` `idol` 等各 70–90 套 | 写全身（身体、手臂、头发、头、眼、嘴）；94% 带 `loop_start`，多数带 `relay` |
| `face_*` 表情 | 65 | `face_wait` `face_close`(2215)、`face_sad`(2167)、`face_shy`(2145)、`face_close2`(2123)、`face_serious`(2057)、`face_cry`(1781)、`face_smile`(1773)、`face_surp`(1751)、`face_anger`(1716)、`face_anger2`(1294)、`face_smile2`(1185)、`face_close3–8`、`face_anger1`(499)、`face_smile1`(442)、`face_shy2`(408)、`face_tear`(284)、`face_fear`(261)、`face_jito`(250)、`face_down`(231) …… | 写眼、眉、脸颊、`head2`；不写手臂、不写 drawOrder |
| `lip_*` 口型 | 69 | `lip_anger`(1922)、`lip_wait`(1887)、`lip_surp`(1835)、`lip_smile`(1826)、`lip_anger_s`(1825)、`lip_smile_s`(1761)、`lip_sad`(1747)、`lip_a`(1747)、`lip_shy`(1661)、`lip_sad_s`(1606)、`lip_wait_s`(1574)、`lip_surp_s`(1093)、`lip_shy_s`(1062) …… | 只写嘴的插槽和骨骼（100%），8% 顺带写一个痣之类的小骨骼（如 `mole`） |
| `arm_*` 过渡 | 40 | `arm_down`(1820)、`arm_down_R`(1565)、`arm_down_L`(1522)、`arm_down_L2`(694)、`arm_down_R2`(660)、`arm_down2`(607) …… | 0.67–0.73 秒一次性，把手臂放回垂下；是 body 动作 `relay` 事件指向的目标，不单独当表情用 |
| `eye_*` 视线 | 8 | `eye_front` `eye_right`(2127)、`eye_left`(2039)、`eye_off/on`(81)、`eye_right2`(13)、`eye_red_on/off`(4) | 时长 0；只写 `eyes`/`eye_L`/`eye_R` 骨骼的位移 |
| 点头摇头 | 4 | `yes` `no`(2215)、`yes2` `no2`(90) | 一次性，只写头部控制骨骼（真乃是 `face_control`） |
| 脸部叠加 | 3 | `cheek_red`(173)、`tear_L`(2)、`tear`(1) | 时长 0，显示脸红/泪滴附件 |
| 道具开关 | 33 | `mask_on/off/take`(81)、`hi_on/off`(71)、`on/off`(37/43)、`bag_*` `hat_*` `apron_*` …… | 切换道具附件；只在特定衣装里有 |
| `skill*` | 7 | `skill1`(2205)、`skill2` `skill3`(1306) | 一次性全身动作，2–3 秒 |
| `blank` | 1 | `blank`(2215) | 没有任何时间轴（1 套例外有时长），等价于 Spine 的空动画 |
| 调试残留 | 16 | `z01_body` `z02_arm` …… `CM` `aaa` `***` `su` `to` | 各 1–2 套，不用 |

**事件**【实测】：全部素材里只出现 4 种事件名：`loop_start`（40305 次）、`relay`（19437 次，`string` 是要先播的 `arm_*` 名）、`lip`（48 次，只出现在八宮めぐる、田中摩美々的 7 套里，如 `stand/1040030010`、`stand/1030050010`；都在 `time 0`，没有字符串，含义不明，可忽略；真乃、恋鐘没有）、`arm_down_L`（1 次，疑似误用）。

**粉丝项目怎么分**【粉丝】（详见第 7 节）：游戏剧本本身就是按轨道分类的——`charAnim1` 放 body、`charAnim2` 放 `face_*`/`blank`、`charAnim3` 放 `yes/no`、`charAnim4` 放 `eye_*`、`charAnim5` 放道具开关与 `cheek_red`、`charLipAnim` 放 `lip_*`。这和上表的分法一致。sc-viewer-v2 从全部剧本里收集的取值表（`src/helper/vals.ts`）也印证了这一点：`charAnim1` 里全是 body 名，`charAnim2` 几乎全是 `face_*`，`charAnim4` 是 `eye_*` 和道具，`charAnim5` 是道具与 `cheek_red`。

## 2. 候选情绪：动画与覆盖率【实测】

下表的「覆盖率」= 至少有该候选之一的衣装比例。「推荐」列是按覆盖率和回退链排出的第一选择。完整数字见脚本输出的「情绪覆盖率」一节。

### 2.1 七种主要情绪

| 情绪 | body（track 0） | face（track 1） | lip 说话（track 5） | lip 静态 `_s` | 全体 / 真乃 / 恋鐘 |
|---|---|---|---|---|---|
| 平静 | **`wait`** 100%（变化用 `wait1–4`，`wait4` 96%） | **`face_wait`** 100%（或 `blank`，用 body 自带的脸） | **`lip_wait`** 85% / 0% / 100% → 真乃用 `lip_smile` | `lip_wait_s` 71% / 0% / 100% → 真乃用 `lip_smile_s` | 三者齐 94% / 100%\* / 100% |
| 开心 | **`smile1`** 100%，`smile2` 100%，`smile3` 46%，`smile4` 14% | **`face_smile`** 80% / 100% / 100%；`face_smile2` 53% / 100% / 0%；`face_smile1` 20%；`face_joy` 8% | **`lip_smile`** 82% / 100% / 100% | `lip_smile_s` 80% / 100% / 100% | 92% / 100% / 100% |
| 害羞 | **`shy1`** 88% / 99% / 100%，`shy2` 77% | **`face_shy`** 97% / 99% / 100%；恋鐘另有 `cheek_red` 99%（叠加脸红） | **`lip_shy`** 75% / **0%** / 100% → 真乃用 `lip_smile` | `lip_shy_s` 48% / 0% / 0% → `lip_smile_s` | 64% / 0%\* / 100% |
| 惊讶 | **`surp1`** 100%，`surp2` 93% | **`face_surp`** 79% / 100% / **1%** → 恋鐘用 `blank` | **`lip_surp`** 83% / **0%** / 100%；张口定格 `lip_a` 79% / 0% / 99% | `lip_surp_s` 49% / 99% / 100% | 73% / 0%\* / 1%\* |
| 难过 | **`sad1`** 100%，`sad2` 100% | **`face_sad`** 98% / 100% / 100%；更重的 `face_cry` 80% / 100% / 100% | **`lip_sad`** 79% / 100% / 100% | `lip_sad_s` 73% / 100% / 100% | 77% / 100% / 99% |
| 生气 | **`anger1`** 100%，`anger2` 100% | **`face_anger`** 77% / 100% / 100%；`face_anger2` 58% / 99% / 0%；`face_anger1` 23% | **`lip_anger`** 87% / 100% / 100% | `lip_anger_s` 82% / 100% / **1%** → 恋鐘冻结 `lip_anger` 第 0 帧 | 100% / 100% / 100% |
| 思考 | **`think`** 59% / 100% / 100%；`think1` 10%，`think2` 6% | **`face_serious`** 93% / **0%** / 99%；`face_close`（闭眼）100% | `lip_serious` 仅 16% → 用 `lip_wait` / `lip_smile` | `lip_serious_s` 18% → `lip_wait_s` | 65% / 100% / 100% |

\* 「三者齐」按脚本里各情绪的候选集合计算（见 `EMOTIONS`），不含跨情绪回退。真乃「害羞」「惊讶」为 0% 只是因为她没有 `lip_shy`/`lip_surp`，套用回退（`lip_smile`）后都是 100%；恋鐘「惊讶」为 1% 只是因为没有 `face_surp`，改用 `blank` 后是 100%。

### 2.2 素材暗示的其他情绪

| 情绪 | 动画 | 全体覆盖 | 真乃 / 恋鐘 | 建议 |
|---|---|---|---|---|
| 困扰（trouble） | `face_trouble` 4%、`lip_trouble` 8%（`lip_trouble_s` 4%） | 低 | 真乃有 `lip_trouble`/`lip_trouble_s`（100%），没有 `face_trouble`；恋鐘都没有 | 不单列情绪；并入「难过」或「思考」，真乃说话时可以用 `lip_trouble` 当「为难」的口型 |
| 害怕（fear） | `face_fear` 12%、`face_fear2` 4%、`lip_fear` 12%、body `fear` 仅 2 套 | 低 | 0% / 0% | 不单列；映射到「惊讶」（`surp*` + `face_surp`）或「难过」 |
| 白眼·ジト目（jito） | `face_jito` 11%、`face_jito2` 4%、`lip_jito`(+`_s`) 7% | 低 | 0% / 0% | 不单列；最接近的是 `face_serious` 或 `face_anger` |
| 含泪（tear） | `face_tear` 13%、`face_tear1/2` 3%、`lip_tear`(+`_s`) 4%；`face_cry` 80% | `face_cry` 高 | `face_cry` 100% / 100%；`face_tear` 0% / 0% | 用 `face_cry` 作为「难过」的加重档，不单独做情绪 |
| 其他少见的 | `face_doya`（得意，4%，恋鐘 100%）、`face_joy` 8%、`face_excite` 3%、`face_panic` 4%、`face_awkward` 4%、`face_bitter_smile` 4%、`face_bad` 7%、`face_down` 10% | 低 | — | 不进词表；若要做角色专属点缀（如恋鐘的得意脸），在映射里按衣装有无再加 |

### 2.3 两位角色的完整词表【实测】

**櫻木真乃（90 套）**，90 套都有的：`anger1 anger2 sad1 smile1 smile2 surp1 think wait wait1–4 yes yes2 no no2 blank`、`arm_down arm_down_R`、`eye_front eye_left eye_right`、`face_anger face_close face_close2 face_cry face_sad face_smile face_smile2 face_smile3 face_surp face_wait`、`lip_anger lip_anger_s lip_sad lip_sad_s lip_smile lip_smile_s lip_trouble lip_trouble_s`。89 套有的：`anger3 sad2 shy1 shy2 smile3 surp2 hello touch skill1 arm_down_surp arm_up_R face_anger2 face_shy lip_anger2 lip_anger_s2 lip_sad_s2 lip_smile2 lip_smile_s2 lip_smile_s3 lip_surp_s`。`wait_return_L/R` 78 套。
**真乃没有**：`lip_wait`、`lip_wait_s`、`lip_shy`、`lip_shy_s`、`lip_surp`、`lip_a`、`face_serious`、`cheek_red`、`face_tear`/`fear`/`jito`/`trouble`。唯一明显的例外衣装是 `stand/3000010580`【こころ、みちびく。ゆかし夜】，缺 `hello` 和 `smile3`。

**月岡恋鐘（87 套）**，87 套都有的：`anger1 shy1 smile1 smile2 surp1 think wait wait1–5 yes no blank`、`arm_down arm_down_L arm_down_R arm_shy1`、`eye_front eye_left eye_right`、`face_anger face_close face_close2 face_cry face_doya face_sad face_shy face_smile face_wait`、`lip_anger lip_sad lip_sad_s lip_shy lip_smile lip_smile_s lip_surp lip_surp_s lip_wait lip_wait_s`。86 套有的：`anger2 sad1 sad2 shy2 smile3 smile4 surp2 touch skill1 cheek_red face_serious lip_a`。`hello` 62 套（缺它的主要是早期 P_SR/P_SSR 和 `3000040010–060` 几套 Special）。
**恋鐘没有**：`face_surp`（仅 1 套）、`face_smile2`、`face_anger2`、`lip_anger_s`（仅 1 套）、`lip_shy_s`、`lip_trouble`、`yes2/no2`、`think1/2`。

逐套缺失清单见脚本输出的「缺少常用动画的衣装」一节。

## 3. `lip_*` 的命名规律【一手·素材 + 实测】

以真乃 `stand/1040010010`、恋鐘 `stand/1040040010` 为例（`lip_pairs.py` 的全体统计在后）：

| 名字 | 口型插槽的附件关键帧 | 含义 |
|---|---|---|
| 真乃 `lip_smile` | `mouse`(0) → `mouth_open`(0.13) → `mouse`(0.40) → …（9 个关键帧，1.5 秒） | 说话循环：闭 / 开交替，同时缩放嘴骨骼 |
| 真乃 `lip_smile_s` | `mouse`(0)，仅 1 帧 | 静态：笑着闭嘴 |
| 真乃 `lip_smile_s2` / `_s3` | `mouth_open` / `mouth_close4` | 另外两种笑的静态嘴形（张嘴笑、另一种闭嘴） |
| 真乃 `lip_sad` / `lip_sad_s` / `lip_sad_s2` | `mouth_close3`↔`mouth_sad3` / `mouth_sad` / `mouth_sad2` | `_s` 不一定等于说话循环的第 0 帧 |
| 真乃 `lip_trouble_s` | `mouth_open2` | 静态，但是张着嘴 |
| 真乃 `lip_surp_s` | `mouth_sup` | 惊讶「O」形嘴，静态；真乃没有 `lip_surp` |
| 恋鐘 `lip_smile` / `lip_wait` / `lip_shy` | `mouth_close`↔`mouth_open2` / `mouth_close`↔`mouth_open` / 同 `lip_wait` | 说话循环，每个只在两种附件间切换 |
| 恋鐘 `lip_sad` / `lip_anger` / `lip_surp` | 都是 `mouth_close2`↔`mouth_open3` | 名字不同，嘴形完全一样 |
| 恋鐘 `lip_a` | `mouth_close2`(0) → `mouth_open3`(0.17)，之后没有关键帧，时长 10 秒 | 张口定格 |

全体统计【实测】：

- **`_s` 的形态**：所有 `lip_*_s*` 时长都是 0、只有 1 个附件关键帧（`lip_smile_s` 1761 套、`lip_anger_s` 1825 套…… 时长 0 的比例 100%）。
- **`_s` 与说话版的关系**（两者都有的衣装里，`_s` 的附件 = 说话版第 0 帧附件的比例）：`lip_surp` 100%、`lip_shy` 92%、`lip_wait` 90%、`lip_sad` 89%、`lip_smile` 85%、`lip_anger` 77%、`lip_serious` 51%、`lip_trouble` 1%；少见的 `jito/bad/tear/angry/awkward/bitter_smile` 都是 100%。
- **成对率**：有 `lip_X` 的衣装里同时有 `lip_X_s` 的比例——`smile` 88%、`sad` 87%、`wait` 83%、`anger` 83%、`shy` 64%、`surp` 55%、`trouble` 51%、`serious` 48%。所以不能假设 `_s` 一定存在。
- **说话版**：`lip_wait/smile/shy/surp/sad/anger` 时长中位 1.57–1.67 秒（最短 0.83，最长 `lip_surp` 7.47），中位只用 2 种嘴形附件，交替时同时缩放嘴骨骼。**没有元音区分，也不看音量**。
- **定格类**：`lip_a` 1747 套，时长 10 秒（最短 6.67），嘴形附件关键帧中位 2（闭 → 开，然后保持）；`lip_a2` 149 套同理；`lip_i`（62 套，6.67 秒）、`lip_ha`（87 套）、`lip_fa`（74 套，3 秒）同理。`lip_fear`、`lip_joy`、`lip_cry` 反而是普通的说话循环（关键帧中位 7）。

**结论**：
- `lip_<情绪>`：该情绪下**说话**时的一开一合循环（loop=true 播放）。
- `lip_<情绪>_s`、`_s2`、`_s3`：该情绪下**不说话**时的静态嘴形（`s` 应是 static/silent 的缩写，这一点是推断；ticket 01 调研对 150 个剧本的统计也显示：有语音时用非 `_s` 3257 次，无语音时用 `_s` 994 次）。
- `lip_a`（及 `lip_a2`、`lip_i`、`lip_ha`、`lip_fa`）：发某个音时的**张口定格**，不是循环。ShinyColorsPet 把 `lip_a` 当「张嘴」姿势，用实时音量设 `TrackEntry.alpha` 来做音量驱动的口型【粉丝】——这正好利用了它「打开后一直保持」的形态。真乃没有 `lip_a`（0/90），恋鐘有（86/87）；音量驱动方案需要为真乃另找张嘴姿势（例如 `lip_smile_s2` = `mouth_open`，或 `lip_trouble_s` = `mouth_open2`），这属于 ticket 07 的事。
- 命名不统一的地方：同一情绪有数字后缀的变体（`lip_anger1`/`lip_anger2`、`lip_smile1`/`lip_smile2`）；`_s` 与数字的顺序两种都有（`lip_anger_s2` 416 套 vs `lip_anger2_s` 222 套）；`lip_angry` 与 `lip_anger` 并存（88 套）；不同名字可能是同一对嘴形（恋鐘的 sad/anger/surp）。

## 4. 循环、一次性与时长【一手·素材 + 实测】

时长 = 动画里所有关键帧 `time` 的最大值（Spine 3.6 `SkeletonJson` 就是这样算 `animation.duration` 的）。表内为全体中位数 [最小–最大]，单位秒。

| 动画 | 套数 | 时长 | `loop_start` | `relay` 目标（最常见） | 性质 |
|---|---|---|---|---|---|
| `wait` | 2215 | 5.33 [3.33–10.67] | 无 | 无 | 整段循环 |
| `wait1`–`wait4` | 2134–2215 | 8.7–9.0 | 几乎都有，中位 3.33 | 少数（`arm_shy1`、`arm_down_L2` 等） | 开头一次 + 尾段循环 |
| `smile1` | 2215 | 8.67 [4.00–14.50] | 中位 3.67 | `arm_down`、`arm_down_L`、`arm_down_R` | 同上 |
| `smile2` / `smile3` | 2213 / 1011 | 8.67 / 7.60 | 3.50 / 3.33 | 多种 `arm_down*` | 同上 |
| `shy1` / `shy2` | 1958 / 1703 | 9.33 / 9.43 | 4.17 / 4.00 | 同上 | 同上 |
| `surp1` / `surp2` | 2215 / 2051 | 9.67 [5.67–32.57] / 8.67 | 3.83 / 3.33 | 同上 | 同上 |
| `sad1` / `sad2` | 2214 / 2210 | 10.00 / 9.30 | 4.73 / 3.97 | 同上 | 同上 |
| `anger1` / `anger2` | 2214 / 2208 | 9.60 / 9.07 | 3.67 / 3.33 | 同上 | 同上 |
| `think` | 1311 | 9.17 [6.47–11.53] | 3.33 | `arm_down_L`、`arm_down_R`、`arm_down_L1` | 同上 |
| `hello` | 1314 | 10.17 [6.67–84.77] | 4.17 | `arm_down_L3`、`arm_down_R3`、`arm_up` | 同上（个别衣装长达 85 秒） |
| `touch` | 1977 | 9.80 | 3.33 | `arm_down` | 同上 |
| `arm_*` | 8866 个实例 | 中位 0.73 | 无 | — | 一次性过渡 |
| `yes` / `no` | 2215 | 1.33 / 2.33（个别 13.33） | 无 | 无 | 一次性 |
| `face_wait` | 2215 | 3.33 [2.00–5.00] | 无 | 无 | 循环（带眨眼） |
| `face_shy/surp/sad/anger/serious` | — | 约 3.33 [2.00–5.00] | 无 | 无 | 循环（带眨眼），时长 >0 的比例 100% |
| `face_cry` | 1781 | 3.67 | 无 | 无 | 循环 |
| `face_smile` | 1773 | 0（77% 为 0，其余最长 5） | 无 | 无 | 多数是静态（不眨眼的笑眼） |
| `face_smile2` | 1185 | 0（50% 为 0） | 无 | 无 | 一半静态 |
| `face_close` | 2215 | 0（2213 套为 0） | 无 | 无 | 静态（闭眼） |
| `eye_front/left/right` | 2039–2127 | 0 | 无 | 无 | 静态姿势 |
| `lip_<情绪>` | 1661–1922 | 约 1.57 | 无 | 无 | 说话时循环 |
| `lip_<情绪>_s` | 1062–1825 | 0 | 无 | 无 | 静态 |
| `lip_a` | 1747 | 10.00 | 无 | 无 | 张口定格 |
| `cheek_red` | 173 | 0 | 无 | 无 | 静态叠加 |
| `blank` | 2215 | 0 | 无 | 无 | 空 |

按类别汇总：body 实例 94% 带 `loop_start`、0% 时长为 0、时长中位 9.00 秒；`face_*` 32% 时长为 0、中位 3.33 秒；`lip_*` 41% 时长为 0、中位 1.33 秒；`eye_*` 100% 时长为 0；`arm_*` 0% 带 `loop_start`、中位 0.73 秒。

**怎么播**（ticket 01 调研第 2.3 节已从 EventViewer `scripts/SpineManager.js` 读出，这里只列与词表有关的结论）【粉丝】：

- 带 `loop_start` 的：`setAnimation(track, name, false)`，在 `complete` 回调里重新 `setAnimation` 同一个动画、把 `trackTime` 设到 `loop_start`。开头的「情绪动作」只做一次，之后停在该情绪的尾段姿势里循环，**不会自己回到 `wait`**。
- 不带 `loop_start` 的 body（`wait`）、`face_*`、`lip_<情绪>`：`loop = true`。
- 时长 0 的（`eye_*`、`lip_*_s`、静态 `face_*`、`cheek_red`）：loop 真假都一样，会一直保持这个姿势直到被替换。
- `yes`/`no`：游戏剧本里一律 `charAnim3Loop: false`。
- 离开一个带 `relay` 事件的动画时，先播 `relay` 指定的 `arm_*`，再接新动画，mix 都是 0.3 秒。

## 5. 各类动画影响哪些骨骼/插槽，能否叠加【实测 + Spine 文档】

规则【Spine 文档】：各轨道按编号从低到高依次 apply，「an animation that does not key everything can be played on a higher track, overriding the lower track only for what is keyed」；要让一条轨道平滑退出，用 `setEmptyAnimation(track, mixDuration)`。本地的 `blank` 在数据上就是这个空动画。

**每类写入的部位**（每个实例写到该部位的比例；部位按骨骼/插槽名粗分，见脚本 `region()`）：

| 类别 | 写入的部位 |
|---|---|
| body（42412 个实例） | 身体 100%、手臂 100%、眼/眉 100%、脸/头 100%、头发/饰品 100%、嘴 91%、drawOrder 48% |
| `face_*`（30147） | 眼/眉 100%、脸/头 98%（`head2`、脸颊等）、其他 87%、嘴区 59%、头发 3%；手臂 0%、drawOrder 0% |
| `eye_*`（6476） | 只有眼（`eyes`、`eye_L`、`eye_R` 骨骼的 translate） |
| `lip_*`（30425） | 嘴 100%；8% 另写一个小骨骼（如 `mole` 痣） |
| `yes`/`no`（4610） | 头部控制骨骼 100%（如真乃的 `face_control` translate），其余 ≤4% |
| `arm_*`（8866） | 手臂 100%、身体 100%、脸/头 86%、头发 80%、drawOrder 79% |
| `cheek_red` 等（176） | 脸 99% |

**两两重叠**（两者都存在的衣装里，有共同写入属性的比例）：

| 组合 | 重叠 | 重叠在哪 | 结论 |
|---|---|---|---|
| `wait` × `face_wait` / `face_smile` | 100% | 眼/眉，约一半还有嘴、脸 | body 自带表情；face 必须在 body 之上，覆盖它 |
| `smile1` × `lip_smile` | 100% | 嘴（body 里有自己的开口关键帧，如真乃 `smile1` 在 0.4/1.37/2.57… 秒切 `mouth_open`） | lip 必须在 body 之上 |
| `wait` × `lip_wait` | 23% | 嘴 | 同上 |
| `face_smile` × `lip_smile` | **0/1530** | — | face 与 lip 互不干扰 |
| `face_wait` × `lip_wait` | 15/1887 | 嘴 | 基本不干扰；lip 在更高轨道即可 |
| `face_wait` × `eye_left` | **96%** | 眼（`eyes` 骨骼） | 视线轨道必须**高于**表情轨道 |
| `wait` × `eye_left` | 56% | 眼 | 视线轨道高于 body |
| `think` × `eye_left` | 70% | 眼 | 同上（`think` 自带视线移动，叠 `eye_*` 会把它压住） |
| `wait` / `smile1` / `hello` × `yes` | 84% / 100% / 100% | 头部控制骨骼 | 点头在 body 之上，会暂时盖住 body 的头部动作 |
| `face_smile` × `yes` | 0% | — | 点头与表情互不干扰 |
| `face_smile` × `cheek_red` | 41%（全在恋鐘这类衣装） | 脸颊 | 脸红放在表情之上 |

**结论：沿用游戏的轨道编号是安全的**：

| track | 放什么 | 为什么 |
|---|---|---|
| 0 | body（`wait*`、情绪动作、`hello`、`think`，以及 relay 用的 `arm_*`） | 写全身、带 drawOrder，只能放最底层；同一轨道换动作靠 mix 0.3 秒 + relay |
| 1 | `face_*` 或 `blank` | 盖住 body 自带的眼和脸；不写手臂和 drawOrder，不会和 body 打架 |
| 2 | `yes` / `no`（loop=false），完了放 `blank` | 只写头部控制骨骼；与 face、lip 都不重叠 |
| 3 | `eye_*` 或 `blank` | 与 face 96% 重叠，必须在 face 之上 |
| 4 | `cheek_red` 等叠加 | 与 face 的脸颊重叠，放在 face 之上 |
| 5 | `lip_*` | 只写嘴；在最上层，盖住 body 的嘴 |

需要注意的几点：

1. **`yes`/`no` 的最后一帧不是零位**：例如真乃 `1030010010` 的 `yes` 结束在 `face_control` x=34。Spine 里不循环的动画播完后，这条轨道会停在最后一帧继续覆盖，直到被替换或清空【Spine 文档：动画会一直播到另一个动画开始或轨道被清空】。所以点头播完要 `setEmptyAnimation(2, 0.2~0.3)` 或放 `blank`，把头部交还给 body。
2. **静态表情会让眨眼停掉**：body 里的眨眼（写眼睑插槽）会被 track 1 覆盖。`face_wait`/`face_shy`/`face_sad` 等自带 3.33 秒的眨眼循环，没问题；但 `face_smile`（77% 静态）、`face_close`（静态闭眼）期间不会眨眼——这是游戏里的原样表现（笑眼、闭眼本来就不眨），可以接受，但不要把静态表情当「平静」长时间挂着。
3. **视线会压住 body 自带的眼部动作**：`think`、`wait` 等本身有眼球移动。只在需要「看向用户」的时候放 `eye_front`，不需要时放 `blank` 交还。
4. **不要把 body 动作叠在 body 之上**：body 实例 48% 带 drawOrder、手臂附件切换；ShinyColorsPet 的 ADR 记录了把全身手势叠在待机上层会清掉抬手附件的问题【粉丝】。情绪动作一律在 track 0 上直接替换。
5. **缺了 face 时的「交还」**：track 1 放 `blank`，脸就回到 body 动作自带的表情。`surp1`、`sad1` 等情绪动作本身就带与动作匹配的表情（它们 100% 写眼、91% 写嘴），所以缺 `face_surp` 的衣装用 `blank` 是最自然的回退。

## 6. 缺失时的替代【实测】

「缺 A」的衣装里各候选存在的比例：

| 缺的动画 | 缺的套数 | 候选（存在比例） | 任一可替代 |
|---|---|---|---|
| `think` | 904 | `think1` 23%、`think2` 14%、`face_serious` 93%、`face_close` 100%、`wait4` 91% | 904/904 |
| `hello` | 901 | `smile2` 100%、`smile1` 100%、`wait1` 100% | 901/901 |
| `smile3` | 1204 | `smile2` 100%、`smile1` 100% | 1204/1204 |
| `face_smile` | 442 | `face_smile1` 100%、`face_smile2` 99%、`face_close` 100% | 442/442 |
| `face_smile2` | 1030 | `face_smile` 100% | 1030/1030 |
| `face_surp` | 464 | `face_surp2` 0%、`face_wait` 100%（更好的是 `blank`，用 `surp*` 自带的脸） | 464/464 |
| `face_cry` | 434 | `face_sad` 89%、`face_tear` 10% | 386/434 |
| `face_serious` | 158 | `face_wait` 100% | 158/158 |
| `face_shy` | 70 | `face_shy2` 3%、`face_smile` 9% | **6/70** → 退到 `blank`（`shy*` 自带的脸） |
| `face_anger` | 499 | `face_anger1` 100%、`face_anger2` 100% | 499/499 |
| `lip_smile` | 389 | `lip_smile1` 56%、`lip_smile2` 38%、`lip_wait` 66% | 389/389 |
| `lip_wait` | 328 | `lip_smile` 60%、`lip_a` 49% | 258/328 |
| `lip_shy` | 554 | `lip_smile` 73%、`lip_wait` 70% | 492/554 |
| `lip_surp` | 380 | `lip_surp_s` 23%、`lip_a` 63%、`lip_wait` 60% | 379/380 |
| `lip_sad` | 468 | `lip_sad2` 0%、`lip_wait` 87% | 406/468 |
| `lip_anger` | 293 | `lip_anger1` 100%、`lip_anger2` 100% | 293/293 |
| `lip_smile_s` | 454 | `lip_smile_s2` 0%、`lip_wait_s` 86% | 392/454 |
| `eye_left` | 176 | `eye_right` 50%、`eye_front` 50% | 88/176（另 88 套三个 `eye_*` 都没有 → 不做视线） |

**建议的回退策略**（给 spec 参考，不是拍板）：

1. **按衣装解析，不按角色写死**：加载骨架后拿到动画名集合，对每个「槽位」（body / face / lip 说话 / lip 静态 / 视线 / 点头）按回退链取第一个存在的名字。
2. **body**：`<情绪>1` → `<情绪>2` → `<情绪>3`（思考：`think` → `think1` → `think2` → `wait4` → `wait`）；`hello` → `smile2` → `smile1`。`wait`、`smile1`、`surp1`、`sad1`、`anger1` 在 2215 套里都有（`anger1`/`sad1` 各缺 1 套），作为最后兜底安全。
3. **face**：`face_<情绪>` → 同名带数字的变体（`face_smile1`/`face_smile2`、`face_anger1`/`face_anger2`）→ `blank`（交还给 body 动作自带的表情）。**不要退到 `face_wait`**，除非 body 也是 `wait*`——否则会出现「身体在惊讶、脸在发呆」。
4. **lip 说话**：`lip_<情绪>` → `lip_<情绪>1/2` → `lip_smile` → `lip_wait` → 任何一个时长 >0 的 `lip_*`。说话口型之间只有嘴形差别，退到别的情绪影响很小。
5. **lip 静态**：`lip_<情绪>_s` → 「把 `lip_<情绪>` 冻结在第 0 帧」（游戏自己就是这样停嘴的，85–100% 的情况下嘴形与 `_s` 相同）→ `lip_wait_s` / `lip_smile_s`。
6. **词表收敛**：七种情绪（平静、开心、害羞、惊讶、难过、生气、思考）都能在两位角色的全部衣装上落地；fear / jito / trouble / tear 覆盖率太低（两位角色 0%，`lip_trouble` 除外），不建议进情绪词表，最多作为「难过」「惊讶」的加重档（`face_cry` 可以当「难过·强」，两位角色 100%）。

## 7. 粉丝项目给动画名的归类

| 项目 | 地址（本次读的 commit） | 许可证 | 怎么归类 |
|---|---|---|---|
| ShinyColorsDB-EventViewer | <https://github.com/ShinyColorsDB/ShinyColorsDB-EventViewer>（`ba51fdd`，`scripts/SpineManager.js`） | **无 LICENSE**（只能参考思路，不能拷代码） | 不按名字分类，按剧本字段分轨：`charAnim1–5` → track 0–4，`charLipAnim` → track 5；处理 `loop_start`、`relay`、`lip` 三种事件名；换动画 mix 0.3 秒 |
| sc-viewer-v2 | <https://github.com/darwintree/sc-viewer-v2>（`9be7b10`，`src/helper/vals.ts`） | MIT | 从全部剧本里收集的各字段取值：`charAnim1` 全是 body 名（`wait*` `smile*` `sad*` `think*` `hello` `touch` `shrug` `sleep*` `hero*` 等）；`charAnim2` 是 `face_*`/`blank`（偶有 `lip_*`、`wait`、`smile1` 等，应是剧本笔误）；`charAnim3` 是 `yes`/`no`/`eye_*`/道具；`charAnim4` 是 `eye_*`、道具、`tear_L`、`cheek_red`；`charAnim5` 是道具开关与 `cheek_red`；`charLipAnim` 是 `lip_*`（也收录了 `lip_a`、`lip_ha`、`lip_fa`、各种 `_s`）。与本文第 1 节的分类一致 |
| ShinyColorsPet | <https://github.com/jerygood870208/ShinyColorsPet>（`643e42d`，`shiny_pet/models/semantic_animations.py`、`shiny_pet/renderer/semantic_drivers.js`） | GPL-3.0 | 语义分组：动作 happy→`smile1–4`、sad→`sad1–2`、angry→`anger1–3`、surprised→`surp1–2`、shy→`shy1–3`、thinking→`think`、agree→`yes/yes2`、disagree→`no/no2`、sleepy→`sleep1–3`，idle = 所有 `wait*`，click→`touch`，greeting→`hello`；表情 neutral→`face_wait`、happy→`face_smile/1/2/3`、sad→`face_sad/2`、angry→`face_anger/2/3`、surprised→`face_surp/2`、shy→`face_shy/2`、crying→`face_cry`、serious→`face_serious`，其余 `face_*` 去掉前缀原样暴露；视线要求 `eye_left/front/right` 三个都在才启用；口型用 `lip_a` 按音量设 alpha。每组都先按骨架实际有的名字过滤。与本文第 2 节的候选基本一致，区别是它不处理 `lip_<情绪>` 和 `_s`，思考只认 `think`（本地统计里有 41% 的衣装没有 `think`） |
| ShinyColorsDB-SpineViewer | <https://github.com/ShinyColorsDB/ShinyColorsDB-SpineViewer>（`b746641`，`src/composables/useSpineRuntime.ts`） | **无 LICENSE** | 不分类：每个动画按在骨架里的序号各占一条轨道，勾选即 `setAnimation(index, name, true)`。只是浏览器，不代表游戏的播放方式 |
| sc-story-editor、SCWriting | <https://github.com/darwintree/sc-story-editor>（无 LICENSE）、<https://github.com/percolated/SCWriting>（MIT） | 见左 | 剧本编辑工具，沿用游戏字段名（SCWriting 把简写 `lip` 映射到 `charLipAnim`），没有额外的归类 |

注意：这些都不是游戏官方代码；轨道语义以 EventViewer 为准，它用的是 pixi-spine 的 3.7 runtime，与游戏客户端可能有细微差别（ticket 01 调研已说明）。

## 8. 还没确认的

- `stand` 与 `stand_costume` 的区别（同一 enzaId 两边都有，衣装名相同）本次没有深究，覆盖率也没有分开统计（从两位角色的逐套清单看，同名衣装两边缺的动画相同）。
- `lip` 事件（只在 2 套里出现、没有字符串）的用途不明；EventViewer 读它的 `stringValue` 当作口型名，但素材里这个值是空的。
- 本文所有「推荐」只看数据覆盖；表情是否好看、情绪动作 9 秒的开头是否太长（通话里一段回复可能只有几秒），需要在 ticket 04 原型里人眼确认。
- 部位分类（`region()`）是按骨骼/插槽名的关键字粗分的，个别衣装命名特殊时会被归到「其他」；两两重叠的判断是按「同一个骨骼/插槽的同一种时间轴」精确比较的，不受这个粗分影响。
