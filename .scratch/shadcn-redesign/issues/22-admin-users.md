# 22: 后台用户列表、用户详情换新

**What to build:** 用户列表改成装在 Card 里的 shadcn `Table`：排序沿用后端的三档、点表头切换；状态用 Badge（「已封禁」`destructive`，「管理者」`secondary`，「自带密钥：…」「单独限额：…」`outline`）；有分页；宽度小于 1280px 时换成 `divide-y` 的行。

用户详情：资料是 Card 里的两列定义列表，单独限额的按钮在 `CardFooter`；近期用量一张表；删除单独一张 Card。`BanUserDialog`、`UserLimitsDialog` 和删除确认框换新，打开确认框的入口用 `outline`，真正执行的那一下用 `destructive`。行为不变。

属于第 4 波。后台各页共用一个布局，按「一屏不混搭」的要求，21、22、23 三张必须在第 4 波结束前一起合入；在此之前，新内容装在旧外壳里只是过渡状态。

**Blocked by:** 16

**Status:** done

- [x] `AdminUserList`、`AdminUserDetails`、`BanUserDialog`、`UserLimitsDialog` 里没有 `@astryxdesign` 的引用；`adminUsers.test.ts` 如果引用了 Astryx 的东西，一并改掉并通过
- [x] 验收清单第 31 行：三种排序、Badge、分页、窄屏换成行
- [x] 验收清单第 32 行：资料、近期用量、封禁 / 解封、单独限额、删除用户的确认
- [x] 以上每行都在浅色、深色，手机宽度、电脑宽度下各看一遍
- [x] CI 的 grep 检查脚本通过
- [x] `typecheck`、`test` 通过，`next build` 成功
- [x] 开工前已把 main 合进 `feat/shadcn-redesign`，冲突在分支里解决

## Comments

2026-10-10 交付（提交 38033be，合并 8e5b2d9；面包屑 bf38b2e、审查修复 887a1f1）：
- 用户列表：Card 里的 shadcn Table，点「24 小时回合」「24 小时通话」表头切换排序（再点回到按注册时间，带 `aria-sort`），状态 Badge 按 `destructive`/`secondary`/`outline`，超过一页才出现分页；< 1280px 换成 `divide-y` 行，排序改用 Select。宽窄两套都渲染、靠 CSS 切换。
- 用户详情：资料是 Card 加 `MetadataList`，单独限额按钮在 `CardFooter`；近期用量一张表（< 1024px 换成行）；删除单独一张 Card，确认框是 AlertDialog、执行键 `destructive`。封禁、单独限额对话框换成 Dialog + Field（单独限额用 RadioGroup + `NumberInput`）。审查后两个对话框的「取消」改成 ghost。
- `lib/adminUsers.ts` 原来引用了 Astryx 的 `TableSortState`，换成 `headerSort(sort, column)`，排序逻辑不变，测试跟着改。新增文案 `previousPage`、`nextPage`、`pageOf`、`clearSearch`（Astryx 原来自带）。
- `ui/` 改动：无。
- 和 DESIGN.md 的偏差（待人定）：触屏上按钮不再撑到 44px（行内 ghost sm 是 28px）；两个对话框不显示右上角关闭键（ui 里它的读屏文字是英文 "Close"），用「取消」或 Esc 关；用户详情加载中没有名字可当标题，没用 `AdminPage`，写了同样限宽的容器。
- 2026-10-10 用户人工验收通过。
