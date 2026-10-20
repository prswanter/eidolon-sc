# 03: 角色配置与角色选择页

**What to build:** 把角色做成配置：櫻木真乃和月岡恋鐘各自有规范标识、显示名、头像、简介、Fish Audio 音色 ID，以及人设文件的位置。新增角色列表接口和角色选择页；用户从选择页进入和某位角色的对话，对话引擎按角色加载对应的人设。

**Blocked by:** 01

**Status:** resolved

- [x] 新增或修改角色（包括替换音色 ID）只需要改配置，不需要改代码
- [x] MVP 配置两位角色：櫻木真乃（音色 `a1150f3d14ac46fb8ea59c7803cd8357`）和月岡恋鐘（音色 `a11bfd046e924099a84f989fb4049e95`）
- [x] 角色列表接口返回头像、显示名和简介，不返回人设内容
- [x] 角色选择页展示两位角色，点击后进入与该角色的对话
- [x] 和真乃、恋鐘的对话分别使用各自的人设（测试中通过假 LLM 收到的提示词验证）
- [x] 人设文件不提交到仓库，仓库里只放配置结构和一份示例（ADR-0003）

## Comments

实现摘要：

- 角色配置在 `characters/characters.toml`（TOML，路径相对于该文件），后端启动时由 `eidolon.characters.load_characters` 读取并校验：缺字段、标识重复或含非法字符、人设文件不存在都会让后端拒绝启动并给出中文说明；头像可选，文件缺失只记警告。配置路径由 `EIDOLON_CHARACTERS_PATH` 指定，Docker 中为挂载的 `/characters/characters.toml`。
- 仓库里只提交配置和 `characters/sheets/example.md`，`characters/sheets/*`（示例除外）和 `characters/avatars/` 被 gitignore。
- `GET /api/characters`（需要访问密钥）返回标识、显示名、简介和头像地址，不返回人设和音色 ID；`GET /api/characters/{id}/avatar` 不需要密钥，便于 `<img>` 直接加载。
- 对话引擎按对话的角色标识取对应人设；测试用假 LLM 验证真乃、恋鐘各自的人设，以及通过配置新增的第三位角色。
- 前端首页改为角色选择页（无头像时显示名字首字），对话页从角色列表取显示名。
