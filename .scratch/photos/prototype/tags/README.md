# 28 位偶像的照片 tag 初稿（票 13）

票：`.scratch/photos/issues/13-character-photo-tags.md`。规格见 `.scratch/photos/spec.md`「角色配置」和「拼提示词」。
依据是票 05「原型：外貌一致性」的 Answer（`prototype/photos-appearance` 分支）。

## 交付

- `draft.json`：28 位的 `photo_tag`（角色 tag）和 `photo_appearance`（外貌 tag）初稿，机器可读，校对和写进配置都用它。
- `contact_sheet.png`：28 张默认衣装缩略图的拼版，编号和下面的对照表一致，校对时对照着看。是原作立绘，不进仓库（ADR-0003），用 `python review_table.py` 在本地生成。
- 票 13 的 Comments 里是给用户逐行校对的 Markdown 表。

`photo_appearance` 只写发色、发型、瞳色，不写饰物、服装和身材——这些随衣装和情境变，照片说明里由她自己写。

## 怎么核过的

初稿是对着 `characters.toml` 里每位 `default_outfit` 指的那张缩略图（`corpus/stand/thumbnails/<stand|stand_costume>/<enzaId>.png`）写的，不是凭记忆：

1. `face_sheet.py` 按 alpha 通道求人物矩形、取头部拼成大图，逐位看发色、发型和瞳色（缩略图里眼睛只有十几个像素，放大看才靠谱）；
2. `danbooru_related.py` 查 Danbooru 上和角色 tag 共现最多的外貌 tag 做交叉参考（不能直接用，团体图会混进别人的特征）；
3. `verify_draft.py` 用官方 tag 建议接口逐条核对每个 tag 都是已知 tag（V5 Curated 和 V4.5 Curated 两个模型各一遍），并检查写法、去重、正好一条瞳色、没混进非外貌 tag，以及 id、罗马字、默认衣装和 `characters.toml` 对得上。

角色 tag 的写法是 `name_romaji` 转小写（`Sakuragi Mano` → `sakuragi mano`），28 位都在 V5 Curated 和 V4.5 Curated 的 tag 建议接口里是已知 tag。规格要求另存一项而不是从 `name_romaji` 推，因为新角色不一定对得上 Danbooru 的写法；这一版恰好都能对上，所以脚本只核「它是已知 tag」，不把「等于罗马字转小写」当成必须成立的条件。词表用短音写法：查 `oosaki amana`、`saijou juri`、`yuukoku kiriko` 时，建议接口给出的是 `osaki amana`、`saijo juri`、`yukoku kiriko`，和罗马字一致。

## 脚本（都能重跑，只用标准库 + Pillow）

| 脚本 | 用途 |
|---|---|
| `verify.py` | 核对一批 tag 是不是某个模型词表里的已知 tag（要完全相同） |
| `character_tags.py` | 核对 `draft.json` 里 28 位的角色 tag |
| `verify_draft.py` | 核对 `draft.json`：id 和配置对得上、写法合规、外貌只含发色发型瞳色、每条 tag 已知（`--offline` 跳过联网那步） |
| `face_sheet.py` | 按 alpha 位置裁出每位缩略图的头，拼成大图逐位看发色、发型、瞳色 |
| `danbooru_related.py` | Danbooru 共现 tag，写初稿时的参考 |
| `review_table.py` | 重出对照表和 `contact_sheet.png` |
| `dump_draft.py` | 把初稿逐位打出来 |
| `thumbnails.py` | 上面几个脚本共用的配置和初稿读取、缩略图合成 |

```sh
cd .scratch/photos/prototype/tags
python verify_draft.py            # 联网核对全部 68 条 tag（每人角色 tag + 外貌 tag）
python verify_draft.py --offline  # 只查完整性、写法和分类
python review_table.py            # 重出对照表
python face_sheet.py              # 重出脸部对照图
```

脚本之间互相 import（`verify_draft` 从 `verify` 取 `known`，几个拼图脚本从 `thumbnails` 取缩略图和配置），所以要在 `tags/` 目录里跑。输出按 UTF-8 打印，Windows 控制台默认的 GBK 不会把中文和 `✓` 打崩。

`face_sheet.py` 的中间图写到 `.scratch/_faces/`，已在 `.gitignore` 里、不进仓库（跑完随手删掉即可，重跑脚本就会再生成）；`contact_sheet.png` 也一样不进仓库。

## 校对要点

- 五位（真乃、あさひ、夏葉、智代子、はるき）照票 05 的定稿原样用，这次没有改动。其余 23 位是初稿，最需要看的是**瞳色**（缩略图里最容易被高光带偏）和**发色偏哪一档**（灰棕算 `grey hair` 还是 `brown hair`）。
- 一位可以有不止一处发型 tag（马尾、丸子头、双马尾、刘海），只要都对、都在词表里。写多了不会变差，但会抢权重，别把帽子、发饰写成外貌。
- 存疑的看 `draft.json` 里对应那一行，改 `photo_appearance` 后重跑 `verify_draft.py` 确认还是已知 tag。

## 还没做

- 写进 `characters.toml` 的两个字段（`photo_tag`、`photo_appearance`）由票 14 加进配置格式；票 13 说明 14 合进来以后再写。现在 `feat/photos` 上没有这两个字段，所以这份初稿暂时只在 `draft.json` 里。
