# 01: 后台写公告

**What to build:** 管理者可以在后台写公告。

- 侧栏在「用户」后面多一项「公告」。
- 列表页：一张表，列出所有公告，草稿和已发布的都在内，从新到旧排。每行有正文开头（去掉 Markdown 记号，约 40 个字）、状态、发布时间和最后修改时间。右上角一个「写公告」按钮。
- 编辑页：只有一个正文 `Textarea`，用「编辑 / 预览」切换，预览用共用的 Markdown 正文组件渲染。
  - 草稿可以「保存草稿」和「发布」。
  - 已发布的可以「保存」和「撤回」。保存不改变发布时间；撤回后再发布，发布时间改成那一刻。
  - 两种状态都能「删除」，删除前要确认。
- 非管理者访问这些页面和接口时，和访问其他后台页面一样，得到 404。

Markdown 正文组件和 `lib/` 里的公告模块在这张票里建好，02 直接用：
- 正文组件只开这几种写法：段落、换行、加粗、斜体、链接、列表、行内代码。不解析原始 HTML，链接在新标签页打开。
- 公告模块这张票先做「正文开头」这一项。已读、未读相关的部分可以留给 02。

用户接口（最近 20 条已发布）也在这张票里做，这样数据层一次写完。用户端界面留给 02。

详见 `.scratch/announcements/spec.md`。

**Blocked by:** None (can start immediately)

**Status:** resolved

- [x] 公告表登记进 `NOT_USER_DATA`，文档字符串跟着改
- [x] 管理者能新建公告（新建出来是草稿），能修改、发布、撤回、删除；重复发布、重复撤回不报错，也不改字段
- [x] 修改已发布的公告，发布时间不变；撤回后再发布，发布时间是再发布那一刻
- [x] 空正文和超过 5000 字的正文得到 422，信息可读，编辑页显示出来
- [x] 非管理者和未登录的人访问每个后台公告接口，都得到 404
- [x] 用户接口只返回已发布的公告，最多 20 条，从新到旧，每条只有 id、正文、发布时间；未登录得到 401，没同意条款得到 428
- [x] 后台侧栏有「公告」一项，面包屑正常；列表页和编辑页的写法符合 DESIGN.md 的后台规则
- [x] 预览和最终渲染用同一个 Markdown 正文组件；标题、表格、图片、原始 HTML 都不会渲染成对应元素，也不丢字；链接在新标签页打开
- [x] `lib/` 公告模块的「正文开头」有 vitest 测试：Markdown 记号去掉、空白合并、超长截断加省略号
- [x] 后端测试走 HTTP（`make_client`），覆盖以上各条
- [x] DESIGN.md 后台一节补上公告列表页和编辑页的写法
- [x] 后端和前端的全部测试、类型检查、lint 通过，`next build` 成功

## Comments

### 实现说明（2026-10-12）

- 后端：`announcements.py` 管公告表（`Announcements`：`all` / `published` / `get` / `write` / `edit` / `publish` / `withdraw` / `delete`），`announcements_api.py` 挂路由，`Backend.announcements` 由 `assembly.build` 建好。表登记在 `NOT_USER_DATA`。
- 接口：
  - 后台：`GET/POST /api/admin/announcements`、`GET/PUT/DELETE /api/admin/announcements/{id}`、`POST/DELETE /api/admin/announcements/{id}/publish`（发布 / 撤回，写法照封禁的 `POST/DELETE …/ban`）。新建回 201，删除回 204，找不到回 404「没有这条公告」。
  - 用户：`GET /api/announcements`，最近 20 条已发布的，每条只有 id、正文、发布时间。
  - 正文去掉首尾空白后为空或超过 5000 字时，回 422，`detail` 是一句中文（「公告正文不能为空」「公告正文最多 5000 字」），不是 pydantic 的列表。
- 后台列表的顺序：草稿在前（后写的在上），然后是已发布的（后发布的在上）。`updated_at` 只在正文被写入时变，发布、撤回不动它。
- 前端：
  - `lib/announcements.ts` 有类型、接口函数和 `excerpt`（单测 `announcements.test.ts`）。已读、未读的部分留给 02。
  - 共用的正文组件是 `components/app/AnnouncementBody.tsx`（`react-markdown`，没装 `remark-gfm`，所以只有 CommonMark：没有表格、删除线，裸网址也不会自动变成链接，要写成 `[文字](地址)` 或 `<地址>`）。段内换行靠 `whitespace-pre-line` 照原样换行。字号是 Body（15px），后台预览和 02 的弹窗看到的一样。
  - 后台页面：`AdminAnnouncementList.tsx`、`AdminAnnouncementEditor.tsx`，路由 `/admin/announcements` 和 `/admin/announcements/[id]`（`new` 表示新写一条，第一次保存后用 `history.replaceState` 换成它自己的地址，不重新加载）。侧栏图标用 Lucide `Megaphone`（`AnnouncementsIcon`），铃铛 `Bell` 留给 02 的用户端。
  - 「写公告」按 DESIGN.md 的后台按钮规则用 outline（default 只给表单提交）。
- DESIGN.md「Layout · 后台」加了「公告」一条，菜单、限宽、Badge 规则同步更新。
- 本地用构建版跑过一遍：写公告 → 预览（加粗、段内换行、列表、链接、行内代码正常；标题退成一段，HTML 标签去掉、字留下，图片只留说明文字）→ 发布 → 列表 → 用户接口拿得到 → 删除。

#### 人工验证清单

- 后台侧栏有「公告」，点进去是空状态「还没有公告」。
- 「写公告」：正文为空时「发布」「保存草稿」都不能点；输入超过 5000 字时，下面出现红字「最多 5000 字。」，按钮不能点。
- 「编辑 / 预览」切换：预览里加粗、斜体、链接（新标签页打开）、列表、行内代码、段内换行都正确；`# 标题`、图片、HTML 不会原样出现。
- 「保存草稿」后地址变成这条公告自己的，刷新后内容还在；列表里是「草稿」，发布时间写「未发布」。
- 「发布」后状态变「已发布」，出现发布时间；改正文点「保存」，发布时间不变、最后修改时间变。
- 「撤回」后变回草稿；再「发布」，发布时间是新的。
- 「删除」弹确认框，确认后回到列表，这条不见了。
- 窄屏（< 1024px）列表换成一行一条；手机上侧栏收进 Sheet。
- 普通用户（不在管理者名单里）打开 `/admin/announcements` 是 404。

### 审查后的修正（2026-10-12）

code-review（固定点 a125bb5）之后，按用户的决定修正了下面几处：

- 正文组件加了一个小的 remark 插件 `plainHtmlAndCode`：原始 HTML 去掉标签、留下字（整块的成一段，行内的仍在行内），代码块成一段纯文字，不再带行内代码的灰底。以前整块 HTML（如单独一行的 `<div>维护通知</div>`）会连字一起丢掉。
- 正文里的链接改用 `AppLink`，不再抄它的样式。
- `excerpt` 会去掉 HTML 标签；只去掉强调用的 `_`，词中间的 `_`（`snake_case`）保留。CommonMark 本来也不把词中间的下划线当强调。
- 窄屏列表的副行补上「发布于」「最后修改于」。
- `new` 和公告地址收进 `lib/announcements.ts`（`ANNOUNCEMENTS_HREF`、`NEW_ANNOUNCEMENT`、`announcementHref`）。编辑页加载时改用 `AdminPage`，不再手写限宽外框。
- 删掉了重复走同一分支的测试（CODING_STANDARDS「Parameters that don't branch」「Same path, another file」）。
- 后台列表草稿在前，用户确认保留，spec 那句改成了现在的写法。
- `listAnnouncements` 和 `Announcement` 类型留给 02 用。

### 人工验证通过（2026-10-12）

用户按上面的清单人工验收通过，没提意见。可以开始票 02。
