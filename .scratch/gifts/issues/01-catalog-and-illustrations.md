# 01: 礼物目录、插画和读目录接口

**What to build:** 仓库里有一份礼物目录：19 件通用礼物，分四类、三档稀有度，像角色一样由维护者在配置里维护，启动时读入并校验，写错了起不来。每件礼物都有一张「柔和平涂」的生成插画，附 CREDITS 说明。前端能从读目录接口拿到每件礼物的 `id`、名字、类别、稀有度、是否下架，拿不到哪位角色喜欢什么。礼物的加分、抽奖概率和次数常量放进好感度的数值模块。见规格「礼物目录和喜好」的目录、清单、校验、插画、DESIGN.md 例外和「加分和概率放在好感度的数值模块里」。

**Blocked by:** None (can start immediately)

**Status:** resolved

- [x] 礼物目录是一份 TOML 配置，放在角色配置旁边：每件有 `id`（小写字母、数字、`-`、`_`，和插画文件名一致）、`name`、`category`（吃的、饮品、花草、小物件）、`rarity`（普通、少见、稀有），可选的 `retired`（默认否）；内容是规格清单里的 19 件（普通 9、少见 7、稀有 3）
- [x] 启动时读入、校验：`id` 不重复、格式合法；类别、稀有度在取值范围内；每一档至少有一件没下架的礼物。任何一条不满足应用就起不来。后台和 `.env` 都不能改目录
- [x] 加分和概率常量和好感度的其他常量放在同一个模块里，写进它的模块说明：普通 +3、少见 +5、稀有 +7、喜欢的再 +3、冷却中每件最多 +3；抽奖次数每天 1、最多攒 7；概率重置卡 1、普通 69、少见 25、稀有 5（百分比）
- [x] 19 张插画，webp，512px，透明底，进 git，放在前端静态资源的礼物插画目录，文件名就是礼物 `id`；每张控制在几十 KB。原型分支 `prototype/gifts-page` 上「柔和平涂」的布丁、热可可、花束、毛绒玩偶 4 张直接用，另外 15 张按规格里的提示词骨架生成，画风要和那 4 张一致
- [x] 照落地页手机素材的做法附一份 CREDITS：写明插画是生成的、用了哪个提示词骨架、原型来的 4 张是哪几张
- [x] 一条仓库检查测试，照「角色头像大小」那条写：目录里每件礼物都有同名插画、大小没超上限；插画目录里也没有目录之外的多余文件
- [x] 读目录接口：要求已登录、已同意条款，返回每件礼物的 `id`、名字、类别、稀有度、是否下架，**不返回**任何角色喜欢什么；接口风格跟着现有接口走
- [x] `DESIGN.md` 在 The Library Icon Rule 后面加一条例外「礼物插画不算界面图标」：礼物页、抽奖结果、送礼面板里的礼物用插画；按钮、导航、对话事件分隔线、对话列表的最后一句仍然只用 Lucide；重置卡不是礼物、没有插画，用 Lucide 票券图标
- [x] 走接口的测试：读目录返回 19 件、字段齐全、不带喜好；测试用的目录写错时（`id` 重复、类别或稀有度不合法、某一档全部下架）应用起不来

## Comments

- 目录在 `characters/gifts.toml`（和 `characters.toml`、`readings.toml` 放在一起，生产环境随 `./characters` 一起挂进容器）。类别和稀有度在配置和接口里用英文代码：类别 `food`（吃的）、`drink`（饮品）、`flower`（花草）、`trinket`（小物件），稀有度 `common`（普通）、`uncommon`（少见）、`rare`（稀有）；配置文件开头的注释写了对照，前端显示中文名时照它映射。
- 礼物 `id`：`cake`、`ice-cream`、`pudding`、`chocolate`、`candy`、`meat-bun`、`wagashi`、`black-tea`、`coffee`、`milk-tea`、`cocoa`、`honey-drink`、`bouquet`、`potted-plant`、`preserved-flower`、`book`、`music-cd`、`plush`、`jewelry`。票 02 写角色喜欢的礼物时用这些。
- 加载在后端 `gift_catalog.py`（`load_gift_catalog`，错误是 `GiftCatalogError`，属于 `RuntimeError`），由 `assembly.build` 读进 `Backend.gifts`；缺文件也起不来。测试的角色配置目录默认带一份仓库里的 `gifts.toml`（`tests/conftest.py` 的 `CharacterConfig`），测试自己写的会盖掉它。
- 读目录接口是 `GET /api/gifts/catalog`（`gifts_api.py`），返回 `[{"id", "name", "category", "rarity", "retired"}]`，按配置顺序，下架的也列出。读礼物状态、抽奖这些接口留给票 03、04，放在 `/api/gifts` 下。
- 常量在 `affinity.py`：`GIFT_STEPS`、`LIKED_GIFT_STEP`、`COOLDOWN_GIFT_STEP`、`DRAWS_PER_DAY`、`MAX_DRAWS`、`DRAW_ODDS`（键是 `reset_card` 和三档稀有度，值是百分比）。
- 插画在 `frontend/public/gifts/<id>.webp`，CREDITS 是同目录的 `CREDITS.md`；仓库检查要求 512×512、不超过 64 KB，目录里除 `CREDITS.md` 外没有多余文件。15 张新图用 gpt-image-2.5 生成，16–44 KB。
