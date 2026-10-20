# 19: 对话列表、对话页、通话条换新

**What to build:** `(conversations)` 布局下的对话列表和对话页一起换成 LINE 式的样子（视觉按 `DESIGN.md` 的 Layout、Chat bubbles、Conversation list 几节）：

- **对话列表**：「对话」大标题、搜索框、56px 头像、未读数用 `--her-button` 那一对颜色，选中行铺 `bg-muted`。
- **调宽**：电脑上列表用 shadcn `Resizable` 按像素调宽（默认 320px、240–480px、`preserve-pixel-size`，记进 localStorage，挂载后恢复，沿用 `useSavedSize` 的行为）。
- **对话页**：铺她的壁纸；22px 圆角、无尾巴的成组气泡（Bubble Group Rule）；日语原文在上、字幕在下；制作人气泡用深蓝墨水；实底的输入栏、圆形发送键；页首的电话键用她的颜色。
- **通话条**：通话层收起后，用通话条取代通话便利贴 `CallNote`：40px 高，底是 `--her-call-deep`，显示「通话中 mm:ss」或「正在呼叫…」，右端「回到通话 ›」。整条是一个按钮，焦点行为见 `DESIGN.md`。

通话层本身（`CallLayer`、`MicSheet`、`OutfitPicker`）留给第 20 张，这一张不改它们的样子。但对话页这一屏结束时，不能再有 Astryx 组件露在外面；通话层是盖在上面的另一层，不算同一屏。

`CallNote` 删掉后，一起删除 `--her-note`/`--her-note-rule` 两个变量、`imageColor` 里的 `note`/`noteRule` 两对颜色，以及 `herVars.test.ts`、`imageColor.test.ts` 里对应的断言。属于第 3 波，和 17、18 并行。

**Blocked by:** 16

**Status:** done

- [x] 布局、`ConversationDirectory`、`ConversationList`、`ConversationView` 里没有 `@astryxdesign` 的引用；`CallNote` 已删
- [x] `note`/`noteRule` 两对颜色、两个变量及其断言已删，其余测试照常通过
- [x] 验收清单第 13–14 行：列表的标题、搜索、更多菜单、行、未读数、选中和悬停、免责声明；通话中那一行显示「通话中 mm:ss」/「正在呼叫…」
- [x] 验收清单第 15 行（电脑）：拖拽调宽 240–480px，刷新后恢复；没选角色时右栏的提示
- [x] 验收清单第 16–17 行：壁纸、两种气泡、成组规则、日期条；输入栏多行增长、发送键、返回键（手机）、电话键、更多菜单、新对话
- [x] 验收清单第 18 行：通话条在呼叫中（圆点闪烁）和通话中的样子，点击展开，收起后焦点落在通话条上
- [x] 验收清单第 19 行：通话中切到别的角色、设置、记忆时的确认框
- [x] 以上每行都在浅色、深色，手机宽度、电脑宽度下各看一遍，并用至少两位印象色差别大的角色看
- [x] CI 的 grep 检查脚本通过
- [x] `typecheck`、`test` 通过，`next build` 成功
- [x] 开工前已把 main 合进 `feat/shadcn-redesign`，冲突在分支里解决

## Comments

2026-10-09 交付（提交 4140815、ff39d52，合并 f1c1638）：
- `(conversations)` 布局、两张页面、`ConversationDirectory`、`ConversationList`、`ConversationView` 换新；新增 `CallBar.tsx`，删 `CallNote.tsx`；`useSavedSize` 改成配合 Resizable（`onResize` 记 `inPixels`，挂载后 layout effect 恢复）；`useFocusBack` 焦点落在通话条按钮上。
- 删掉 `note`/`noteRule` 颜色对、`--her-note`/`--her-note-rule` 及断言。`lineState.ts` 只剩通话层在用，留给 20。
- `ui/` 改动：`bubble.tsx` 加 `her`/`producer` 两种气泡和成组用的 `joinsPrevious`/`joinsNext`；`button.tsx` 加 `aria-disabled:opacity-50`（`focusableWhenDisabled` 的电话键）；`textarea.tsx` 加 `composer` 变体（`field-sizing` 长高到 8rem，Firefox 等不支持时停在一行、框内滚动）。`components/app/PageShell.tsx` 在 `isScrollable={false}` 时内容层加 `min-h-0`。
- 和 DESIGN.md 的已知偏差（待人定）：未读数没做（后端和 `lib/` 没有未读数据）；页首「搜索」键、输入栏左边「+」没做（背后没有功能）；旧版宽屏拖输入框上沿调高度的功能去掉了；列表行最后一句显示中文字幕（`lib/` 的 `previewOf` 优先字幕，DESIGN.md 写的是她的日语）；列表顶部的搜索框按名字过滤，搜不到时显示「没有找到这位偶像」；换衣装从页首图标挪进更多菜单（DESIGN.md 页首没有换衣装键）。
- 离开确认框不注入她的颜色（框里只有中性键和挂断红执行键）。
- 合并后发现 `cn` 不认得 `@theme` 的具名字号（`text-body` 和字色同在一次 `cn` 里会被吞掉），在 46c38db 用 `cn/config` 的 `createCn` 修好，`lib/utils.test.ts` 对照 `globals.css` 防止名单漂移。
- 2026-10-09 用户人工验收通过。
