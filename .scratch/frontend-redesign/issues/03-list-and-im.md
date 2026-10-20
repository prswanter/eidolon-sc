# 03: 消息列表和 IM 对话页

**What to build:** 首页改成微信式消息列表；进入一位角色就是 IM 对话页。电脑上左右双栏（左列表、右对话），手机上两级页面。打字对话的全部现有行为保留（流式回复、日语加字幕、失败时把原文放回输入框、新对话）。规则见 `../spec.md`「信息架构」，视觉见 `DESIGN.md`。

**Prototype:** 原型参见提交 `8551cde`（原 `prototype/frontend-redesign` 分支，合并后已删除）里的 `frontend/src/app/prototype/`（`git switch --detach 8551cde` 后 `npm run dev` 打开 `/prototype`，右下角「原型控制台」可以跳到任意状态）。 对应文件：`ConversationList.tsx`、`Conversation.tsx`、`page.tsx`。

**Blocked by:** 01, 02

**Status:** ready-for-agent

- [x] 路由：列表和对话共用一个双栏外壳。电脑宽度（≥ 768px）下，对话在右栏打开，列表保留；手机宽度下为两级页面，带返回
- [x] 列表每行：头像（外圈用她的 `mark` 色）、名字、最新一次对话的最后一句（她的话显示字幕，自己的话前面加「你：」）、时间。选中行铺她的 `paper` 色，次要字用 `paperMuted`
  - 如果现有接口拿不到每位角色最后一句和时间，就在后端补一个（例如 `/api/characters` 或对话列表返回摘要），不要在前端逐个拉全部消息
- [x] 对话页头部：实心底色和分隔线；头像、名字、通话按钮（她的 `button` 色）、`⋯` 菜单里放「新对话」。菜单等 Astryx 组件的默认英文标签都要换成中文
- [x] 消息区铺横线纸（只在消息区）；气泡用 Astryx 默认的 `ChatMessageBubble` 形状，制作人的气泡用事务所深蓝，她的用她的 `paper` 色，日语大一级，字幕用 `paperMuted`。不加索引签、不自绘气泡尖角
- [x] 输入栏用 Astryx 的 `ChatComposer`；消息从顶部往下排，新消息出现时滚到最新
- [x] 继续用 `liveConversation` / `conversationLog` 的状态，不重写；现有测试保持通过
- [x] 空对话、加载中、失败（含自带密钥出错、限额）的状态都有；失败提示遵守 `CONTEXT.md` 的语义，说明算不算限额
- [x] 浅色和深色模式、手机和电脑各截图检查一遍，所有文字和图标都看得清

## Comments

**2026-09-28 实现完成**（`triage-labels.md` 里没有「已完成」这个标签，所以 Status 不动，在这里记一笔）：

- 路由：`frontend/src/app/(conversations)/` 路由组，`layout.tsx` 是列表和对话共用的双栏外壳（`PageShell` + 320px 的 `LayoutPanel`，和对话栏之间一条 `--color-border-blue` 细线）。`/` 和 `/conversation/[characterId]` 都在里面，换角色时外壳和列表不重新挂载。宽屏（≥ 768px，`useWide()`）左列表右对话，没选角色时右栏一句「选一位偶像开始对话」；窄屏首页只有列表，对话页页首有返回键。旧的角色卡片首页和旧对话页已删除。
- 数据：`components/conversations/ConversationDirectory.tsx` 在外壳里载入一次角色和摘要（先 `getAccount()`，没登录、没同意条款照旧跳转），列表和对话从 context 取；一个回合记下、开新对话、第一次打开某位角色（会新建对话）之后重新拉一次摘要。
- 后端：新增 `GET /api/conversations/latest`（要登录），每位聊过的角色一项：`character_id`、`conversation_id`、`created_at`（对话开始时间）、`last_message`（`role`、`text`、`ja`、`zh`、`created_at`，还没说话时为 null）。`/api/characters` 不登录也能看，所以没有把用户自己的摘要放进去。实现是 `Store.latest_conversations()`，测试在 `backend/tests/test_conversation_summaries.py`。
- 列表：`components/conversations/ConversationList.tsx`，Astryx `List` / `ListItem`，头像描边 `--her-mark`，选中行用新增的 `listRow(color, selected)`（`theme/herVars.ts`，带测试）铺 paper、次要字换 paperMuted。预览和时间的规则在 `lib/conversationList.ts`（`previewOf`、`dayOf`，带测试）：她的话显示字幕（没有字幕退回日语），自己的话「你：…」，刚开的新对话「新的对话，还没有说话」；时间今天写时刻、昨天写「昨天」、今年写月日、更早写年月日。通话中那一行显示「正在呼叫…」/「通话中 · 直接说话即可」。列表顺序按 `characters.toml`，没有按最近排序。页首 ⋯ 菜单里是「记忆」「设置」，底部一行免责声明。
- 对话页：`components/conversations/ConversationView.tsx`。实底页首（头像、名字、她的 `--her-button` 圆形电话键、⋯ 菜单里「新对话」和「只看文字」），横线纸只铺在消息区；`ChatLayout` + `ChatMessageList align="top"` + `ChatComposer`，打开时停在最新，新消息自动跟到底（Astryx 自带的锁定滚动）。气泡用 `ChatMessageBubble` 默认形状：制作人 `--office-ink`，她的 `--her-paper`，日语 `Text type="large"` 包 `<Ja>`，字幕 `supporting` + `--her-paper-muted`；气泡下有时间（记下的消息用记下的时间，新出现的用出现的时间，`conversationLog` 的条目不带时间，所以在界面里按 key 记一份）。还在等回复时气泡里是 Spinner，识别中的话是一个淡色的无底气泡。
- 状态：加载中（列表骨架、对话 Spinner）、空对话（`EmptyState`）、载入失败（`EmptyState` + 重试 / 回到列表）、没有这位角色、回合失败（`ChatComposer` 顶部的错误状态，原文照旧放回输入框）。失败是否计入限额：`Failure` 新增可选的 `countsTowardLimit`，`LiveConversation` 在回合失败（后端 `error` 事件，包括自带密钥出错）和请求被拒（`ApiError`，包括 429 限额）时置为 false，提示后面加「这次没有计入限额。」；回复中途断开的分不清，不下结论。通话失败的原因和计入与否留给 04（那里要结构化原因代码）。
- 通话（04 之前的过渡）：页首电话键开始通话（拨打中显示加载），接通后变成红色挂断键；通话中页首下方一条状态「正在呼叫…」（虚线下划线）/「通话中 · 直接说话即可」（实线下划线，线色 `--her-note-rule`）；「只看文字」挪进 ⋯ 菜单，开着时带勾，行为不变。离开对话页照旧挂断，还没有确认框（04 的清单里）。
- Astryx 自带文案：`AppTheme` 外面包了 `InternationalizationProvider locale="zh-CN"`，用 Astryx 随包的 `locales/zh-CN.json`，「更多选项」「发送」「滚动到底部」「消息输入框」「加载中」等都是中文；我们自己的标签都从 `i18n/zh.ts` 取。
- `PageShell` 小改：`padding` 也传给 `LayoutContent`（原来有起始栏时内容区仍带默认内边距，对话页首贴不到边）。
- 截图检查（Playwright，1280 和 390，浅色和深色）：列表、空对话、流式回复中、真实回复、⋯ 菜单、回合失败（超长输入）、拨打中都看过，文字和图标都看得清。headless 浏览器里拿不到麦克风，所以接通后的通话状态和挂断键没有实际看到。
- 没动 `globals.css`；新页面不依赖它。后端全量测试里 `test_characters.py::test_missing_character_sheet_is_reported_with_its_path` 在 Windows 上因路径分隔符失败，和本次改动无关（没碰 `characters.py`）。
