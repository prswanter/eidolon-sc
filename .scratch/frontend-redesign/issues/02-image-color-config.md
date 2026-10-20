# 02: 印象色和通话层背景图：后端配置和接口

**What to build:** `characters/characters.toml` 里的 `color`（必填）和 `background`（可选）真正生效：后端加载时校验，角色接口把它们交给前端，背景图像头像一样可以获取。规则见 `../spec.md`「角色视觉」。

**Blocked by:** None (can start immediately)

**Status:** ready-for-agent

- [x] `backend/src/eidolon/characters.py`：`color` 加进必填字段，格式必须是 `#rrggbb`，否则报 `CharacterConfigError` 并说明是哪位角色；`background` 可选，路径相对于配置文件，文件不存在时记一条警告并当作没有，和 `avatar` 的处理一致
- [x] `/api/characters` 多返回 `color` 和 `background_url`（没有时为 null）；新增 `GET /api/characters/{id}/background`，行为和头像接口一致
- [x] `characters/backgrounds/` 目录建好（可以只放 `.gitkeep`），与头像一样提交进私有仓库（ADR-0003 修订）
- [x] 补测试：缺少 `color`、格式错误、背景图不存在、接口返回新字段
- [x] `characters.toml` 顶部说明已写好（2026-09-27），核对与实现一致

## Comments

2026-09-28 完成：

- `characters.py`：`color` 加进必填字段（缺少时报「角色 X 缺少字段 color」）；格式按 `#` 加六位十六进制校验，大写也接受，读入后统一转成小写。`background` 和 `avatar` 共用同一段处理，文件不存在时记警告并当作没有。
- `/api/characters` 多了 `color` 和 `background_url`；新增 `GET /api/characters/{id}/background`，和头像接口一样不需要登录，没有背景图或没有这位角色时 404。
- 建了 `characters/backgrounds/.gitkeep`；`.gitignore` 里没有规则会忽略这个目录。
- 核对 `characters.toml` 顶部说明：与实现一致，只把 background 一行补成「没有或文件不存在时」用渐变代替。两位角色的印象色已经填好。
- 没改（超出本工单范围）：三语 README 的配置示例里还没有 `color`，现在它是必填，照抄示例会启动失败；ADR-0003 的修订也还没提到背景图。建议在文档工单（07）里一起补上。
