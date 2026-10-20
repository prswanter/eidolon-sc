# 前端换成 shadcn/ui，改成 LINE 风格

Label: wayfinder:map

## Destination

一份可以直接交给 agent 实现的前端重做规格（`spec.md`），并且按波次切好实现 ticket：用 shadcn/ui + Tailwind v4 替换 Astryx，视觉改为克制的 LINE 风格，覆盖用户侧、后台、法务所有页面；信息架构（对话列表 + 对话、全屏通话层）不变，最后彻底移除 `@astryxdesign/*`。

## Notes

- 领域：`frontend/`（Next 16 + React 19）。术语以 `GLOSSARY.md` 为准，尤其是「印象色」「通话层」「只看文字」「立绘」；产品约束见 `PRODUCT.md`，现行视觉规范见 `DESIGN.md`（将被改写），上一轮重做的规格见 `.scratch/frontend-redesign/spec.md`（结构沿用，视觉部分被本次取代）。
- 换库的取舍见 ADR-0015。
- 已在立项时定下的约束：
  - 「LINE 风格」只借 LINE 的形态和克制感：浅色底、圆润气泡、对方头像在左、扁平、细分隔线、列表密而干净。**不用 LINE 绿**：应用外框是中性灰白，属于她的地方（她的气泡、页头、通话层）用她的印象色。「已读」、贴图等 LINE 功能不做，这次只换视觉。
  - 浅色、深色模式都保留，跟随系统；`imageColor.ts` 的成对推色和对比度测试保留，只改注入方式。
  - 主题以 shadcn neutral 为底，只覆盖少数变量，覆盖值写进对比度测试（原定「在 tweakcn 里调」，已由「DESIGN.md / PRODUCT.md 改写与说法统一」改掉）。
- grilling 类 ticket 都要调用 Skill「grilling」和「domain-modeling」；prototype 用「prototype」，涉及视觉判断时可以再调用「frontend-design」或「impeccable」。
- 分支：`feat/shadcn-redesign`。每个会话只解决一个 ticket（research 除外）。

## Decisions so far

<!-- 每个已关闭的 ticket 一行：要点 + 链接 -->

- [Astryx 组件盘点与 shadcn 对应表](issues/01-astryx-inventory.md)：约 20 项可直接对应 shadcn（含官方聊天组件），9 项需要薄封装，9 项要自写；大头是 300 多处布局排版原语；图表、印象色推色等逻辑保留
- [shadcn 底层选型与 Tailwind v4 接入](issues/02-shadcn-stack.md)：底层选 Base UI（`base-nova`）；只取 tweakcn 的颜色值；印象色写进 `--primary`/`--ring`，浮层要单独处理；和 Astryx 共存要靠 CSS 层顺序，尚待用 build 验证
- [LINE 风格视觉原型](issues/03-line-style-prototype.md)：定稿组合 D：外框、气泡配色和列表取 A（她色相的淡壁纸、她的气泡白色、制作人气泡用深蓝墨水、头像 56px），气泡形状取 B（22px、无尾巴），通话层取 B（模糊头像做底、毛玻璃台词卡），底栏取 C；日语用 LINE Seed JP，中文用 Noto Sans SC，不用阴影
- [迁移策略](issues/04-migration-strategy.md)：在 feat 分支上一次换完，再合进 main；分支内两套库并存，靠层顺序隔离；第一波是不改外观的底座波；以屏为单位替换；每波开工前把 main 合进分支；回滚靠 revert，不搭预发环境
- [DESIGN.md / PRODUCT.md 改写与说法统一](issues/05-design-docs-rewrite.md)：新的 `DESIGN.md`（「制作人的手机」）已经写进分支；主题用 shadcn neutral，不进 tweakcn；深蓝只用于制作人气泡；选中状态一律中性底；壁纸纳入成对颜色契约；列表叫「对话」；旧规格里的「微信式」不改；通话层和后台两节待对应 ticket 补
- [后台视觉原型](issues/06-admin-style-prototype.md)：整体取方案 A：shadcn Sidebar；内容列限宽（1200 / 960px）；数字、图表、表格都装在 Card 里；配置每项一张卡、卡里展开表单；图表用前景黑白。不引入 TanStack Table；对话列表改用 Resizable、按像素调宽；后台 Card 保留默认细线
- [通话层的其他状态与立绘衔接](issues/07-call-layer-variants.md)：全部取方案 A：立绘铺在底上，台词卡和底栏压在衣服上；收起后对话页首下面出一条她颜色的「通话条」；通话层从底部滑上来；Line-State Rule 和 `note`/`noteRule` 等用不上的颜色对删掉，只留 `call.deep`；背景图保留但目前没人配
- [测试替换与每波验收方式](issues/08-testing-and-acceptance.md)：底座波就加主题对比度测试和 `--primary`/`--ring` 断言，旧断言和 `theme:check` 留到最后一波再删，删时 CI 加 `grep @astryxdesign` 必须为零；Playwright 截图只存档、不做回归；底座波先单独提交换字体，在这个提交上拍基准图，后续底座提交必须和基准像素零差异；验收清单写进 `spec.md`，按波分配
- [实现波次的切分](issues/09-wave-slicing.md)：共五波：底座 → 共用件（在旧组件旁另建新版，不改外观）→ 用户侧主屏（三张并行）→ 通话层与后台（四张并行，后台同一波换完）→ 清理；验收清单按页面分到各波；`--her-note` 的断言随通话条在第三波删掉；`spec.md` 由单独的 task 来写
- [新的组件纪律](issues/10-component-discipline.md)：布局直接写 div 加 Tailwind 类、有名字的重复结构才抽组件；颜色和 DESIGN.md 里的尺寸都注册成具名 token，任意值只用于布局；`ui/` 直接改并加 `// eidolon:` 标记，禁止 `!`；共用件放 `components/app/`；`cn` 从 `@/lib/utils` 导入；底座波就把纪律写进 `frontend/AGENTS.md`，并在 CI 加 grep 检查
- [写 spec.md 并切出实现 ticket](issues/11-write-spec.md)：`spec.md` 写好（验收清单 35 行，按波分配）；实现 ticket 是 12–24，底座波拆成 12–15 四张，其余按五波切分；**地图到达终点**，从 12 号开始实现

## Not yet specified

（暂无。）

## Out of scope

- LINE 的功能性元素（已读、贴图、通话记录之类）：这次只换视觉，不加功能。
- 信息架构和交互流程的改动：沿用 2026-09-28 原型确认的结构。
