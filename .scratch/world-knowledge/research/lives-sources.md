# 演出资料来源实测：偶像大师官方门户 CMS API 与 wikiwiki「ライブイベント情報」

实测时间：2026-09-28（UTC 06:10–06:40，JST 15:10–15:40）。所有请求都用 world sync 的 UA `eidolon-sc world sync (run by hand)`（`backend/src/eidolon/world_sync.py` 的 `_USER_AGENT`），HTTP 用 curl / python urllib。

---

## ⚠️ 先看这里：和 spec / ticket 04 的描述不一致的地方

1. **CMS 可以在请求里按品牌过滤，不会返回 0 条。** `data={"category":["LIVE-EVENT"],"brand":["SHINYCOLORS"]}` 返回 72 条，和本地筛出来的 72 条 `_id` 完全一样。只有品牌写法不对时才是 0 条：小写 `shinycolors`、日文名 `シャイニーカラーズ`、对象 `[{"code":"SHINYCOLORS"}]`、缩写 `SC` 都返回 0；把 `brand` 放到 `data` 外面当查询参数会被忽略（返回全部 232 条）。按 spec 在本地筛选也没问题，只是 spec 里「请求里过滤会返回 0 条」这个理由不成立。（出处：见 §1.4）
2. **CMS 的 LIVE-EVENT 分类不只有演出。** 里面还有周边、特设页、电视节目、检定考试、酒店合作、展览等（`article_type=lp_detail` 的 51 条基本都不是演出，另外 url_link / detail_page 里也有非演出）。**CMS 也没有 2020-09 以前的演出**（最早 `event_startdate` 是 2020-09-05 JST），闪耀色彩的 1stLIVE（2019-03）、SUMMER PARTY 2019、SPRING PARTY 2020（中止）等都不在里面。**刚公布的场次也可能还没进 LIVE-EVENT**：「283 Production LIVE Performance noctchill」（2027-03-27/28）2026-09-27 20:30 JST 已经发了 NEWS，详情页也在，但实测时 LIVE-EVENT 列表里还没有这一条，wikiwiki 里已经有了。
   - 2020-09 以前的场次可以用旧官方站 `https://idolmaster.jp/event/{年}.php`（实测 2019.php、2020.php 都是 200、UTF-8 静态 HTML，表格里有 公演名 / 日時 / 場所 / 出演者；2018.php 里没有闪耀色彩）。
3. **wikiwiki 能直接 GET，但取不到源码视图。** 页面本身 200（Cloudflare 前面，缓存 `max-age=600`）。`?cmd=source&page=…` 会被 Cloudflare 挑战（403，`Cf-Mitigated: challenge`），用真实浏览器（Playwright）过了挑战后会跳转到 `::cmd/source?page=…`，那里直接 403「Sorry, you have been blocked」。`robots.txt` 也写了 `Disallow: /*?` 和 `Disallow: /*/::*`。**只能解析渲染好的 HTML。**另外实测开始时 wikiwiki 在全站维护（503，公告写 JST 14:00–15:00，实际拖到 15:20 左右），导入器要把 503 当作「抓取失败、整体退出」处理。
4. **缺席基本不是用脚注写的。** 四个页面里只找到 **1 处**用脚注写的「出演見合わせ」（`<del>` 划掉名字 + 脚注，脚注里附了官方新闻链接）。更早的缺席（2021–2024 共 5 次以上）写法是：**直接从出演者名单里删掉这个人**，再在「出演者」下面或上方加一行说明（有的附官方新闻链接，有的不附）。所以「脚注里的缺席只采用附了官方链接的」这条规则只能覆盖一小部分；大多数缺席在 wiki 上已经反映为「名单里没有这个人」。
   - 另一个可以直接查缺席的来源是 **CMS 的 NEWS 分类**：`data={"category":["NEWS"],"brand":["SHINYCOLORS"]}` 一共 4176 条，按标题含「見合わせ」筛出 9 条官方缺席公告（§1.8）。可以用来核对 wiki 的缺席，或者代替 wiki 作为缺席的权威来源。

两个来源都**能用**，但要按上面几点调整 spec。

---

## 1. 偶像大师官方门户 CMS API

### 1.1 接口是怎么找到的

- `https://idolmaster-official.jp/live_event` 是 Next.js 静态导出页面（`__NEXT_DATA__` 里 `pageProps` 是空的），数据全靠客户端请求。
- 在 `/_next/static/chunks/pages/_app-73c98fb87094b031.js` 里找到 CMS base：`i="https://cmsapi-frontend.idolmaster-official.jp/sitern/api/"`；取 token 的调用是 `["cmsbase/Token/get",{method:"GET"}]`，成功后把 `{token, limit}` 存进 redux 的 `app.cmsToken`。
- 列表调用是 `"idolmaster/".concat(f,"/list")`，`f` 默认是 `"Article"`，参数为 `{site:"jp", ip:"idolmaster", token, data:JSON.stringify({category, subcategory, brand, ...}), limit, start}`。
- 演出页 `/_next/static/chunks/pages/live_event-484f53e9a3589c39.js` 请求 `category:["LIVE-EVENT"]`，额外参数 `article_type:["url_link","detail_page"]`、`target_start_date`、`target_end_date`、`event_type`、`event_area`（放在 `data` JSON 里）。
- JS 里还有一个 `X-API-KEY`（`MEW6X…`），它是给 `api.idolmaster-official.jp`（会员相关 API）用的。**CMS API 不需要任何请求头**，实测 UA 为空也能用。

### 1.2 取 token

```
GET https://cmsapi-frontend.idolmaster-official.jp/sitern/api/cmsbase/Token/get
```
不需要参数和请求头，POST 也会返回同样格式的结果。响应（HTTP 200，`Content-Type: application/json`，`Cache-Control: no-store`）：
```json
{
    "statusCode": 200,
    "data": {
        "token": "aaafe1e884f0c737712d0fdec0c353b81cd3c18b9401d5600a21dacf9ba0ad5f",
        "limit": 1790579592,
        "time": 0
    }
}
```
- `token`：64 位十六进制字符串。
- `limit`：过期时间（Unix 秒）。实测是签发时刻 + 3600 秒，也就是 1 小时有效（06:13:12Z 签发，limit 对应 07:13:12Z）。
- 每次请求都会签发新 token，旧 token 继续有效（新 token 签发之后，用第一个 token 仍然能正常请求）。
- token 无效或缺失时：token 长度正确但值错误、或者不带 token，都返回 **HTTP 200**，body 是 `{"statusCode": 404, "data": false}`；token 很短（如 `bad`）时返回 **HTTP 403**，body 为空。**不能只看 HTTP 状态码，还要检查 body 里的 `statusCode` 和 `data`。**

### 1.3 列出 LIVE-EVENT

```
GET https://cmsapi-frontend.idolmaster-official.jp/sitern/api/idolmaster/Article/list
    ?site=jp
    &ip=idolmaster
    &token=<token>
    &data={"category":["LIVE-EVENT"]}        ← JSON，需要 URL 编码
    &limit=100
    &start=0
```
- 分页：`start` 是偏移量（从 0 开始），`limit` 是每页条数。**不传 `limit` 时默认 100**；`limit=500`、`limit=1000` 都会一次返回全部 232 条（没有上限）。越界时正常返回剩下的条数（`start=225&limit=50` 返回 `count:7`）。
- 响应的 `data` 里有：`apiStatus`（true）、`total_count`（总数）、`start`、`limit`、`count`（本页条数）、`time`、`article_list`（数组）。
- 实测总数：`{"category":["LIVE-EVENT"]}` 共 **232** 条（`url_link` 169 条、`lp_detail` 51 条、`detail_page` 12 条）；带上官网页面同样的 `"article_type":["url_link","detail_page"]` 后是 **181** 条。`category` 写成字符串 `"LIVE-EVENT"` 也一样是 232 条。`data={}`（不限分类）有 15907 条。
- 顺序：不是按演出日期排的（大致按发布时间倒序，但并不严格），需要在本地排序。

### 1.4 品牌过滤实测（2026-09-28）

| `data` 参数 | total_count |
|---|---|
| `{"category":["LIVE-EVENT"]}` | 232 |
| `{"category":["LIVE-EVENT"],"brand":["SHINYCOLORS"]}` | **72**（`_id` 集合和本地筛选完全一样） |
| `{"category":["LIVE-EVENT"],"brand":"SHINYCOLORS"}` | 72 |
| `{"category":["LIVE-EVENT"],"subcategory":[],"brand":["SHINYCOLORS"],"article_type":["url_link","detail_page"]}` | 51 |
| `{"category":["LIVE-EVENT"],"brand":["shinycolors"]}` | 0 |
| `{"category":["LIVE-EVENT"],"brand":["シャイニーカラーズ"]}` | 0 |
| `{"category":["LIVE-EVENT"],"brand":[{"code":"SHINYCOLORS"}]}` | 0 |
| `{"category":["LIVE-EVENT"],"brand":["SC"]}` | 0 |
| `data={"category":["LIVE-EVENT"]}` 再加查询参数 `&brand=SHINYCOLORS` | 232（参数被忽略） |

本地按 `brand[].code == "SHINYCOLORS"` 筛选：**72 条**（url_link 48、lp_detail 21、detail_page 3）；去掉 lp_detail 后 **51 条**，其中单独品牌 33 条、合办 18 条。所有品牌代码：`IDOLMASTER`、`CINDERELLAGIRLS`、`MILLIONLIVE`、`SIDEM`、`SHINYCOLORS`、`GAKUEN`、`OTHER`。

### 1.5 每条记录的字段（和演出有关的部分）

| 字段 | 含义 / 实测情况 |
|---|---|
| `_id` | 字符串形式的数字，例如 `"1712"` |
| `title` | 演出名 |
| `article_type` | `url_link` / `detail_page` / `lp_detail` |
| `brand` | **一定是数组**，元素为 `{"name": 显示名, "code": 品牌代码}`。合办演出就是多个元素（例如 MOIW2023 有 5 个元素，SideM×SC 有 2 个）。同一个代码的 `name` 可能不同（`IDOLMASTER` 有时是 `"THE IDOLM@STER"`，有时是 `"765PRO ALLSTARS"`），**只能按 `code` 比较** |
| `event_place` | 会场，自由文本。巡演时是多行：`"名古屋：日本ガイシホール\n東京　：東京ガーデンシアター\n福岡　：西日本総合展示場 新館ABC"`；有时带附加说明（上海场后面还写了主办方等几行） |
| `event_dspdate` | 显示用的日期文本，自由格式、多行，**只有这里能看出每个演出日**（见 §1.6） |
| `event_startdate` / `event_enddate` | Unix 秒，按 JST 解释。开始时间通常是首日 00:00 JST（也有 10:00、15:00 的）；结束时间有时是末日 23:59，有时是末日 00:00（例如 ∞th LIVE 是 `2026-04-26 00:00`），单日演出里有时和开始时间相同。lp_detail 大多是 null |
| `event_type` | `["oth_event"]` / `["mr_event"]`（xR 类）/ `[]` |
| `event_area` | `["dm_event"]`（国内）/ `["os_event"]` / `[]` |
| `event_url` | url_link 的「详细はこちら」目标。多数是 `https://idolmaster-official.jp/live_event/<slug>/`，也有外部站点（`https://www.lisani.jp/live/`、`https://fes.bn-ent.net/`、`https://ijigen-fes.jp/utagassen/`、asobistage），或者新闻页（`https://idolmaster-official.jp/news/01_15814`），也出现过双斜杠 `https://idolmaster-official.jp//live_event/idolworld2025/`。detail_page 类型的这个字段是 null |
| `url_name` / `path` | detail_page 的 slug，例如 `283_Uka` |
| `url` | **不能当来源**：`https://idolmaster-official.jp/live-event/01_832.html` 这一类实测全部是 404 |

**详情页 URL（可以作为「来源」）** 按前端逻辑（`live_event-*.js`）生成：
- `detail_page` → `https://idolmaster-official.jp/live_events/{url_name}`（实测 `live_events/283_Uka` 200；加 `.html` 就 404）
- `lp_detail` → `/lp/{path}`
- `url_link` → `event_url`（`live_event/shinycolors_2nd/` 等实测 200）

**未来场次在列表里**：实测时 `event_enddate` 晚于当前时刻的闪耀色彩场次有 3 条（REFRAC7IONS 2026-12、ORCHESTRA -Radiant Chord- 2027-03、SideM×SC SPARKLE SHOWDOWN 2027-06）。但如 ⚠️2 所说，刚公布的场次不一定已经在里面。

### 1.6 `event_dspdate` 的写法（实测样例）

- `"2021年3月20日（土）16:00開場／18:00開演(予定)\n2021年3月21日（日）16:00開場／18:00開演(予定)"`：一行一天
- `"2027年6月5日(土)、6日(日)"`、`"2026年7月24日(金)・25日(土)・26日(日)"`：一行写几天，后面的日子省略年月
- `"名古屋：2021年4月3日(土)、4日(日)\n東京　：2021年4月24日(土)、25日(日)\n福岡　：..."`：**一条记录是一整个多会场巡演**（3rd TOUR），会场和日期要按行前缀「名古屋：」对应到 `event_place`
- `"DAY1：2024年12月14日\nDAY2：2024年12月15日"`
- `"2027年3月22日(月･祝)\n昼公演　12:00開場／13:00開演\n夜公演　..."`：同一天有昼夜两场
- `"2025年1月11日(土)　\n[never;1]　13:30開場／14:30開演\n..."`
- `"2023年 2月11日（土）..."`：「年」后面有空格
- `"2026年9月26日(土) ...\n※開演時間を修正いたしました。"`：末尾带备注
- `"2021/1/14～2/15、3/12・13・18～20・..."`：非演出（酒店合作），格式完全不同
- 同一巡演也可能拆成几条：6thLIVE TOUR 的大阪、横滨是两条记录（`event_url` 相同，都是 `/live_event/shinycolors_6th/`）；7th UNITLIVE TOUR 每个会场一条。

### 1.7 原始 JSON 摘录（只留相关字段）

闪耀色彩单独公演（2ndLIVE，`_id` 1712）：
```json
{"_id":"1712","article_type":"url_link","title":"THE IDOLM@STER SHINY COLORS 2ndLIVE STEP INTO THE SUNSET SKY",
 "brand":[{"name":"シャイニーカラーズ","code":"SHINYCOLORS"}],
 "event_place":"幕張メッセ国際展示場1~3ホール",
 "event_dspdate":"2021年3月20日（土）16:00開場／18:00開演(予定)\n2021年3月21日（日）16:00開場／18:00開演(予定)",
 "event_startdate":1616166000,"event_enddate":1616338800,"event_type":["oth_event"],"event_area":["dm_event"],
 "event_url":"https://idolmaster-official.jp/live_event/shinycolors_2nd/","path":"01_832",
 "url":"https://idolmaster-official.jp/live-event/01_832.html"}
```
单独公演、多会场巡演（3rd TOUR，`_id` 1882）：
```json
{"_id":"1882","article_type":"url_link","title":"THE IDOLM@STER SHINY COLORS 3rd LIVE TOUR PIECE ON PLANET",
 "brand":[{"name":"シャイニーカラーズ","code":"SHINYCOLORS"}],
 "event_place":"名古屋：日本ガイシホール\n東京　：東京ガーデンシアター\n福岡　：西日本総合展示場 新館ABC",
 "event_dspdate":"名古屋：2021年4月3日(土)、4日(日)\n東京　：2021年4月24日(土)、25日(日)\n福岡　：2021年5月29日(土)、30日(日)",
 "event_startdate":1617375600,"event_enddate":1622386800,
 "event_url":"https://idolmaster-official.jp/live_event/shinycolors_3rd/"}
```
合办演出（MOIW 2023，`_id` 8056）：
```json
{"_id":"8056","article_type":"url_link","title":"THE IDOLM@STER M@STERS OF IDOL WORLD!!!!! 2023",
 "brand":[{"name":"THE IDOLM@STER","code":"IDOLMASTER"},{"name":"シンデレラガールズ","code":"CINDERELLAGIRLS"},
          {"name":"ミリオンライブ！","code":"MILLIONLIVE"},{"name":"SideM","code":"SIDEM"},
          {"name":"シャイニーカラーズ","code":"SHINYCOLORS"}],
 "event_place":"東京ドーム",
 "event_dspdate":"2023年 2月11日（土）15:00開場／17:00開演\n2023年 2月12日（日）15:00開場／17:00開演",
 "event_startdate":1676041200,"event_enddate":1676213940,
 "event_url":"https://idolmaster-official.jp/live_event/idolworld2023/"}
```
未来场次、合办（`_id` 23494，实测时是列表第一条）：
```json
{"_id":"23494","article_type":"url_link","title":"THE IDOLM@STER SideM × SHINY COLORS SPARKLE SHOWDOWN",
 "brand":[{"name":"SideM","code":"SIDEM"},{"name":"シャイニーカラーズ","code":"SHINYCOLORS"}],
 "event_place":"横浜アリーナ","event_dspdate":"2027年6月5日(土)、6日(日)",
 "event_startdate":1812121200,"event_enddate":1812293940,"event_type":["oth_event"],
 "event_url":"https://idolmaster-official.jp/live_event/sidem_shinycolors_ss/",
 "url":"https://idolmaster-official.jp/live-event/01_19878.html"}
```
detail_page（`_id` 17848）：`{"article_type":"detail_page","title":"283 Production LIVE Performance Uka,","event_url":null,"url_name":"283_Uka","event_place":"オリックス劇場","event_dspdate":"2025年5月10日(土)\n2025年5月11日(日)","event_type":["mr_event"]}` → 来源 `https://idolmaster-official.jp/live_events/283_Uka`

### 1.8 闪耀色彩 51 条（去掉 lp_detail）里需要排除的非演出

变なホテルとアイドルマスター、スタマス スペシャルトーク＆ステージ（ASOBISTAGE 配信）、コミックマーケット102、全国プロデューサー検定、283PRODUCTION COSTUME G@LLERY、愛♡MAX!!!TV（TV）、20th NEW YEAR MEETING & DJ PARTY ×3（大阪、东京、名古屋）、M@STER EXPO、20th special party 等。**没有字段能把它们区分出来**（`event_type` 都是 `oth_event`）。可以只保留在 wikiwiki 里也有、日期能对上的条目（§2.6：51 条里有 41 条能对上，没对上的 10 条正好都是上面这些），或者维护一份排除名单。

### 1.9 官方缺席公告（CMS NEWS，可以作为替代或核对来源）

请求：`idolmaster/Article/list?site=jp&ip=idolmaster&token=…&data={"category":["NEWS"],"brand":["SHINYCOLORS"]}&limit=500&start=…`，共 4176 条，按标题含「見合わせ」筛选：

| 日期 | path | 标题（节选） |
|---|---|---|
| 2026/03/21 | 01_18496 | 「アイマス、アイに行きマス！in イオンモール新居浜」小澤 麗那様（郁田 はるき役）ご出演見合わせ |
| 2026/02/13 | 01_18183 | 「…シャニマス大感謝祭！〜283スポーツフェスティバル〜」川口 莉奈様(斑鳩 ルカ役) ご出演見合わせにつきまして |
| 2024/02/23 | 01_10840 | 「…6thLIVE TOUR Come and Unite!」 近藤玲奈様（風野灯織役）ご出演見合わせ |
| 2022/09/12 | 01_4793 | 「283PRODUCTION UNIT LIVE MUGEN BEAT」 近藤玲奈様（風野灯織役）ご出演見合わせ |
| 2022/04/20 | 01_3863 | 「…4thLIVE 空は澄み、今を越えて。」 近藤玲奈様（風野灯織役）ご出演見合わせ |
| 2021/11/12 | 01_2806 | Xmas Party -Silent night- 三峰結華役 成海瑠奈様のご出演見合わせ |
| 2021/10/15 | 01_2624 | 283フェス 2021 Happy Buffet! 三峰結華役 成海瑠奈様のご出演見合わせ |
| 2021/10/06、08/25 | 01_2576、01_2314 | 生配信番組（不是演出） |

新闻页 `https://idolmaster-official.jp/news/01_18183`（带或不带 `.html` 都是 200）是服务端渲染的，`<title>` 就是标题；`__NEXT_DATA__.props.pageProps.data.content` 是正文 HTML，里面写了具体哪一天：「当初、2月15日(日)のDAY2公演に出演を予定しておりました川口 莉奈様(斑鳩 ルカ役)につきまして…出演を見送らせていただくことといたしました。」`data.categories.subcategory` 里是 `LIVE-EVENT`。

---

## 2. wikiwiki「ライブイベント情報」

### 2.1 页面和访问

| 页面 | 内容 | URL |
|---|---|---|
| `ライブイベント情報` | 「開催予定」+「公演終了(2026年)」 | https://wikiwiki.jp/shinycolors/%E3%83%A9%E3%82%A4%E3%83%96%E3%82%A4%E3%83%99%E3%83%B3%E3%83%88%E6%83%85%E5%A0%B1 |
| `ライブイベント情報/開催情報log03` | 2025 年 | …/ライブイベント情報/開催情報log03 |
| `ライブイベント情報/開催情報log02` | 2023–2024 年 | …/開催情報log02 |
| `ライブイベント情報/開催情報log01` | 2019–2022 年 | …/開催情報log01 |

（`開催情報log04` 在 Wayback 里是 404，目前不存在。新的年份以后可能会加 log04，**主页面「公演終了(過去の公演情報)」下面有这些子页面的链接，可以从那里读取，不要写死页面列表**。）

- 用我们的 UA 直接 GET：**200**，`text/html; charset=utf-8`，Cloudflare 在前面（`cf-cache-status: HIT`，`Cache-Control: public, max-age=600`），支持 gzip。不需要浏览器 UA。
- 源码视图全部不可用（⚠️3）：`?cmd=source&page=`（挑战 403）、`::cmd/source?page=`（封禁 403）、`<page>/::cmd/source`（403）、`?cmd=backup…`（403）。robots.txt 也禁止 `/*?` 和 `/*/::*`。
- 渲染页面大小约 160–220 KB（主页面 163 KB，log01 223 KB）。
- 备用：Wayback `https://web.archive.org/web/2026id_/https://wikiwiki.jp/shinycolors/<页面>` 能取到原始 HTML（最近的快照是 2026-08-24 和 2026-05），返回的内容**是 gzip 压缩的，要解压**。

### 2.2 页面结构（渲染后的 HTML）

- 年份分节：`<h2 id="h2_content_1_0">開催予定</h2>`、`公演終了(2026年)`、`公演終了(2025年)`、`公演終了(2023年分)`…
- **每个演出是一个折叠块**：
  ```html
  <div class="accordion-container ">
      <h3 class="accordion-header"><i …></i><i …></i>
          THE IDOLM@STER SHINY COLORS 6thLIVE TOUR Come and Unite! Fantastic Fireworks
      </h3>
      <div class="accordion-content"> … </div>
  </div>
  ```
  标题可能带状态前缀：`(延期公演) 2ndLIVE STEP INTO THE SUNSET SKY`、`(開催中止) SPRING PARTY 2020`、`(出演見送り) Animelo Summer Live 2021 -COLORS-`、`(トラブルのため出演中止)ナガノアニエラフェスタ2024`、`(悪天候のため出演中止)TOKYO IDOL FESTIVAL 2023`。
- 块内是若干 `<ul class="list1"><li>标签<br />值</li></ul>`，标签依次为 `公演名`（正式全名，**比 h3 更接近 CMS 的 title**）、`出演形態`（`単独ライブ` / `単独xRライブ` / `合同ライブ` / `合同xRライブ` / `ゲスト出演` / `ゲスト出演(xR)` / `単独イベント` / `単独ライブツアー`）、`開催日時`（`<ul class="list2">` 每个 li 一天）、`会場`（`<a class="ext" href="https://wikiwiki.jp/p/cushion?to=<编码后的外链>">会場名</a>`，真实链接也写在 `span[data-href]` 里）、`有料生配信`、`チケット料金`、`出演者`。
- **出演者**：`<ul class="list1"><li>出演者<ul class="list2"><li>2024年4月20日(土)<br />…</li><li>2024年4月21日(日)<br />…</li></ul>`，每个 li 是一个演出日，第一行是日期。li 里面：
  - 组合名是一行 `<strong><span class="wikicolor"…><a href="/shinycolors/アイドルユニット紹介#…">イルミネーションスターズ</a></span></strong><br />`（有的组合是 `<a><span><strong>` 的嵌套顺序），下一行（可能跨多行，以 `/<br />` 续行）是 **「声优名（角色名役）」用 `/` 分隔**：`関根 瞳（櫻木 真乃役）/ 峯田 茉優（八宮 めぐる役）<br />`
  - 分组不一定是正式组合：`Team.Stella / Team.Luna / Team.Sol`、`アール・エ・クルール`、`∑ Desire`、`I'm a Cutie Finder`、`昼公演 / 夜公演`，也可能没有分组标题（「DAY1は個人戦のためユニット表記を省略しています。」）。
  - 非偶像的出演者也在里面：`進行MC` 下面有 `山村 響（七草 はづき役） / 田口 尚平`（はづき是事务员，田口是主持人，没有「役」）。
  - **xR 演出只写角色名，没有声优**：`芹沢 あさひ / 黛 冬優子 / 和泉 愛依`；MR SUPER FESTIVAL 里是 `芹沢 あさひ / 緋田 美琴*2`。
  - 老页面的出演者**不分日期**（1stLIVE 只有组合 + 名单，没有日期 li），表示每天都是同样的阵容。
  - 巡演（3rd TOUR）在折叠块里再用 `<div class="fold-container"><div class="fold-summary">名古屋</div><div class="fold-content">…` 按会场分块，每块有自己的 公演名（`… / NAGOYA`）、会場、開催日時、出演者。
  - 昼夜场（ORCHESTRA -Radiant Chord-）的出演者分节标题是 `昼公演` / `夜公演`，不是日期。
- **合办演出只列闪耀色彩这边的出演者**（MOIW2023、SideM×SC、MR SUPER FESTIVAL 都是这样），实测没有看到其他品牌的出演者。所以「其他品牌出演者不写入」目前基本不会遇到，但遇到对应不上的名字仍然要进报告。
- 「出演者」下面、日期 li 前面可能有更新说明，要跳过：`2024/01/05 出演者追加`、`2024/02/23 <a …data-href="https://idolmaster-official.jp/news/01_10840">出演者変更</a>`、`※出演者は今後変更されることがあります`、`2022/12/14追記 演出プランの確定につき、白石 晴香（園田 智代子役）さまは公演途中までの参加となります。`
- 括号有全角 `（…役）` 和半角 `(…役)` 两种（2022–2023 的页面用半角较多）；`/` 两边有没有空格都有；名字中间有半角空格（`関根 瞳`）；**名字后面可能直接跟脚注标记** `*12`。
- 「ゲスト出演」的演出会注明「シャイニーカラーズの出演日は【7月19日(日)】になります。」，这时「出演者」下面只有那一天。

### 2.3 缺席：脚注语法和实际写法

**写法 A：删除线 + 脚注（只找到 1 处，在主页面）**。渲染后的 HTML：
```html
北原 沙弥香（和泉 愛依役）/ 田嶌 紗蘭（福丸 小糸役）/ <del>川口 莉奈（斑鳩 ルカ役）</del> <a id="notetext_19"  class="note_super tooltip"
    data-tooltip-content="&lt;p&gt;2026/02/13出演見合わせ &lt;a class=&quot;ext&quot; href=&quot;https://idolmaster-official.jp/news/01_18183&quot; …">*19</a>
```
页面底部的脚注区：
```html
<a id="notefoot_19" href="#notetext_19" class="note_super">*19</a>
<span class="small">2026/02/13出演見合わせ <a class="ext" href="https://idolmaster-official.jp/news/01_18183"  rel="nofollow">https://idolmaster-official.jp/news/01_18183<span …></span></a></span><br>
```
- 对应关系：正文里的 `id="notetext_N"` 对应脚注区的 `href="#notetext_N"` / `id="notefoot_N"`；脚注标记**紧跟在出演者名字（或 `</del>`）后面**。`data-tooltip-content` 里也有完整的脚注 HTML（经过 HTML 转义）。
- wiki 源码里对应的应该是 `%%川口 莉奈（斑鳩 ルカ役）%%((2026/02/13出演見合わせ [[https://…]]))`（PukiWiki 语法；实测拿不到源码，这是按渲染结果推断的）。
- 位置：主页面「公演終了(2026年)」→「シャニマス大感謝祭！」→ 2026年2月15日(日) → Team.Luna。
- 注意：**脚注绝大多数不是缺席**。主页面 20 个脚注里 19 个是「2025/12/19追加」「2026/05/14 2日とも開演時間修正」之类的更新记录；log02、log03 的脚注是「2024/08/16 出演者追加 [官方链接]」「出演にあたっては、一部の楽曲のみ参加…」（部分参加，不算缺席）。**要同时满足「`<del>` 划掉」且「脚注含『見合わせ』」才算缺席。**

**写法 B：从名单里删掉 + 附官方链接的说明（较早的缺席都是这样）**：
- 4thLIVE（log01）：
  > 2022/04/20：出演者変更
  > 2022/04/20発表：風野 灯織役の近藤玲奈さんについて：[OFFICIAL WEBリンク](→ https://idolmaster-official.jp/news/01_3863.html)
  > お身内にご不幸があったため、ご出演は見合わせになりました。

  两天的イルミネーションスターズ都只写了 `関根 瞳（櫻木 真乃役）/峯田 茉優（八宮 めぐる役）`，没有近藤。
- MUGEN BEAT（log01）：在 `<blockquote>` 里引用官方文字「…本公演への出演を見合わせることになりました。」，名单里也没有近藤。
- 6thLIVE Fantastic Fireworks（log02）：每天的日期后面写 `2024/02/23 <a …data-href="https://idolmaster-official.jp/news/01_10840">出演者変更</a>`，名单里没有近藤。

**写法 C：从名单里删掉 + 没附链接的说明**：
- 283フェス 2021（log01）：`<strong><span class="wikicolor" style="color:white; background-color:red">2021/10/15：公式より出演者変更のお知らせあり<br class="spacer">※出演者は今後変更されることがあります</span></strong>`（没有链接；官方公告是 news/01_2624，成海瑠奈缺席），名单里没有成海。
- Xmas Party（log01）：成海瑠奈缺席（官方 news/01_2806），wiki 上连说明都没有，名单里直接没有这个人。

**链接域名**：脚注里的链接是直接外链（`<a class="ext" href="https://…">`）；正文里的外链经过 `https://wikiwiki.jp/p/cushion?to=<URL 编码>` 中转，真实 URL 也在 `data-href` 里。四个页面的外链统计：`idolmaster-official.jp/news/…` 76 处、`idolmaster-official.jp/live_event/…` 66 处、`x.com/shinyc_official` 12 处、`x.com/imas_official` 4 处、`idolmaster.jp/blog` 4 处、`idolmaster-official.jp/live_events/…` 6 处，还有各会场和外部演出的官网。新闻链接有两种形式：`news/01_3863.html`（老）和 `news/01_18183`（新），实测都是 200。「官方新闻链接」可以认定为 `idolmaster-official.jp/news/`（再加上旧站 `idolmaster.jp/blog/`）；实测没有看到 `shinycolors.idolmaster-official.jp` 或 lantis 的缺席链接。X（`x.com/shinyc_official`、`x.com/imas_official`）的链接用于「出演者追加」和时间变更，**要不要把 X 算作官方链接需要决定**。

### 2.4 与 CMS 对应

- 名称差异举例（wiki h3 → CMS title）：`4thLIVE 空は澄み、今を越えて。` → `THE IDOLM@STER SHINY COLORS 4thLIVE 空は澄み、今を越えて。 `（末尾有空格）；`(延期公演) 2ndLIVE STEP INTO THE SUNSET SKY`；`リスアニ ！LIVE 2023` → `リスアニ！LIVE 2023（出演：ストレイライト）`；`異次元フェス アイドルマスター ラブライブ！歌合戦` → `異次元フェス アイドルマスター★♥ラブライブ！歌合戦`；`283 Production LIVE Performance Uka` → `…Uka,`；`騎士団のヴェール -Veil of Order-` → `騎士団のヴェール – Veil of Order –`（连字符不同）；`shiny the first REFRAC7IONS " Still blue "` → `shiny, the first REFRAC7IONS " Still blue "`；`283PRODUCTION Solo Performance LIVE 「我儘なまま」` → `283PRODUCTION SOLO PERFORMANCE LIVE「我儘なまま」`。块内的 `公演名` 更接近，但也不完全一致。**按名称匹配不可靠。**
- **按日期匹配是可行的**：用 CMS 的 `event_startdate`（JST 日期）去对 wiki `開催日時` 里出现的任意日期，CMS 闪耀色彩 51 条（去掉 lp_detail）里有 **41 条对上了**，没对上的 10 条全是非演出（§1.8）。6thLIVE 大阪 / 横滨、7th UNITLIVE 四个会场都能一对一对上。需要注意的情况：
  - 延期公演：wiki 块里同时写了原定日期和延期后的日期（「(延期公演) バンダイナムコエンターテインメントフェスティバル 2nd」块里最早的日期是原定的 2021-02-06，CMS 里是延期后的 2022-05-14），要用 CMS 的日期去对，不能反过来。
  - 同一天可能有两场不同的演出（目前没遇到，但 リスアニ、アニサマ 这类嘉宾演出可能和 CMS 条目同一天），最好再加上会场或名称的模糊相似度作为第二个条件。
  - wiki 独有的：嘉宾出演（リスアニ、アニサマ、TIF、KIMCHIKURA、BILIBILI、Animethon 等）和 2019–2020 年的演出。按 spec 的「演出列表以 CMS 为准」，这些不会进资料（2019 年那几场会因此丢失，见 ⚠️2）。
- 有 4 个 wiki 块的 `開催日時` 不在标准的 list2 结构里，我的正则没取到日期（KIMCHIKURA 03、BNEF 2019、ランティス祭り2019、1stLIVE），解析器要能处理 `2019年3月9日（土）\n　開場…` 这种纯文本写法。

### 2.5 未来场次

「開催予定」里实测有 5 场：Master ShowPiece（2026-09-26/27，实测时刚结束但还在这一节）、REFRAC7IONS（2026-12-19/20）、ORCHESTRA -Radiant Chord-（2027-03-22 昼夜）、**283 Production LIVE Performance noctchill（2027-03-27/28，CMS 里还没有）**、SideM×SC SPARKLE SHOWDOWN（2027-06-05/06）。都已经写了逐日的出演者。「開催予定」这一节**不按日期移动**（结束了的演出要等编辑手动移到「公演終了」），所以不能靠所在的节来判断是否已举办。另外 2026-08-24 的 Wayback 快照里，Master ShowPiece 的 開催日時 第二天写成了 `2025年9月27日(日)`（年份写错，应为 2026；实测时的在线页面已经改正），**wiki 的日期不能当真值，只能用来匹配**。

---

## 3. 可以直接照抄进假站点测试的最小样例

**token**（`GET /sitern/api/cmsbase/Token/get`）：
```json
{"statusCode":200,"data":{"token":"0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef","limit":1790579592,"time":0}}
```
**token 无效时**（HTTP 200）：
```json
{"statusCode":404,"data":false}
```
**列表**（`GET /sitern/api/idolmaster/Article/list?site=jp&ip=idolmaster&token=…&data={"category":["LIVE-EVENT"]}&limit=2&start=0`）：
```json
{"statusCode":200,"data":{"apiStatus":true,"total_count":3,"start":0,"limit":2,"count":2,"time":0,"article_list":[
 {"_id":"1712","article_type":"url_link","title":"THE IDOLM@STER SHINY COLORS 2ndLIVE STEP INTO THE SUNSET SKY",
  "brand":[{"name":"シャイニーカラーズ","code":"SHINYCOLORS"}],"event_place":"幕張メッセ国際展示場1~3ホール",
  "event_dspdate":"2021年3月20日（土）16:00開場／18:00開演(予定)\n2021年3月21日（日）16:00開場／18:00開演(予定)",
  "event_startdate":1616166000,"event_enddate":1616338800,"event_type":["oth_event"],
  "event_url":"https://idolmaster-official.jp/live_event/shinycolors_2nd/","url_name":null,"path":"01_832",
  "url":"https://idolmaster-official.jp/live-event/01_832.html"},
 {"_id":"23494","article_type":"url_link","title":"THE IDOLM@STER SideM × SHINY COLORS SPARKLE SHOWDOWN",
  "brand":[{"name":"SideM","code":"SIDEM"},{"name":"シャイニーカラーズ","code":"SHINYCOLORS"}],"event_place":"横浜アリーナ",
  "event_dspdate":"2027年6月5日(土)、6日(日)","event_startdate":1812121200,"event_enddate":1812293940,"event_type":["oth_event"],
  "event_url":"https://idolmaster-official.jp/live_event/sidem_shinycolors_ss/","url_name":null,"path":"01_19878",
  "url":"https://idolmaster-official.jp/live-event/01_19878.html"}
]}}
```
第二页（`start=2`）再放一条其他品牌的，例如 `"brand":[{"name":"SideM","code":"SIDEM"}]`，用来测本地筛选。

**wiki 页面**（`GET /shinycolors/ライブイベント情報`，只保留解析器需要的部分）：
```html
<h2 id="h2_content_1_0">開催予定</h2>
<div class="accordion-container ">
    <h3 class="accordion-header">
        <i class="fa-solid fa-plus-square hidden-on-open"></i>
        <i class="fa-solid fa-minus-square visible-on-open"></i>
        THE IDOLM@STER SideM × SHINY COLORS SPARKLE SHOWDOWN
    </h3>
    <div class="accordion-content"><ul class="list1"><li>公演名<br />
THE IDOLM@STER SideM × SHINY COLORS SPARKLE SHOWDOWN</li></ul>
<ul class="list1"><li>出演形態<br />
合同ライブ</li></ul>
<ul class="list1"><li>開催日時
<ul class="list2"><li>2027年6月5日(土) 16:00開場／17:30開演</li>
<li>2027年6月6日(日) 16:00開場／17:30開演</li></ul></li></ul>
<ul class="list1"><li>会場<br />
<a class="ext" href="https://wikiwiki.jp/p/cushion?to=https%3A%2F%2Fwww.yokohama-arena.co.jp%2F" rel="nofollow">横浜アリーナ<span class="system-icon ext pukiwiki-open-uri" data-href="https://www.yokohama-arena.co.jp/" data-frame="_blank"></span></a></li></ul>
<ul class="list1"><li>出演者
<ul class="list2"><li>2027年6月5日(土)<br />
<strong><span class="wikicolor" style="background-color:orange"><a href="/shinycolors/%E3%82%A2%E3%82%A4%E3%83%89%E3%83%AB%E3%83%A6%E3%83%8B%E3%83%83%E3%83%88%E7%B4%B9%E4%BB%8B#de265f30" title="アイドルユニット紹介" class="rel-wiki-page">放課後クライマックスガールズ</a></span></strong><br />
河野 ひより（小宮 果穂役）/ 永井 真里子（西城 樹里役）/<br />
丸岡 和佳奈（杜野 凛世役）/ 涼本 あきほ（有栖川 夏葉役）
<div class="spacer">&nbsp;</div></li>
<li>2027年6月6日(日)<br />
2027/05/01 <a class="ext" href="https://wikiwiki.jp/p/cushion?to=https%3A%2F%2Fidolmaster-official.jp%2Fnews%2F01_99999" rel="nofollow">出演者変更<span class="system-icon ext pukiwiki-open-uri" data-href="https://idolmaster-official.jp/news/01_99999" data-frame="_blank"></span></a><br />
関根 瞳（櫻木 真乃役）/ <del>近藤 玲奈（風野 灯織役）</del> <a id="notetext_1"  class="note_super tooltip" data-tooltip-content="&lt;p&gt;2027/05/01出演見合わせ &lt;a class=&quot;ext&quot; href=&quot;https://idolmaster-official.jp/news/01_99999&quot;&gt;https://idolmaster-official.jp/news/01_99999&lt;/a&gt;&lt;/p&gt;">*1</a>/ 峯田 茉優（八宮 めぐる役）<br />
<del>八巻 アンナ（白瀬 咲耶役）</del> <a id="notetext_2"  class="note_super tooltip" data-tooltip-content="&lt;p&gt;2027/05/02出演見合わせ&lt;/p&gt;">*2</a>/ 結名 美月（幽谷 霧子役）*3/ 某 声優（他ブランド 役）</li></ul></li></ul>
<p>詳細は、<a class="ext" href="https://wikiwiki.jp/p/cushion?to=https%3A%2F%2Fidolmaster-official.jp%2Flive_event%2Fsidem_shinycolors_ss%2F" rel="nofollow"><strong>公式サイト</strong></a>へ</p>
</div>
</div>
<!-- 页面底部的脚注区 -->
<a id="notefoot_1" href="#notetext_1" class="note_super">*1</a>
<span class="small">2027/05/01出演見合わせ <a class="ext" href="https://idolmaster-official.jp/news/01_99999"  rel="nofollow">https://idolmaster-official.jp/news/01_99999<span class="system-icon ext pukiwiki-open-uri" data-href="https://idolmaster-official.jp/news/01_99999" data-frame="_blank"></span></a></span><br>
<a id="notefoot_2" href="#notetext_2" class="note_super">*2</a>
<span class="small">2027/05/02出演見合わせ</span><br>
<a id="notefoot_3" href="#notetext_3" class="note_super">*3</a>
<span class="small">2027/04/01追加</span><br>
```
（*1 附了官方链接的缺席要生效；*2 没附链接的不生效、进报告；*3 是普通更新记录，不能当缺席；`某 声优（他ブランド 役）` 对应不上偶像名单，进报告。）xR 演出的出演者行可以用 `芹沢 あさひ / 黛 冬優子 / 和泉 愛依`。

---

## 4. 写解析器时要注意的坑

1. **CMS 的错误藏在 body 里**：token 无效时是 HTTP 200 + `{"statusCode":404,"data":false}`；要检查 `statusCode==200` 和 `data.apiStatus`，否则会把空结果当成「没有演出」然后覆盖掉资料文件。
2. **token 1 小时过期**；导入一次只需要几次请求，每次运行都重新取就行。
3. **分页**：默认 `limit` 是 100，一定要循环 `start += count`，直到 `start >= total_count` 或 `count == 0`；也可以直接用 `limit=500` 一次取完，但仍要核对 `count == total_count`。
4. **`data` 是 URL 里的 JSON 字符串**，要 `json.dumps` 后再 URL 编码；品牌代码区分大小写，只能是 `SHINYCOLORS`。
5. **品牌按 `brand[].code` 比较**，不要用 `name`（同一个代码的 name 会变）。
6. **LIVE-EVENT 里有很多非演出**（lp_detail 51 条、酒店合作、检定考试、TV、DJ PARTY…），要排除：至少去掉 `lp_detail` 和 `event_startdate` 为 null 的，剩下的靠「wiki 里也有」或排除名单来判断。
7. **不能用 `url` 字段当来源**（全部 404）；来源按 article_type 生成：url_link→`event_url`（可能是外部站点，也可能有 `//` 双斜杠），detail_page→`https://idolmaster-official.jp/live_events/{url_name}`。
8. **演出日要从 `event_dspdate` 解析**，不能用 start/end 的范围推算（巡演一条记录跨两个月；enddate 有时是末日 00:00）。要处理「、6日(日)」「・25日(土)」这类省略年月的写法、`2023年 2月`、`(月･祝)`、`DAY1：`、`名古屋：`（多会场）、昼夜场、以及结尾的 `※…` 备注。时间戳要按 JST 解释。
9. **同一巡演可能是一条也可能是多条**（3rd TOUR 一条三个会场；6th 两条共用一个 `event_url`；7th 每个会场一条）。按 `_id` 去重，不要按 `event_url`。
10. **CMS 缺 2020-09 以前的演出，新公布的场次也可能还没进来**（noctchill 2027-03 就是这样）。要决定是接受这个缺口，还是补一个来源（旧站 `idolmaster.jp/event/{年}.php`），或者把「wiki 有、CMS 没有、而且是闪耀色彩单独演出」的列进导入报告。
11. **wikiwiki 只能抓 HTML**：源码视图被 Cloudflare 封；遇到维护会返回 503。抓取失败就整体报错退出（符合 spec）。页面按年份拆成多页，子页面列表从主页面的链接读取。
12. **wiki 的出演者解析**：按 `<br />` 分行，续行以 `/` 结尾；用 `([^（(/]+?)\s*[（(]\s*(.+?)役\s*[）)]` 取「声优（角色役）」，全角和半角括号都要支持；要去掉末尾的 `*N` 脚注标记和 `<del>`；组合名行、`進行MC`、`Team.xxx`、`昼公演`、「※…」、「YYYY/MM/DD 出演者追加」这类行要跳过。**xR 演出只有角色名**，需要能按「角色名」直接对应偶像；`七草 はづき`（事务员）和没有「役」的主持人不是偶像。
13. **日期 li 可能不存在**（老页面不分日期 = 每天都一样），也可能是 `昼公演/夜公演`（同一天两场），或者按会场放在 `fold-container` 里。嘉宾出演只写闪耀色彩出场的那一天。
14. **缺席的判断**：只有「`<del>…</del>` + 紧跟的 `note_super` 脚注里含『見合わせ』」才算脚注缺席；链接从脚注区 `#notetext_N` 对应的 `<span class="small">` 里的 `<a href>` 取（正文里的链接要从 cushion 的 `to=` 参数或 `data-href` 里还原）。大多数脚注是「追加」「時間修正」，不是缺席。**更早的缺席已经从名单里删掉了**，wiki 上看不出来，导入器也不会误把这个人算作出演。反过来，如果只看「附链接的脚注」，就漏不掉也多不出东西；但如果想在报告里列出「没附链接的缺席说明」，需要另外识别 `出演者変更`、`見合わせ` 这类说明行。
15. **「官方新闻链接」的判定**：`idolmaster-official.jp/news/`（有 `.html` 和没有 `.html` 两种）是主要的；`x.com/shinyc_official`、`x.com/imas_official` 算不算官方链接需要在 spec 里写清楚。CMS NEWS 里的「ご出演見合わせ」公告可以作为核对（标题包含演出名和声优名，正文写了具体哪一天）。
16. **wiki 的日期可能写错**（Master ShowPiece 第二天曾被写成 2025 年，后来才改正），标题可能带 `(延期公演)`、`(開催中止)`、`(出演見送り)` 这类前缀：中止或见送的演出不能算她上过的舞台；延期的块里新旧日期都有。**日期以 CMS 为准，wiki 只用来匹配和取出演者。**
17. **与 CMS 的匹配**：用「CMS 的某个演出日 ∈ wiki 块里的日期集合」来匹配，名称只作为辅助；多会场的 CMS 记录要按会场把 wiki 的 fold 块拆开分别对应。
18. **HTML 实体和空白**：标题里有 `&amp;`、全角空格 `　`、弯引号 `“”`、`–` 和 `-` 混用；比较前要先做 `html.unescape` 和空白归一化。
