# 23: 后台配置与单价换新

**What to build:** 配置页每一项一张 Card：标题旁边用 Badge 标出「已被后台覆盖」（`secondary`）或「覆盖没有生效」（`outline`）；右上角 `CardAction` 放「修改」。没有覆盖时内容是定义列表；有覆盖时是「项 / .env 的值 / 当前生效」的表，被盖掉的 .env 值划掉。点「修改」就在这张卡里展开 `FieldGroup` 表单，全页同一时间只开一张；「恢复成 .env 的值」放在 `CardFooter`。单价也是一张卡，「修改」在被修改的那一行下面展开（这是全后台唯一一处行展开）。提交键用 `default`，取消用 ghost。行为不变。

属于第 4 波。后台各页共用一个布局，按「一屏不混搭」的要求，21、22、23 三张必须在第 4 波结束前一起合入；在此之前，新内容装在旧外壳里只是过渡状态。

**Blocked by:** 16

**Status:** done

- [x] `AdminConfig`、`AdminPrices`、`OpenForm` 里没有 `@astryxdesign` 的引用
- [x] 验收清单第 33 行：每项一张卡、两种 Badge、展开表单、同时只开一张、「试调并保存」和失败提示、恢复成 .env 的值
- [x] 验收清单第 34 行：单价表行下展开修改、保存、取消
- [x] 以上每行都在浅色、深色，手机宽度、电脑宽度下各看一遍
- [x] CI 的 grep 检查脚本通过
- [x] `typecheck`、`test` 通过，`next build` 成功
- [x] 开工前已把 main 合进 `feat/shadcn-redesign`，冲突在分支里解决

## Comments

2026-10-10 交付（提交 296b581，合并 26a841c；审查修复 887a1f1）：
- 配置：每项一张 Card，标题旁 Badge，「修改」在 `CardAction`；没覆盖时是定义列表，有覆盖时是「项 / .env 的值 / 当前生效」表、生效的覆盖把 .env 值划掉；表单在卡里展开（沿用 `useOpenForm`，全页只开一张）；「恢复成 .env 的值」在 `CardFooter`。限额是 ToggleGroup + `NumberInput`。页内导航和「只能查看的项」保留（后者也装进 Card）。
- 单价：一张卡，宽屏编辑表单插在被改那一行下面（那一行铺中性底），窄屏在那一项后面断开插入表单。提交 `default`、取消 ghost、「新增单价」outline sm。
- 审查后：覆盖状态改回调用 `lib/adminConfig` 的 `statusDisplay`；可留空的字段标签恢复「可选」标记（旧版是 Astryx 自带的英文 Optional，新增文案 `common.optional`）；单价筛选框找回清空键（新增文案 `clearFilter`）；成功提示 `Notice` 挪到 `components/app/admin/`。
- `ui/` 改动：无。新增文案 `admin.config.badges`（「已被后台覆盖」「覆盖没有生效」）。
- 和 DESIGN.md 的偏差（待人定）：覆盖没生效时「当前生效」格里加一行小字「后台覆盖：X（已失效）」，这时 .env 值不划掉；单价来源用 Badge（「后台设定」secondary，「目录」「预设」outline）；「立即从目录刷新」留在目录状态那一行，没放 `CardAction`；「用过但未设单价」的提醒是中性 Alert；限额校验失败时只给输入框标红，不给整个 Field 标 `data-invalid`。
- 2026-10-10 用户人工验收通过。
