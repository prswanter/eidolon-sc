# 05: DESIGN.md / PRODUCT.md 改写与说法统一

Type: grilling
Blocked by: 03
Status: resolved

## Question

原型定稿后，`DESIGN.md`（现在是「制作人的手帐」）要改写成什么：保留哪些（印象色规则、字体分工、可访问性要求），删掉哪些（复印纸、横线、墨水的隐喻）？`PRODUCT.md` 的技术栈和视觉描述怎么改？旧规格和文档里「微信式」的说法是否统一换成新的描述，`GLOSSARY.md` 需不需要为此调整措辞？

参考：「LINE 风格视觉原型」的主题色值是按 tweakcn 导出格式手写的，还没定稿；改写 DESIGN.md 时一并在 tweakcn 里调好，导出 `:root`/`.dark` 的颜色值。

## Answer

用户 2026-10-09 在 grilling 中拍板。新的 `DESIGN.md` 和改过的 `PRODUCT.md` 已经提交到 `feat/shadcn-redesign`。

- **时机**：现在就在分支上写出新的 `DESIGN.md`，让实现波次的 agent（impeccable、frontend-design）读到的就是新规范。通话层的其他状态、通话便利贴的去向、后台的字体层级、按钮和布局这几节先留「待定稿后补」，由「后台视觉原型」和「通话层的其他状态与立绘衔接」收尾时补上。`README.md`（手帐主题、便利贴）在实现完成后的收尾波次里改，因为它描述的是已经上线的行为。
- **Creative North Star**：「制作人的手机」（The Producer's Phone）。隐喻只定基调，不落到装饰上。
- **墨水**：One Ink Rule 改成 **Producer's Ink Rule**：深蓝只用在制作人气泡上，系统文字用中性的 `--foreground`。后台图表用什么颜色，交给「后台视觉原型」去定。
- **主题**：不进 tweakcn。以 shadcn neutral（纯灰、彩度 0）为底，只覆盖 `--destructive`（挂断红）、深色浮层边线等几处，覆盖值写进主题对比度测试（替代 `notebookTheme.test.ts`）。原型里本来用的就是 neutral 的默认值。
- **Named Rules**：保留 Paired Colour、Scoped Colour（补充：浮层走 portal，要再注入一次）、Night Edge、Original-Then-Subtitle（字体换成 LINE Seed JP）、Library Icon；Theme Patches Defaults 改成 Own-the-Source；Flat Paper 改成 Flat；Paper-Only-Where-She-Writes 改成 Wallpaper；新增 Her-Colour-Only-Here 和 Bubble Group；Line-State 暂时搁置，等通话层定稿。
- **列表大标题**用「对话」，不用「聊天」（`GLOSSARY.md` 的 _Avoid_）。
- **「微信式」**：已经结束的旧规格原样保留，作为历史记录；新文档只写「LINE 式」或直接描述形态。`GLOSSARY.md` 不改；只有通话便利贴有了新名字、而且会出现在界面文案里时，才再考虑。
- **`PRODUCT.md`**：只改技术栈那一行，组件写法的约束指向 `frontend/AGENTS.md`（地图上还没细化的「新的组件纪律」）。
- **对话壁纸纳入契约**：`imageColor.ts` 新增一对 `wall`，`--foreground` 和 `--muted-foreground` 在壁纸上都要 ≥ 4.5。
- **选中状态一律 `bg-muted`**：对话列表、麦克风选择、换衣装都一样；paper、paperMuted 不再用来铺选中，note、noteRule 等便利贴有了结论再决定删不删。
- 写规范时顺带改的一处：原型里未读数是 mark 色底配白字，八宮めぐる的黄色上读不清，违反 Paired Colour Rule，所以改用 `--her-button` / `--her-button-fg` 这一对。
