# 05: 原型：外貌一致性

Type: prototype
Status: resolved
Blocked by: 01, 03

## Question

照片里的人得一眼认出是她。拿几位外貌差异大的偶像（例如櫻木真乃、芹沢あさひ、有栖川夏葉、园田智代子，再加一位冷门的），对比几种做法生成的效果：

- 只写 danbooru 角色名 tag（加作品 tag）；
- 角色名 tag 加手写的外貌 tag（发型、发色、瞳色、标志性饰物）；
- 拿存储桶里的立绘或衣装缩略图当角色参考图：只有 V4.5 有（V5 没有），每张多 5 Anlas 且不算 Opus 免费，还要看中转支不支持；
- V5 Curated、V5 Full 和 V4.5 之间的差别（全年龄倾向 V5 Curated，见「NovelAI 官方图像 API 现状」）。

每种做法每人生成几张不同情境（自拍、事务所、外景、便服和演出服），放进一个对比页给用户看。用户判断哪种够像、冷门角色靠什么兜底。结论决定角色配置里要为每位角色存什么（tag 字符串、参考图、两者都要），以及 28 位怎么整理出来（人工写还是先生成初稿再校对）。

生成的图不进仓库，也不进存储桶；对比页放在 `prototype/photos-appearance` 分支，图片放在仓库外的目录。

## Comments

- 「准备测试用的中转地址和 key」已经测通（见那张票的 Answer）：用 `.env.novelai` 里的中转，走 A 形态 `{base}/ai/generate-image`，参数全部生效，同种子能复现，适合做对比；探测脚本 `E:/tmp/nai-probe/probe.py` 可以改着用。B 形态不认种子，别用来做对比。参考图支不支持还没试。
- 「调研：NovelAI 提示词写法」（`research/novelai-prompting` 分支）实测：V5 Curated 上櫻木真乃只写角色 tag、不写外貌 tag，8 张的发色、瞳色、发型都对；社区也有人说版权角色再叠外貌 tag 会和角色名打架。对比时一定要包括「只写角色 tag」这一档。提示词的结构已由「拍板：怎么触发、谁来写提示词」定下（固定前缀 `1girl, solo, 角色 tag, idolmaster shiny colors, 外貌 tag`，加上她写的分栏），对比时按这个结构拼。画风不在这张票里比，交给「原型：画风」，所以这里都不加画风 tag。

## Answer

2026-10-17 用户看对比页定下。原型在 `prototype/photos-appearance` 分支（提交 `bfbb9ec`）的 `.scratch/photos/prototype/appearance/`：生成脚本、对比页生成器、Danbooru 共现 tag 查询，以及实际生成的 41 张的提示词记录。图和对比页在仓库外的 `E:/tmp/nai-appearance/`（`index.html`）。

**比了什么**：五位偶像是真乃、あさひ、夏葉、智代子，冷门的选了郁田はるき。冷门按 Danbooru 帖子数算，28 位里她最少，只有 499 帖；最多的是円香，5977 帖。情境四个：自拍·咖啡店·便服、别人拍·事务所、别人拍·外景·全身、别人拍·舞台·演出服。种子按情境固定，提示词按「拍板：怎么触发、谁来写提示词」的结构拼，没加画风 tag，负面用 `nsfw` 加 Human Focus 预设。原计划比五种做法，每种 20 张、共 100 张。跑到第 34 张时用户叫停，担心额度烧完，最后只把 V5 Curated 的两种做法比完整（各 20 张），共 41 张。

**结论**

- **模型：V5 Curated。** V5 Full、V4.5 只写角色 tag、V4.5 加参考图这三档没比：V5 Curated 已经够像，用户决定不再花额度。
- **角色配置里每位存两样：角色 tag，和一串外貌 tag。** 不存参考图。
  - 只写角色 tag 时，5 位的发色、发型、瞳色都对；最冷门的はるき也认得出来，连头上的小蝴蝶结都画了。
  - 加上外貌 tag 后，智代子事务所那张丢掉的双丸子头回来了（只写角色 tag 时变成了低双马尾）。其余的图基本没变，夏葉写了 `wavy hair`，卷发更明显。
  - 没有一张因为加了外貌 tag 变差，社区说的「版权角色叠外貌 tag 会和名字打架」这次没出现。外貌 tag 当兜底，防止丢掉标志性的发型。
- **外貌 tag 只写发色、发型、瞳色**，不写饰物和服装，因为它们随衣装变。这次用的写法：
  - 真乃 `brown hair, medium hair, brown eyes`
  - あさひ `grey hair, short hair, blue eyes`
  - 夏葉 `orange hair, long hair, wavy hair, swept bangs, grey eyes`
  - 智代子 `brown hair, double bun, twintails, red eyes`
  - はるき `brown hair, short hair, yellow eyes`
- **28 位怎么整理**：代理对着存储桶里默认衣装的缩略图写初稿，参考 Danbooru 共现 tag（`related.py`），再用官方 tag 建议接口核对每个 tag 都是已知的，最后交用户校对。Danbooru 的共现 tag 不能直接用，团体图里会混进别人的特征（はるき的共现 tag 里有 `blue hair`、`blonde hair`、`streaked hair`）。
- **角色 tag**：28 位的 `name_romaji` 转小写，在 V5 Curated 和 V4.5 Curated 的 tag 建议接口里都是已知的角色 tag（包括 `saijo juri`、`osaki amana`、`osaki tenka`、`ikaruga luca`）。规格里是另存一项，还是从 `name_romaji` 推出来，由「写规格」时定。建议另存，因为 Danbooru 的写法和我们的罗马字规则不是同一件事，新角色不一定对得上。

**顺带测到的**

- 用户的中转支持 V4.5 的角色参考图（`director_reference_*`，PNG 元数据里全部生效，出的脸和缩略图很像）。缩略图铺上白底，补黑边成 1024×1536 就能用。以后要用参考图，中转这边不是障碍。
- 舞台那张用的是通用的 `idol clothes`，五位穿的是同一套演出服，和原作的衣装无关。这在意料之中，「衣装 → tag」对照表已经不做了。
- 单张 7–15 秒（并发 3 张时偏慢）。
