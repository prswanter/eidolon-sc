# 16: 共用件：新版组件建在旧版旁边

**What to build:** 后面各屏要用的新版共用件全部就位，但还没有任何页面在用。

- 用 `shadcn add` 加入要用的 `ui/` 组件：Button、Alert、Empty、Dialog、AlertDialog、Drawer、Sheet、Field、Toggle Group、Tabs、Sidebar、Card、Badge、Table、Resizable、DropdownMenu、Popover，以及官方聊天组件（Message、Bubble、Message Scroller），按需取用。生成的 `from "cn"` 当场改掉；改过的地方加 `// eidolon:`。
- 在 `components/app/` 新建项目共用件，文件名和旧版相同：页框 `PageShell`、页首 `SubpageHeader`、区块卡 `SettingsSection`、失败提示 `FailureNotice`、链接 `AppLink`、带标记的头像 `MarkedAvatar`。
- 在 `components/app/admin/` 新建 `AdminPage`、统计卡、Sidebar 外壳。
- 再补上盘点里要自己写的通用件：StatusDot、Timestamp、MetadataList、NumberInput、`useMediaQuery`。

全部在示例路由里展示一遍（浅色、深色）。旧组件一个都不动。视觉按 `DESIGN.md`。属于第 2 波。

**Blocked by:** 14、15

**Status:** done

- [x] 验收清单第 4 行：示例路由里每个共用件在浅色、深色下都正常；旧页面不受影响
- [x] 后台 Card 保留默认的 `ring-1` 细线，用户侧的东西不加描边环、不投影（Flat Rule）
- [x] 截图脚本重拍后，和第 12 张拍的基准图像素零差异（范围：登录、法务、后台各页的静态部分）
- [x] CI 的 grep 检查脚本通过
- [x] `typecheck`、`test` 通过，`next build` 成功
- [x] 开工前已把 main 合进 `feat/shadcn-redesign`，冲突在分支里解决

## Comments

2026-10-09 交付（提交 13f3153）：
- `ui/` 加了 ticket 列的全部组件，另加 Avatar、Breadcrumb（后台面包屑）；Sidebar 带进来 Sheet、Tooltip、Separator、Skeleton、Label、Toggle 和 `hooks/use-mobile.ts`（改成调用 `useMediaQuery`）。按 DESIGN.md 改了源码：Button、Badge 的 `destructive` 改成挂断红实底白字；Avatar 去掉描边；AlertDialog、Sheet、Popover 加 `container` 和深色边线；Breadcrumb 改成 Caption 字号；Bubble 删掉 `tinted`（在调用处推色）。
- 共用件 API 和旧版的差别，第 3、4 波迁移时要注意：`PageShell` 的 `contentWidth`/`padding` 合并成 `width="column"|"full"`，去掉了 `start`（对话布局在 19 换成 Resizable）；`MarkedAvatar` 去掉了 `color`（新设计里头像无描边，DESIGN.md「The Flat Rule」），尺寸是 `sm`/`bubble`/`lg`/`list`；`AppLink` 去掉了 `hasUnderline`（句中链接画线，`isStandalone` 不画）；`SettingsSection` 的 `PROSE_WIDTH` 现在是 Tailwind 类；`AdminShell` 多一个 `trail`，用户详情把用户名放进面包屑；`StatTile` 单独成文件。
- 只有后台用的通用件（StatusDot、Timestamp、MetadataList、NumberInput）放在 `components/app/admin/`。StatusDot 只有 `warning`（新增琥珀色 `--warning`，写进了 DESIGN.md 和主题对比度测试）和 `error` 两档。旧 `adminConfig.ts` 里的 `"accent"` 点在 23 改成 Badge。
- FailureNotice 改用中性的 Alert 加图标，不用挂断红（DESIGN.md 规定挂断红只给挂断和真正执行删除、封禁的那一下）。
- 纪律脚本的任意值颜色检查加上了 `color-mix`。
- 示例路由 `/preview/shared`、`/preview/admin`（页首有「强制深色」开关）。
- 像素比对：119ee39 单独构建，按「基准 → 当前 → 基准」各拍一套，44 张只差后台用户列表（电脑宽度）里「最近活动」那一格。
- 用户验收通过验收清单第 4 行。
