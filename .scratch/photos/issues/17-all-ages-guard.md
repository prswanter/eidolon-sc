# 17: 全年龄守卫

**What to build:** 不管她写了什么，发给生图服务的提示词里都不会有越界的 tag：服务器清洗她写的三栏，把同义词改成模型认识的写法，剥掉撞上黑名单的 tag，剩下的照常生成。她的照片说明里写明哪些不拍。管理者能在运行记录里看到她多常撞线（只看类别和个数，看不到 tag 原文）。规格见 `../spec.md`「拼提示词」的清洗、黑名单和本地 tag 表，以及 ADR-0023。

**Blocked by:** 14, 15

**Status:** done

- [x] **本地 tag 表**：开发时用官方 tag 建议接口（按模型返回），批量生成白名单和改写表（比如 `v sign` 改成 `peace sign`、`casual outfit` 改成 `casual`）。表和生成脚本都进仓库，脚本以后能重跑。运行时只查这份表，不调建议接口，不用 Danbooru 词表。
- [x] **黑名单**：
  - 从票 06 的代表词出发，用官方建议接口（V5 Curated）补全同义和相近的 tag。
  - 类别是裸露和半裸、内衣和情趣服装、透视和走光、洗澡场景、性化的镜头和姿势、性化的表情。
  - 外貌（发色、瞳色、发型、身材）和画风、画师 tag 也挡掉。
  - 泳装、睡衣、`lying`、`on bed`、`sleeping`、泳池、海边放行。
  - 写死的负面细项逐个核对是已知 tag。
- [x] **清洗**：
  - 剥掉语法字符（`{}`、`[]`、`::`、`|`、`#`、引号、`Text:`、数字权重），转小写，下划线换空格，去重，每栏超量截断。
  - 查改写表；查不到的 tag 保留并写日志。
  - 撞上黑名单的只剥掉那一个；某栏剥空了补默认值：服装补 `casual`，地点补 `indoors`，动作补 `smile`。不算失败。
- [x] **运行记录**：在那次生图调用上记下剥掉了几个、各属于黑名单哪一类，不记她写的其他 tag。
- [x] **照片说明**：照片说明里写明哪些不拍；越界时她可以推掉，也可以换成全年龄的版本再拍。
- [x] 部署者和用户都改不了负面词和黑名单，后台不出这几项。
- [x] **测试**：
  - 从假生图服务记下的请求体看：语法字符被剥、大小写、去重、截断、改写表生效。
  - 每一类黑名单的代表词被剥掉，放行的泳装、睡衣、躺床照样在。
  - 剥空补默认；外貌和画师 tag 被剥。
  - 运行记录里有剥掉的类别和个数，没有 tag 原文。
- [x] `uv run pytest`、`uv run pyright` 全部通过。

## Comments

**14 留下的（2026-10-17）。** 清洗在 `backend/src/eidolon/photo_prompt.py`：`_cleaned` 剥语法字符、转小写、下划线换空格，`_field` 去重、截断、剥空补默认，`read_tag` 读各栏。改写表和黑名单接在 `_field` 里（查表、剥掉、按类别计数）。照片说明在 `photos.py` 的 `CAN_SEND`，已经写了一句「不拍裸露、内衣、透视、走光、洗澡，也不拍性感的姿势、表情和镜头」，按这张票的黑名单类别再对一遍。验收时真的对话模型写了 `slight tilt of head`、`looking at camera` 这种不是 tag 的写法，改写表要能接住。

**做完了（2026-10-17）。** 跑过 `uv run pyright`、`uv run ruff check`、`npm run typecheck` 和单个测试文件（`test_photo_all_ages.py`、`test_photos.py`、`test_photo_records.py`、`test_photo_failures.py`、`test_activity_records.py`、`test_cost_estimate.py`、`test_service_call_models.py`、`test_call_records.py`、`test_database.py`，前端 `dashboard.test.ts`）；完整的 `uv run pytest` 留给合并后的主会话，所以最后一项没勾。

- tag 表在 `backend/src/eidolon/photo_tags.json`（随包发布，`uv build` 出的 wheel 里有），生成脚本是 `backend/scripts/photo_tags.py`（`cd backend && uv run python scripts/photo_tags.py`，`--review` 列出黑名单种子附近还没挡也没放行的建议）。按 V5 Curated 的建议接口生成：已知 4314 个、改写 120 条、放行 28 个，黑名单九类。一遍约一千次请求，每次停 0.3 秒，二十来分钟；连接断了会等一会儿再试。
- 黑名单分两种：`tags` 要完全相同，`words` 在 tag 里按整词出现就挡（`bra` 挡 `white bra`，不挡 `brass`）。多词的种子按建议扩展（`school swimsuit` 带出 `old school swimsuit`）。放行表优先：泳装、睡衣、`lying`、`on bed`、`sleeping`、泳池、海边，还有 `breast pocket`、`bath yukata` 这种撞上词但没事的。
- 类别是 `photo_prompt.Crossing`：`nudity`（含 `rating:` 开头的分级，`rating:general` 和别的固定 tag 一样当重复去掉）、`underwear`、`exposure`、`bathing`、`pose`、`expression`、`appearance`、`style`（含 `artist:`、`(medium)`、质量 tag），另加一类 `people`（`1boy`、`2girls`、`hetero` 等）：规格只拍她本人，这也是越界最常见的入口。
- 建议接口不返回露骨的 tag：`nude`、`nipples`、`pantyshot` 这三项负面细项核对不到（其余七项是已知 tag），黑名单里查不到的也照样挡（生成时会列出来）。
- 改写表把非 tag 的写法换成 tag：`v sign` → `peace sign`、`looking at camera` → `looking at viewer`、`slight tilt of head` → `head tilt`、`casual outfit` → `casual`、`afternoon` → `day`（`afternoon` 不是 tag，照片说明的例子也改成了 `day`）。
- 剥掉的不占每栏 4 个的名额；同一个 tag 写两遍只算一次。查不到的 tag 照样保留，在 info 级别写日志（带 tag 原文）。
- 运行记录：`service_calls` 加了一列 `stripped_tags`（JSON，`{"nudity": 1}`，没剥掉时 NULL），旧库启动时自动加列。看板生图那一行多了 `stripped_photos`（几张剥过）和 `stripped`（各类几个），前端在服务名下面写一行小字「2 张剥掉了 tag：裸露 2、外貌 1」，手机上在那一行的说明里。
- 照片说明改成「不拍裸露和半裸、内衣和情趣服装、透视、走光、洗澡，也不拍性感的姿势、表情和镜头；泳装、睡衣、躺在床上可以拍」，并加了「照片里只有你一个人」。

**补清单缺口（2026-10-18）。** 审查找到两处：`bathing suit` 先按原写法查黑名单、撞上 `bathing`，改写成 `swimsuit` 也被剥掉——运行时改成改写后只查目标，和生成脚本核对改写表的口径一致；`hot spring`、`hot springs`、`rotenburo`（洗澡场景）和不带连字符的 `see through`（透视）原样漏过——补进种子、重新生成了表（已知 4335，其余只多了这几项和它们带出的建议）。测试里加了这四种写法。

**第四波合并后（2026-10-18）。** 合进 `feat/photos` 后全量 `uv run pytest`（1716 条）、`pyright` 通过。本地构建版上真的对话模型这几次都没在裸露、内衣、洗澡、性感几类写出 tag（要么推掉、要么自己换成全年龄写法），只造出了外貌一类被剥（`hair tied in ponytail`），看板小字「1 张剥掉了 tag：外貌 1」、页面没有 tag 原文。自审补了 `bunny girl`。

**用户定了（2026-10-18）。** 自加的第九类黑名单「别人入镜」保留。
