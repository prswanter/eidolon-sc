# 18: 设置、记忆换新

**What to build:** 设置页的每一节（制作人档案、登录方式、通话设置、自带密钥、删除账号、管理者才看得到的后台入口）和记忆页改用新版共用件和 shadcn 组件，整屏不再出现 Astryx 组件，视觉按 `DESIGN.md`。删除类确认框里真正执行的那一下用 `destructive`（挂断红）。麦克风选择的当前项铺中性的 `bg-muted`。行为、文案不变。属于第 3 波，和 17、19 并行。

**Blocked by:** 16

**Status:** done

- [x] 设置页、记忆页及其组件（`ProducerProfileSettings`、`SignInSettings`、`CallSettings`、`OwnKeysSettings`、`DeleteAccount`、`AdminEntry`）里没有 `@astryxdesign` 的引用
- [x] 验收清单第 8–11 行：制作人档案的查看、修改和保存失败；登录方式的绑定、解绑和失败；通话设置；自带密钥的填写、保存和失败；删除账号的确认；管理者看得到后台入口，普通用户看不到
- [x] 验收清单第 12 行：记忆列表、空状态、加载失败、删除一条的确认、清空的确认
- [x] 以上每行都在浅色、深色，手机宽度、电脑宽度下各看一遍
- [x] CI 的 grep 检查脚本通过
- [x] `typecheck`、`test` 通过，`next build` 成功
- [x] 开工前已把 main 合进 `feat/shadcn-redesign`，冲突在分支里解决

## Comments

2026-10-09 交付（提交 68a322b，合并 806166d；审查修复 398cc43）：
- 设置六个区块、设置页、记忆页改用新共用件和 shadcn；新加 `ui/` 的 select、combobox、switch、radio-group、spinner、input-group、textarea。select、combobox 的弹层加深色边线，当前项 `data-selected:bg-muted`（麦克风选择的当前项铺中性底）；新增 `ComboboxSelectTrigger` 给时区选择用。
- 删除账号、删除一条记忆、清空记忆：打开确认框的键是 `outline`，框里真正执行的那一下是 `destructive`。
- 「已绑定」提示是中性 Alert 加关闭键；「已被取代」是 `secondary` Badge；加载中的按钮显示 Spinner 并禁用。
- 审查后修：唯一登录方式时「解绑」键用 `focusableWhenDisabled`，键盘也能聚焦看到「唯一登录方式」的提示。
- 已知：时区搜索无结果时列表为空，不加新文案。
- 2026-10-09 用户人工验收通过。
