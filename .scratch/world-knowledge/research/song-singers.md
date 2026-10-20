# 查证：Lantis 和 ふじわらはじめ 都没给出演唱者的曲目

2026-09-28 实测。背景：`eidolon world sync` 从 Lantis 导入唱片，演唱者取 Lantis 唱片页，缺的由 ふじわらはじめ API（`api.fujiwarahaji.me/v4`）补齐。下面这些曲目两边都没给出能用的演唱者，这里逐首查证，供人工更正用。

记法：「歌曲」的演唱者只记闪耀色彩的偶像；特别组合、跨品牌组合另记组合名（special_unit）；纯伴奏、BGM、器乐、Non-Stop Remix 不算歌曲（`no_song: true`，这时 `singers` 给空数组，表示「不是歌、没有演唱者」，和「查不到」的 `null` 区分开）。

## 查证方法和来源

- **Lantis 唱片页**（`shinycolors.lantis.jp/releaseinfo/<catalog>/`）：全部实测抓取。写法规律：只有演唱者和唱片アーティスト不同时才在曲目下写「歌：…」。这些曲目都没写。
- **偶像大师官方门户新闻**（`idolmaster-official.jp/news/…`）：页面是 Next.js 服务端渲染，正文在 `__NEXT_DATA__.props.pageProps.data.content`，用 curl 能取到（WebFetch 只能看到标题）。
- **日本コロムビア官方页**（`columbia.jp/idolmaster/…`）：15、16、20 周年纪念曲的跨品牌组合写了完整的「Starring by」名单，各品牌 5 盘同时发售，名单相同。
- **Lantis 特集页**（`shinycolors.lantis.jp/extra/…`）、**PYLON PORT**（万代南梦宫音乐直播的官方媒体）。
- **ふじわらはじめ**：API 的 `music?id=` 给出这首歌（原版）的 `member`，但不按版本区分；网页 `fujiwarahaji.me/music/sc/<id>` 在每张唱片后面写了当时的名义，比如「シャイニーカラーズ(16人)」「アンティーカ（初代）」。这些新歌（Song for Prism、感謝のコントレイル）的 `disc` 字段是 null 或对不上 Lantis 的 catalog，所以导入时没有补上。三首跨品牌纪念曲在 ふじわらはじめ 里是 `music_type=joint`（id 3525、4411、9498），不在 `music_type=sc` 的列表里，所以导入时没有找到。
- **imas-db.jp**：CD 资料库没有闪耀色彩，只用到了公演曲目单页（S/N-GUL4R1TY）。
- `shinycolors.idolmaster-official.jp/music/` 实测返回 403（S3 AccessDenied），没能用上。

## 逐首结论

### LACM-24027 「なんどでも笑おう」【シャイニーカラーズ盤】（2020-09-30）

- **第 1 首「なんどでも笑おう THE IDOLM@STER FIVE STARS!!!!!」**：THE IDOLM@STER FIVE STARS!!!!! 是五个品牌各 3 人、共 15 人的组合。コロムビア官方新闻的「Starring by」写着「シャイニーカラーズ：櫻木真乃（CV 関根瞳）、風野灯織（CV 近藤玲奈）、八宮めぐる（CV 峯田茉優）」。→ 櫻木真乃・風野灯織・八宮めぐる，special_unit = THE IDOLM@STER FIVE STARS!!!!!。**把握：高**（官方）。
  出处：https://columbia.jp/idolmaster/imasnews/200727.html
- **第 3 首「なんどでも笑おう シャイニーカラーズVer.」**：同一篇新闻写着「各ブランドからの3人で歌唱するバージョン」，765 盘写的是「歌：765PRO ALLSTARS（天海春香、如月千早、星井美希）」。闪耀色彩盘的配信署名是 SHINY COLORS, 櫻木真乃, 風野灯織, 八宮めぐる。→ 櫻木真乃・風野灯織・八宮めぐる，special_unit = null。**不是全体曲**。**把握：高**。
  出处：同上；https://open.spotify.com/album/2arw4uZd1bIjQKo7F2R1wq

### LACM-24165 「VOY@GER」【シャイニーカラーズ盤】（2021-08-04）

- **第 1 首「VOY@GER THE IDOLM@STER FIVE STARS!!!!!」**：2021 年的 FIVE STARS!!!!! 换了人。コロムビア新闻的「Starring by」写着「シャイニーカラーズ：有栖川夏葉（CV涼本あきほ）、黛冬優子（CV幸村恵理）、浅倉透（CV和久井優）」。→ 有栖川夏葉・黛冬優子・浅倉透，special_unit = THE IDOLM@STER FIVE STARS!!!!!。**把握：高**。
  出处：https://columbia.jp/idolmaster/imasnews/210725.html
- **第 3 首「VOY@GER シャイニーカラーズVer.」**：官方门户新闻原文为「Tr.03 VOY＠GER シャイニーカラーズVer.／シャイニーカラーズ（有栖川夏葉、黛 冬優子、浅倉 透）」。→ 有栖川夏葉・黛冬優子・浅倉透，special_unit = null。**把握：高**。
  出处：https://idolmaster-official.jp/news/01_2162

### LACM-24643 「アイ NEED YOU（FOR WONDERFUL STORY）」【シャイニーカラーズ盤】（2024-12-11）

- **第 1 首**：Lantis 写的是「歌：THE IDOLM@STER BRILLIANT STARS」。这是六个品牌（含学园偶像大师）各 3 人、共 18 人的组合。コロムビア官方页的「STARRING BY」写着「★シャイニーカラーズ：櫻木真乃（CV関根瞳）／風野灯織（CV近藤玲奈）／八宮めぐる（CV峯田茉優）」。→ 櫻木真乃・風野灯織・八宮めぐる，special_unit = THE IDOLM@STER BRILLIANT STARS。**把握：高**。
  出处：https://columbia.jp/idolmaster/COCC-18232.html
- **第 3 首「… シャイニーカラーズVer.」**：Lantis 特集页说「ブランド横断のスペシャルユニット…歌唱版に加え、個性あふれるアイドル達の限定歌唱版」；コロムビア的シンデレラガールズ盘写的是该品牌 3 人（島村卯月、渋谷凛、本田未央）。闪耀色彩盘在 OTOTOY 上的配信署名是「シャイニーカラーズ, 櫻木真乃 (CV.関根 瞳), 風野灯織 (CV.近藤玲奈), 八宮めぐる (CV.峯田茉優)」。→ 櫻木真乃・風野灯織・八宮めぐる，special_unit = null。**把握：高**（Lantis 和官方门户都没有逐字写出这首的演唱者，是从同系列的写法和配信署名得出的）。
  出处：https://shinycolors.lantis.jp/extra/240726_1/ ；https://ototoy.jp/_/default/p/2842527

### LACA-9948～9 WING COLLECTION -B side-（2023-02-08）

曲目序号按 Lantis 页面两张碟连续编号（DISC2 第 n 首 = 第 11+n 首）。

- **背景**：三峰結華的声优 2022 年由成海瑠奈换成希水しお（官方门户 https://idolmaster-official.jp/news/01_3134.html ，公告写明游戏语音和歌曲都会替换）。WING COLLECTION A/B side 的全体曲都用当时的全员重录，标为「-25 colors-」；L'Antica 的歌由三峰結華的新声优重录，标为「2023 Ver.」。日文维基百科原文：「全体曲はすべて25人によるバージョン。また、三峰結華のパートは全て希水しおによる新録となる。」官方门户的 INDEX 新闻只给出曲名和版本名，没有逐人列名。
- **2023-02 时的全员 25 人** = illumination STARS 3 + L'Antica 5 + 放課後クライマックスガールズ 5 + ALSTROEMERIA 3 + Straylight 3 + noctchill 4 + SHHis 2。CoMETIK 还没有加入；后来加入 CoMETIK 3 人的全员版是 2025 年的「-28 colors- COLLECTION」。ふじわらはじめ 在原版唱片上写的名义是「シャイニーカラーズ(16人)」「(19人)」「(23人)」，-28 colors- 上写的是「（28人）」，都和各时点的全员人数一致。
- **第 1 首 Multicolored Sky -25 colors-／第 6 首 いつか Shiny Days -25 colors-／第 12 首 Dye the sky. -25 colors-／第 19 首 Color Days -25 colors-／第 27 首 Let's get a chance -25 colors-／第 28 首 SWEET♡STEP -25 colors-**：全体 25 人（上面那 25 位），special_unit = null。**把握：中高**。版本名和维基百科的说明一致；官方没有逐人列名，成员是按「当时的全员」推定的。
- **第 3 首 幻惑SILHOUETTE（2023 Ver.）／第 8 首 ラビリンス・レジスタンス（2023 Ver.）／第 14 首 純白トロイメライ（2023 Ver.）／第 21 首 革命進化論（2023 Ver.）**：L'Antica 5 人（月岡恋鐘・幽谷霧子・三峰結華・田中摩美々・白瀬咲耶），special_unit = null。维基百科写的是「歌：アンティーカ」；ふじわらはじめ 把原版唱片记为「アンティーカ（初代）」，把 2023 Version 唱片记为「アンティーカ」。**把握：高**。
  出处：https://shinycolors.lantis.jp/releaseinfo/laca-9948_9/ ；https://idolmaster-official.jp/news/01_5467 ；https://ja.wikipedia.org/wiki/THE_IDOLM@STER_SHINY_COLORS_WING_COLLECTION ；各曲的 ふじわらはじめ 页（见 JSON）

### LACZ-10335 / 10336 / 10337 シャニマス大感謝祭！ -Stella- / -Luna- / -Sol-（2026-02-14，会场贩卖）

- **各第 1 首「感謝のコントレイル」**：アーティスト：シャイニーカラーズ。PYLON PORT 的官方稿说这是「各チームでのメンバーへの他己紹介」的 10 分钟曲子。活动官网上 DAY2 三队（Team.Stella / Luna / Sol）的成员合起来正好是 28 人全员；ふじわらはじめ 列的也是 28 人（含 CoMETIK 3 人）。→ 全体 28 人，special_unit = null。**把握：中高**（官方没逐一列名；斑鳩ルカ 的声优川口莉奈没能参加 DAY2 公演，但那只是公演，和录音无关）。
  出处：https://shinycolors.lantis.jp/releaseinfo/lacz-10335/ （10336、10337 同）；https://pylonport.bandainamcomusiclive.co.jp/more/532 ；https://idolmaster-official.jp/live_event/283pro_kansyasai/ ；https://fujiwarahaji.me/music/sc/11830

### LACA-35264～5 騎士団のヴェール Music Collection【初回限定盤】（2026-03-11）

- **第 13–21 首（DISC2 01–09：Norsfelus, Exercitatio et Chivalria, Conflagratio, Rumores Norsfelii, Angor Lirae, Concordia, Iustitia Norsfelii, Epilogus: Acedia, Epilogus: Odium）**：Lantis 页只写「以上、作曲・編曲：大木奏弥 (Bandai Namco Studios Inc.)」，没有作词，也没有「歌：」。同碟的歌（DISC1 各曲、DISC2 第 10 首）都写了作词和「歌：…」。曲名都是拉丁语，是音乐剧的剧伴。第三方检索结果也称 DISC2 为 score/BGM；配信版只有 12 首（DISC1），不含这 9 首。→ **不算歌曲**。**把握：高**（官方没有明写「BGM」三个字，是从署名格式判断的）。
  出处：https://shinycolors.lantis.jp/releaseinfo/laca-35264/

### LACM-34828 S/N-GUL4R1TY MUSIC COLLECTION【初回限定盤】（2026-04-22）

- **第 3 首「VOY@GER (283 Production XXXX Performance XXX= S/N-GUL4R1TY Ver.)」**：唱片アーティスト：ストレイライト。Lantis 页和 INDEX 新闻只给演唱者不同的 M4（LINKs）另写了「歌：イルミネーションスターズ、黛 冬優子」，M3 没写，按这个惯例是ストレイライト。imas-db 的公演曲目单上，VOY@GER 由「ストレイライト / ALEV-1」演唱；ALEV-1 是这场 xR 公演里的机器人角色，不是偶像。→ 芹沢あさひ・黛冬優子・和泉愛依，special_unit = null。**把握：中**（没有找到逐字写出这首演唱者的官方资料；ふじわらはじめ 的 VOY@GER（joint/4411）没收这张唱片；CD 里有没有 ALEV-1 的声音查不到，不过它不是偶像，对资料没有影响）。
  出处：https://shinycolors.lantis.jp/releaseinfo/lacm-34828/ ；https://shinycolors.lantis.jp/extra/260412_1/ ；https://imas-db.jp/song/event/shinycolors_283_xxx.html
- **第 5 首「283 Production XXXX Performance XXX= S/N-GUL4R1TY Non-Stop Remix」**：「リミックス：GAK-amazuti-」，是公演曲目的连续混音。→ **不算歌曲**。**把握：高**。

### Song for Prism 单曲（PJ: REFRAC7IONS 新组合，都是跨组合的特别组合）

官方门户说 PJ: REFRAC7IONS 是 283 プロ的 28 人另组 7 个与平常不同的新组合。

- **LACM-24824（2026-04-01）第 1 首 SUPER DUPER DREAMER／第 2 首 BEAST MODE**：Lantis アーティスト：∑ Desire。官方门户新闻原文为「芹沢 あさひ、樋口 円香、緋田 美琴、斑鳩 ルカ、西城 樹里、田中 摩美々の6人による「∑ Desire」」。ふじわらはじめ 两首的 member 都是这 6 人。→ special_unit = ∑ Desire。**把握：高**。
  出处：https://idolmaster-official.jp/news/01_18066
- **LACM-24825（2026-04-29）第 1 首 Ring Ring Ringの魔法／第 2 首 街角メランコリー**：アーティスト：ザ・ふたりトラベラー。官方门户原文为「郁田 はるき、櫻木 真乃の2人による「ザ・ふたりトラベラー」」。ふじわらはじめ 两首都是这 2 人。→ special_unit = ザ・ふたりトラベラー。**把握：高**。
  出处：https://idolmaster-official.jp/news/01_18289
- **LACM-24827（2026-07-01）第 1 首 Tokyo自由系*ガール／第 2 首 My time**：アーティスト：No 1 feel alone。官方门户原文为「杜野凛世・大崎甘奈・福丸小糸・三峰結華 による新ユニット『No 1 feel alone』」，My time 是「カップリング曲」。ふじわらはじめ 两首都是这 4 人。→ special_unit = No 1 feel alone。**把握：高**。
  出处：https://idolmaster-official.jp/news/01_18602

注：这三张的第 2 首（カップリング曲）官方只写了组合名，成员取自 ふじわらはじめ 和组合的官方成员，没有找到逐曲写成员的官方资料。

## LACA-25318（Song for Prism ニューアルバム）的状态（2026-09-28 实测）

- Lantis 新闻 https://shinycolors.lantis.jp/extra/260910_1/ （2026-09-10，「特典内容決定！」）写着：发售日 2026-12-23，アーティスト：THE IDOLM@STER SHINY COLORS，品番 LACA-25318，2,970 日元。没有曲目，也没有演唱者。
- 发售列表 https://shinycolors.lantis.jp/discography/ 里**没有**这张：整页没有「25318」，也没有「ニューアルバム」；列出的 196 个 releaseinfo 链接里最新的是 lacm-34828 / lacm-24828。
- 唱片页**不存在**：`releaseinfo/laca-25318/`、`laca-25318_9/`、`laca-25318-9/` 都是 404。
- 结论：还不能导入，等 Lantis 上了唱片页再重新导入。

## 仍没把握的地方

- LACM-34828 第 3 首：「ストレイライト 3 人」是按 Lantis 写法的惯例推定的，没有逐字出处。
- -25 colors- 六首和感謝のコントレイル：官方没有逐人列名，「当时全员」的成员名单是推定的（有维基百科、ふじわらはじめ 和活动分队名单佐证）。
- 没有一首需要给 `singers: null`。

## 给更正文件用的 JSON

```json
[
  {"catalog": "LACM-24027", "track": 1, "title": "なんどでも笑おう THE IDOLM@STER FIVE STARS!!!!!", "singers": ["櫻木真乃", "風野灯織", "八宮めぐる"], "special_unit": "THE IDOLM@STER FIVE STARS!!!!!", "no_song": false, "sources": ["https://shinycolors.lantis.jp/releaseinfo/lacm-24027/", "https://columbia.jp/idolmaster/imasnews/200727.html"], "note": "五个品牌各 3 人共 15 人；只列闪耀色彩的 3 人（日本コロムビア官方新闻 Starring by 一栏）"},
  {"catalog": "LACM-24027", "track": 3, "title": "なんどでも笑おう シャイニーカラーズVer.", "singers": ["櫻木真乃", "風野灯織", "八宮めぐる"], "special_unit": null, "no_song": false, "sources": ["https://shinycolors.lantis.jp/releaseinfo/lacm-24027/", "https://columbia.jp/idolmaster/imasnews/200727.html", "https://open.spotify.com/album/2arw4uZd1bIjQKo7F2R1wq"], "note": "官方新闻写明各品牌版由该品牌 3 人演唱；配信署名为 櫻木真乃・風野灯織・八宮めぐる；不是全体曲"},
  {"catalog": "LACM-24165", "track": 1, "title": "VOY@GER THE IDOLM@STER FIVE STARS!!!!!", "singers": ["有栖川夏葉", "黛冬優子", "浅倉透"], "special_unit": "THE IDOLM@STER FIVE STARS!!!!!", "no_song": false, "sources": ["https://shinycolors.lantis.jp/releaseinfo/lacm-24165/", "https://columbia.jp/idolmaster/imasnews/210725.html", "https://idolmaster-official.jp/news/01_2162"], "note": "2021 年的 FIVE STARS!!!!! 成员与 2020 年不同；闪耀色彩为 有栖川夏葉・黛冬優子・浅倉透"},
  {"catalog": "LACM-24165", "track": 3, "title": "VOY@GER シャイニーカラーズVer.", "singers": ["有栖川夏葉", "黛冬優子", "浅倉透"], "special_unit": null, "no_song": false, "sources": ["https://shinycolors.lantis.jp/releaseinfo/lacm-24165/", "https://idolmaster-official.jp/news/01_2162"], "note": "官方新闻：シャイニーカラーズ（有栖川夏葉、黛 冬優子、浅倉 透）；不是全体曲"},
  {"catalog": "LACM-24643", "track": 1, "title": "アイ NEED YOU（FOR WONDERFUL STORY）", "singers": ["櫻木真乃", "風野灯織", "八宮めぐる"], "special_unit": "THE IDOLM@STER BRILLIANT STARS", "no_song": false, "sources": ["https://shinycolors.lantis.jp/releaseinfo/lacm-24643/", "https://columbia.jp/idolmaster/COCC-18232.html"], "note": "六个品牌各 3 人共 18 人；只列闪耀色彩的 3 人（日本コロムビア官方页 STARRING BY 一栏）"},
  {"catalog": "LACM-24643", "track": 3, "title": "アイ NEED YOU（FOR WONDERFUL STORY） シャイニーカラーズVer.", "singers": ["櫻木真乃", "風野灯織", "八宮めぐる"], "special_unit": null, "no_song": false, "sources": ["https://shinycolors.lantis.jp/releaseinfo/lacm-24643/", "https://shinycolors.lantis.jp/extra/240726_1/", "https://ototoy.jp/_/default/p/2842527"], "note": "各品牌版由该品牌参加 BRILLIANT STARS 的 3 人演唱（コロムビア的シンデレラガールズ盤明写 3 人；闪耀色彩盘配信署名为 シャイニーカラーズ, 櫻木真乃, 風野灯織, 八宮めぐる）；Lantis 本身没写这首的演唱者"},
  {"catalog": "LACA-9948～9", "track": 1, "title": "Multicolored Sky -25 colors-", "singers": ["櫻木真乃", "風野灯織", "八宮めぐる", "月岡恋鐘", "幽谷霧子", "三峰結華", "田中摩美々", "白瀬咲耶", "小宮果穂", "園田智代子", "西城樹里", "杜野凛世", "有栖川夏葉", "桑山千雪", "大崎甘奈", "大崎甜花", "芹沢あさひ", "黛冬優子", "和泉愛依", "浅倉透", "樋口円香", "福丸小糸", "市川雛菜", "七草にちか", "緋田美琴"], "special_unit": null, "no_song": false, "sources": ["https://shinycolors.lantis.jp/releaseinfo/laca-9948_9/", "https://idolmaster-official.jp/news/01_5467", "https://ja.wikipedia.org/wiki/THE_IDOLM@STER_SHINY_COLORS_WING_COLLECTION", "https://fujiwarahaji.me/music/sc/1494"], "note": "全体 25 人版（2023-02 时的全员：23 人 + SHHis 2 人，还没有 CoMETIK），三峰結華为希水しお新录；官方只给出「-25 colors-」这个版本名，「25 人」的成员由当时的全员推定"},
  {"catalog": "LACA-9948～9", "track": 6, "title": "いつか Shiny Days -25 colors-", "singers": ["櫻木真乃", "風野灯織", "八宮めぐる", "月岡恋鐘", "幽谷霧子", "三峰結華", "田中摩美々", "白瀬咲耶", "小宮果穂", "園田智代子", "西城樹里", "杜野凛世", "有栖川夏葉", "桑山千雪", "大崎甘奈", "大崎甜花", "芹沢あさひ", "黛冬優子", "和泉愛依", "浅倉透", "樋口円香", "福丸小糸", "市川雛菜", "七草にちか", "緋田美琴"], "special_unit": null, "no_song": false, "sources": ["https://shinycolors.lantis.jp/releaseinfo/laca-9948_9/", "https://idolmaster-official.jp/news/01_5467", "https://ja.wikipedia.org/wiki/THE_IDOLM@STER_SHINY_COLORS_WING_COLLECTION", "https://fujiwarahaji.me/music/sc/3090"], "note": "全体 25 人版（2023-02 时的全员：23 人 + SHHis 2 人，还没有 CoMETIK），三峰結華为希水しお新录；官方只给出「-25 colors-」这个版本名，「25 人」的成员由当时的全员推定"},
  {"catalog": "LACA-9948～9", "track": 12, "title": "Dye the sky. -25 colors-", "singers": ["櫻木真乃", "風野灯織", "八宮めぐる", "月岡恋鐘", "幽谷霧子", "三峰結華", "田中摩美々", "白瀬咲耶", "小宮果穂", "園田智代子", "西城樹里", "杜野凛世", "有栖川夏葉", "桑山千雪", "大崎甘奈", "大崎甜花", "芹沢あさひ", "黛冬優子", "和泉愛依", "浅倉透", "樋口円香", "福丸小糸", "市川雛菜", "七草にちか", "緋田美琴"], "special_unit": null, "no_song": false, "sources": ["https://shinycolors.lantis.jp/releaseinfo/laca-9948_9/", "https://idolmaster-official.jp/news/01_5467", "https://ja.wikipedia.org/wiki/THE_IDOLM@STER_SHINY_COLORS_WING_COLLECTION", "https://fujiwarahaji.me/music/sc/3624"], "note": "全体 25 人版（2023-02 时的全员：23 人 + SHHis 2 人，还没有 CoMETIK），三峰結華为希水しお新录；官方只给出「-25 colors-」这个版本名，「25 人」的成员由当时的全员推定"},
  {"catalog": "LACA-9948～9", "track": 19, "title": "Color Days -25 colors-", "singers": ["櫻木真乃", "風野灯織", "八宮めぐる", "月岡恋鐘", "幽谷霧子", "三峰結華", "田中摩美々", "白瀬咲耶", "小宮果穂", "園田智代子", "西城樹里", "杜野凛世", "有栖川夏葉", "桑山千雪", "大崎甘奈", "大崎甜花", "芹沢あさひ", "黛冬優子", "和泉愛依", "浅倉透", "樋口円香", "福丸小糸", "市川雛菜", "七草にちか", "緋田美琴"], "special_unit": null, "no_song": false, "sources": ["https://shinycolors.lantis.jp/releaseinfo/laca-9948_9/", "https://idolmaster-official.jp/news/01_5467", "https://ja.wikipedia.org/wiki/THE_IDOLM@STER_SHINY_COLORS_WING_COLLECTION", "https://fujiwarahaji.me/music/sc/4246"], "note": "全体 25 人版（2023-02 时的全员：23 人 + SHHis 2 人，还没有 CoMETIK），三峰結華为希水しお新录；官方只给出「-25 colors-」这个版本名，「25 人」的成员由当时的全员推定"},
  {"catalog": "LACA-9948～9", "track": 27, "title": "Let's get a chance -25 colors-", "singers": ["櫻木真乃", "風野灯織", "八宮めぐる", "月岡恋鐘", "幽谷霧子", "三峰結華", "田中摩美々", "白瀬咲耶", "小宮果穂", "園田智代子", "西城樹里", "杜野凛世", "有栖川夏葉", "桑山千雪", "大崎甘奈", "大崎甜花", "芹沢あさひ", "黛冬優子", "和泉愛依", "浅倉透", "樋口円香", "福丸小糸", "市川雛菜", "七草にちか", "緋田美琴"], "special_unit": null, "no_song": false, "sources": ["https://shinycolors.lantis.jp/releaseinfo/laca-9948_9/", "https://idolmaster-official.jp/news/01_5467", "https://ja.wikipedia.org/wiki/THE_IDOLM@STER_SHINY_COLORS_WING_COLLECTION", "https://fujiwarahaji.me/music/sc/2865"], "note": "全体 25 人版（2023-02 时的全员：23 人 + SHHis 2 人，还没有 CoMETIK），三峰結華为希水しお新录；官方只给出「-25 colors-」这个版本名，「25 人」的成员由当时的全员推定"},
  {"catalog": "LACA-9948～9", "track": 28, "title": "SWEET♡STEP -25 colors-", "singers": ["櫻木真乃", "風野灯織", "八宮めぐる", "月岡恋鐘", "幽谷霧子", "三峰結華", "田中摩美々", "白瀬咲耶", "小宮果穂", "園田智代子", "西城樹里", "杜野凛世", "有栖川夏葉", "桑山千雪", "大崎甘奈", "大崎甜花", "芹沢あさひ", "黛冬優子", "和泉愛依", "浅倉透", "樋口円香", "福丸小糸", "市川雛菜", "七草にちか", "緋田美琴"], "special_unit": null, "no_song": false, "sources": ["https://shinycolors.lantis.jp/releaseinfo/laca-9948_9/", "https://idolmaster-official.jp/news/01_5467", "https://ja.wikipedia.org/wiki/THE_IDOLM@STER_SHINY_COLORS_WING_COLLECTION", "https://fujiwarahaji.me/music/sc/3524"], "note": "全体 25 人版（2023-02 时的全员：23 人 + SHHis 2 人，还没有 CoMETIK），三峰結華为希水しお新录；官方只给出「-25 colors-」这个版本名，「25 人」的成员由当时的全员推定"},
  {"catalog": "LACA-9948～9", "track": 3, "title": "幻惑SILHOUETTE（2023 Ver.）", "singers": ["月岡恋鐘", "幽谷霧子", "三峰結華", "田中摩美々", "白瀬咲耶"], "special_unit": null, "no_song": false, "sources": ["https://shinycolors.lantis.jp/releaseinfo/laca-9948_9/", "https://idolmaster-official.jp/news/01_5467", "https://ja.wikipedia.org/wiki/THE_IDOLM@STER_SHINY_COLORS_WING_COLLECTION", "https://fujiwarahaji.me/music/sc/1496"], "note": "L'Antica 5 人的重录版（三峰結華改由希水しお演唱），不是特别组合"},
  {"catalog": "LACA-9948～9", "track": 8, "title": "ラビリンス・レジスタンス（2023 Ver.）", "singers": ["月岡恋鐘", "幽谷霧子", "三峰結華", "田中摩美々", "白瀬咲耶"], "special_unit": null, "no_song": false, "sources": ["https://shinycolors.lantis.jp/releaseinfo/laca-9948_9/", "https://idolmaster-official.jp/news/01_5467", "https://ja.wikipedia.org/wiki/THE_IDOLM@STER_SHINY_COLORS_WING_COLLECTION", "https://fujiwarahaji.me/music/sc/3222"], "note": "L'Antica 5 人的重录版（三峰結華改由希水しお演唱），不是特别组合"},
  {"catalog": "LACA-9948～9", "track": 14, "title": "純白トロイメライ（2023 Ver.）", "singers": ["月岡恋鐘", "幽谷霧子", "三峰結華", "田中摩美々", "白瀬咲耶"], "special_unit": null, "no_song": false, "sources": ["https://shinycolors.lantis.jp/releaseinfo/laca-9948_9/", "https://idolmaster-official.jp/news/01_5467", "https://ja.wikipedia.org/wiki/THE_IDOLM@STER_SHINY_COLORS_WING_COLLECTION", "https://fujiwarahaji.me/music/sc/3892"], "note": "L'Antica 5 人的重录版（三峰結華改由希水しお演唱），不是特别组合"},
  {"catalog": "LACA-9948～9", "track": 21, "title": "革命進化論（2023 Ver.）", "singers": ["月岡恋鐘", "幽谷霧子", "三峰結華", "田中摩美々", "白瀬咲耶"], "special_unit": null, "no_song": false, "sources": ["https://shinycolors.lantis.jp/releaseinfo/laca-9948_9/", "https://idolmaster-official.jp/news/01_5467", "https://ja.wikipedia.org/wiki/THE_IDOLM@STER_SHINY_COLORS_WING_COLLECTION", "https://fujiwarahaji.me/music/sc/4315"], "note": "L'Antica 5 人的重录版（三峰結華改由希水しお演唱），不是特别组合"},
  {"catalog": "LACZ-10335", "track": 1, "title": "感謝のコントレイル", "singers": ["櫻木真乃", "風野灯織", "八宮めぐる", "月岡恋鐘", "幽谷霧子", "三峰結華", "田中摩美々", "白瀬咲耶", "小宮果穂", "園田智代子", "西城樹里", "杜野凛世", "有栖川夏葉", "桑山千雪", "大崎甘奈", "大崎甜花", "芹沢あさひ", "黛冬優子", "和泉愛依", "浅倉透", "樋口円香", "福丸小糸", "市川雛菜", "七草にちか", "緋田美琴", "斑鳩ルカ", "鈴木羽那", "郁田はるき"], "special_unit": null, "no_song": false, "sources": ["https://shinycolors.lantis.jp/releaseinfo/lacz-10335/", "https://pylonport.bandainamcomusiclive.co.jp/more/532", "https://idolmaster-official.jp/live_event/283pro_kansyasai/", "https://fujiwarahaji.me/music/sc/11830"], "note": "アーティスト：シャイニーカラーズ；官方介绍为三队（Stella/Luna/Sol，合起来正好 28 人）互相介绍队友的曲子；官方没逐一列名，28 人名单取自 ふじわらはじめ"},
  {"catalog": "LACZ-10336", "track": 1, "title": "感謝のコントレイル", "singers": ["櫻木真乃", "風野灯織", "八宮めぐる", "月岡恋鐘", "幽谷霧子", "三峰結華", "田中摩美々", "白瀬咲耶", "小宮果穂", "園田智代子", "西城樹里", "杜野凛世", "有栖川夏葉", "桑山千雪", "大崎甘奈", "大崎甜花", "芹沢あさひ", "黛冬優子", "和泉愛依", "浅倉透", "樋口円香", "福丸小糸", "市川雛菜", "七草にちか", "緋田美琴", "斑鳩ルカ", "鈴木羽那", "郁田はるき"], "special_unit": null, "no_song": false, "sources": ["https://shinycolors.lantis.jp/releaseinfo/lacz-10336/", "https://pylonport.bandainamcomusiclive.co.jp/more/532", "https://idolmaster-official.jp/live_event/283pro_kansyasai/", "https://fujiwarahaji.me/music/sc/11830"], "note": "アーティスト：シャイニーカラーズ；官方介绍为三队（Stella/Luna/Sol，合起来正好 28 人）互相介绍队友的曲子；官方没逐一列名，28 人名单取自 ふじわらはじめ"},
  {"catalog": "LACZ-10337", "track": 1, "title": "感謝のコントレイル", "singers": ["櫻木真乃", "風野灯織", "八宮めぐる", "月岡恋鐘", "幽谷霧子", "三峰結華", "田中摩美々", "白瀬咲耶", "小宮果穂", "園田智代子", "西城樹里", "杜野凛世", "有栖川夏葉", "桑山千雪", "大崎甘奈", "大崎甜花", "芹沢あさひ", "黛冬優子", "和泉愛依", "浅倉透", "樋口円香", "福丸小糸", "市川雛菜", "七草にちか", "緋田美琴", "斑鳩ルカ", "鈴木羽那", "郁田はるき"], "special_unit": null, "no_song": false, "sources": ["https://shinycolors.lantis.jp/releaseinfo/lacz-10337/", "https://pylonport.bandainamcomusiclive.co.jp/more/532", "https://idolmaster-official.jp/live_event/283pro_kansyasai/", "https://fujiwarahaji.me/music/sc/11830"], "note": "アーティスト：シャイニーカラーズ；官方介绍为三队（Stella/Luna/Sol，合起来正好 28 人）互相介绍队友的曲子；官方没逐一列名，28 人名单取自 ふじわらはじめ"},
  {"catalog": "LACA-35264～5", "track": 13, "title": "Norsfelus", "singers": [], "special_unit": null, "no_song": true, "sources": ["https://shinycolors.lantis.jp/releaseinfo/laca-35264/"], "note": "DISC2 第 1 首；只写「以上、作曲・编曲：大木奏弥」，没有作词、没有「歌：」，与同碟有歌的曲目写法不同：音乐剧的剧伴/器乐"},
  {"catalog": "LACA-35264～5", "track": 14, "title": "Exercitatio et Chivalria", "singers": [], "special_unit": null, "no_song": true, "sources": ["https://shinycolors.lantis.jp/releaseinfo/laca-35264/"], "note": "DISC2 第 2 首；只写「以上、作曲・编曲：大木奏弥」，没有作词、没有「歌：」，与同碟有歌的曲目写法不同：音乐剧的剧伴/器乐"},
  {"catalog": "LACA-35264～5", "track": 15, "title": "Conflagratio", "singers": [], "special_unit": null, "no_song": true, "sources": ["https://shinycolors.lantis.jp/releaseinfo/laca-35264/"], "note": "DISC2 第 3 首；只写「以上、作曲・编曲：大木奏弥」，没有作词、没有「歌：」，与同碟有歌的曲目写法不同：音乐剧的剧伴/器乐"},
  {"catalog": "LACA-35264～5", "track": 16, "title": "Rumores Norsfelii", "singers": [], "special_unit": null, "no_song": true, "sources": ["https://shinycolors.lantis.jp/releaseinfo/laca-35264/"], "note": "DISC2 第 4 首；只写「以上、作曲・编曲：大木奏弥」，没有作词、没有「歌：」，与同碟有歌的曲目写法不同：音乐剧的剧伴/器乐"},
  {"catalog": "LACA-35264～5", "track": 17, "title": "Angor Lirae", "singers": [], "special_unit": null, "no_song": true, "sources": ["https://shinycolors.lantis.jp/releaseinfo/laca-35264/"], "note": "DISC2 第 5 首；只写「以上、作曲・编曲：大木奏弥」，没有作词、没有「歌：」，与同碟有歌的曲目写法不同：音乐剧的剧伴/器乐"},
  {"catalog": "LACA-35264～5", "track": 18, "title": "Concordia", "singers": [], "special_unit": null, "no_song": true, "sources": ["https://shinycolors.lantis.jp/releaseinfo/laca-35264/"], "note": "DISC2 第 6 首；只写「以上、作曲・编曲：大木奏弥」，没有作词、没有「歌：」，与同碟有歌的曲目写法不同：音乐剧的剧伴/器乐"},
  {"catalog": "LACA-35264～5", "track": 19, "title": "Iustitia Norsfelii", "singers": [], "special_unit": null, "no_song": true, "sources": ["https://shinycolors.lantis.jp/releaseinfo/laca-35264/"], "note": "DISC2 第 7 首；只写「以上、作曲・编曲：大木奏弥」，没有作词、没有「歌：」，与同碟有歌的曲目写法不同：音乐剧的剧伴/器乐"},
  {"catalog": "LACA-35264～5", "track": 20, "title": "Epilogus: Acedia", "singers": [], "special_unit": null, "no_song": true, "sources": ["https://shinycolors.lantis.jp/releaseinfo/laca-35264/"], "note": "DISC2 第 8 首；只写「以上、作曲・编曲：大木奏弥」，没有作词、没有「歌：」，与同碟有歌的曲目写法不同：音乐剧的剧伴/器乐"},
  {"catalog": "LACA-35264～5", "track": 21, "title": "Epilogus: Odium", "singers": [], "special_unit": null, "no_song": true, "sources": ["https://shinycolors.lantis.jp/releaseinfo/laca-35264/"], "note": "DISC2 第 9 首；只写「以上、作曲・编曲：大木奏弥」，没有作词、没有「歌：」，与同碟有歌的曲目写法不同：音乐剧的剧伴/器乐"},
  {"catalog": "LACM-34828", "track": 3, "title": "VOY@GER (283 Production XXXX Performance XXX= S/N-GUL4R1TY Ver.)", "singers": ["芹沢あさひ", "黛冬優子", "和泉愛依"], "special_unit": null, "no_song": false, "sources": ["https://shinycolors.lantis.jp/releaseinfo/lacm-34828/", "https://shinycolors.lantis.jp/extra/260412_1/", "https://imas-db.jp/song/event/shinycolors_283_xxx.html"], "note": "没把握到逐人：唱片アーティスト为ストレイライト，Lantis 只在演唱者不同的 M4 另写「歌：」，这首没写，按惯例是ストレイライト 3 人；公演上这首是ストレイライト和演出角色 ALEV-1（不是偶像）一起唱，CD 里 ALEV-1 有没有声音查不到"},
  {"catalog": "LACM-34828", "track": 5, "title": "283 Production XXXX Performance XXX= S/N-GUL4R1TY Non-Stop Remix", "singers": [], "special_unit": null, "no_song": true, "sources": ["https://shinycolors.lantis.jp/releaseinfo/lacm-34828/"], "note": "公演曲目的 Non-Stop Remix（リミックス：GAK-amazuti-），不算歌曲"},
  {"catalog": "LACM-24824", "track": 1, "title": "SUPER DUPER DREAMER", "singers": ["芹沢あさひ", "樋口円香", "緋田美琴", "斑鳩ルカ", "西城樹里", "田中摩美々"], "special_unit": "∑ Desire", "no_song": false, "sources": ["https://shinycolors.lantis.jp/releaseinfo/lacm-24824/", "https://idolmaster-official.jp/news/01_18066", "https://fujiwarahaji.me/music/sc/11829"], "note": "PJ: REFRAC7IONS 新组合第 4 弹，6 人"},
  {"catalog": "LACM-24824", "track": 2, "title": "BEAST MODE", "singers": ["芹沢あさひ", "樋口円香", "緋田美琴", "斑鳩ルカ", "西城樹里", "田中摩美々"], "special_unit": "∑ Desire", "no_song": false, "sources": ["https://shinycolors.lantis.jp/releaseinfo/lacm-24824/", "https://idolmaster-official.jp/news/01_18066", "https://fujiwarahaji.me/music/sc/11981"], "note": "PJ: REFRAC7IONS 新组合第 4 弹，6 人"},
  {"catalog": "LACM-24825", "track": 1, "title": "Ring Ring Ringの魔法", "singers": ["櫻木真乃", "郁田はるき"], "special_unit": "ザ・ふたりトラベラー", "no_song": false, "sources": ["https://shinycolors.lantis.jp/releaseinfo/lacm-24825/", "https://idolmaster-official.jp/news/01_18289", "https://fujiwarahaji.me/music/sc/11919"], "note": "PJ: REFRAC7IONS 新组合第 5 弹，2 人"},
  {"catalog": "LACM-24825", "track": 2, "title": "街角メランコリー", "singers": ["櫻木真乃", "郁田はるき"], "special_unit": "ザ・ふたりトラベラー", "no_song": false, "sources": ["https://shinycolors.lantis.jp/releaseinfo/lacm-24825/", "https://idolmaster-official.jp/news/01_18289", "https://fujiwarahaji.me/music/sc/11982"], "note": "PJ: REFRAC7IONS 新组合第 5 弹，2 人"},
  {"catalog": "LACM-24827", "track": 1, "title": "Tokyo自由系*ガール", "singers": ["杜野凛世", "大崎甘奈", "福丸小糸", "三峰結華"], "special_unit": "No 1 feel alone", "no_song": false, "sources": ["https://shinycolors.lantis.jp/releaseinfo/lacm-24827/", "https://idolmaster-official.jp/news/01_18602", "https://fujiwarahaji.me/music/sc/12071"], "note": "PJ: REFRAC7IONS 新组合第 7 弹，4 人；My time 是官方所说的这个组合的カップリング曲"},
  {"catalog": "LACM-24827", "track": 2, "title": "My time", "singers": ["杜野凛世", "大崎甘奈", "福丸小糸", "三峰結華"], "special_unit": "No 1 feel alone", "no_song": false, "sources": ["https://shinycolors.lantis.jp/releaseinfo/lacm-24827/", "https://idolmaster-official.jp/news/01_18602", "https://fujiwarahaji.me/music/sc/12090"], "note": "PJ: REFRAC7IONS 新组合第 7 弹，4 人；My time 是官方所说的这个组合的カップリング曲"}
]
```
