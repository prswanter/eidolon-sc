# 01: 历史对话面板、只读的历史对话和菜单图标

**What to build:** 用户在对话页的「更多」菜单里点「历史对话」，能看到和她的所有对话（当前对话排第一）。点开一段历史对话，可以像平时一样往上翻，但只能看：页首写着是哪天的对话，底部的卡片能一下回到当前对话；正在打的电话和正在进行的回复都不受影响。礼物一律记进当前对话；当前对话还是空的时候不能再开新对话；更多菜单和对话列表长按菜单的每一项都带图标。见 `../spec.md` 的 Solution 第 1–6、8 条。

**Blocked by:** None (can start immediately)

**Status:** done

- [x] 「更多」菜单依次是「新对话」「历史对话」「换衣装」，每一项前面有图标；对话列表的长按菜单里，置顶/取消置顶、隐藏/显示也各有图标
- [x] 点「历史对话」：宽屏弹出 Dialog，窄屏拉出 Drawer，都用她的颜色；每次打开都是最新的列表，读取时显示加载中
- [x] 面板里当前对话在第一行，标着「当前」；历史对话按开始时间从新到旧排，空的不列；每行写日期（北京时间）和最后一句（写法同对话列表），被她结束的有标记；只有当前对话时，下面有一句说明
- [x] 点一段历史对话，地址变成带 `?c=` 的；刷新或在另一台设备打开同一地址，看到的还是这一段；`c` 无效时回到当前对话，地址也换掉
- [x] 历史对话里：消息区和平时画法一样，但不能打字；页首名字下面写「{日期}的对话」；电话键禁用，提示要回到当前对话；好感度标识、新对话、历史对话、换衣装照常能用
- [x] 历史对话底部是只读卡「这是你们的历史对话」（她结束的那段另有说明），带「回到当前对话」按钮；按这个按钮、窄屏页首的返回键、浏览器返回，都回到当前对话
- [x] 通话中打开历史对话，通话条还在，电话不挂；她正在回复时打开历史对话，回去后那条回复在当前对话里
- [x] 不论从哪段对话跳去礼物页，礼物都记进当前对话；当前对话已结束就记进一段新开的对话。礼物页地址里不再带对话，旧链接里带着也不出错
- [x] 当前对话一条记录都没有时，「新对话」禁用；有了一条记录就能用
- [x] DESIGN.md 补上更多菜单、历史面板、历史对话的页首和只读卡、长按菜单的图标，并改掉「从对话页跳来」那一段
- [x] 后端测试（走对外接口）：她的对话列表每条带最后一句（跳过结束事件，空对话为空）和是否已结束；送礼的落点不论带不带对话都一样
- [x] 对话状态测试：当前对话为空时不能开新对话
- [x] 本地构建版 Playwright 验收（宽屏、手机），覆盖上面所有界面上的行为
- [x] 后端完整测试、前端类型检查和测试、前端纪律检查都通过

## Comments

### 实现说明（票 01）

**后端**

- `GET /api/conversations?character_id=`：每条在 `id/user_id/character_id/created_at` 之外多带 `last_message`（形状同 `/api/conversations/latest`，跳过结束事件，空对话为 null）和 `ended`（布尔）。`Store.list_conversations` 改成返回 `(Conversation, 最后一句 | None, 是否已结束)`；`app.py` 里把两处共用的最后一句拼法抽成 `last_shown`。
- 送礼：`Store.add_gift` 去掉 `conversation_id` 参数，规则只看她最新的对话（没结束就记进去，否则新开一段）；`Gifts.give` 和 `GiftInput` 跟着去掉。旧请求体带着 `conversation_id` 由 pydantic 忽略，`test_gift_giving.py` 里有一条请求带各种对话 id 都落进最新那段的测试。
- 测试：新增 `tests/test_past_conversations.py`；改 `test_gift_giving.py`（落点规则、帮助函数 `give/given` 改成 `**body`）、`test_gift_responses.py`（去掉 `conversation=`）。

**前端**

- `lib/api.ts`：新增 `LastMessage`、`ListedConversation`，`listConversations` 返回 `ListedConversation[]`。
- 最后一句共用：`lib/conversationList.ts` 新增 `previewOfOne(conversation)`（`previewOf` 包着它），组件 `components/conversations/PreviewText.tsx` 从对话列表行里抽出来（以列表现有写法为准：她的话字幕优先、没有才日语）。列表行和面板行都用它。
- `lib/pastConversations.ts`：`pastRows`（第一条是当前对话，其余去掉 `last_message` 为 null 的）、`pastOne`（`c` 合不合法：在列表里、不是第一条、不是空的）、`pastDay`（北京时间 `Asia/Shanghai`，今年「10月15日」，不是今年「2025年10月15日」，新文案 `copy.conversation.past.yearMonthDay`）。按 spec 不另立测试。
- `components/conversations/usePastConversation.ts`：读 `useSearchParams().get("c")`；`c` 无效时 `history.replaceState` 换成不带 `c` 的地址；有效时读 `/messages`，用 `conversationLog(emptyLog, {type: "loaded"})` 转条目。返回 `{ viewing, view, backToCurrent }`，`viewing` 是 `opening | open {entries, ended, at} | failed`。地址用原生 History API 改（Next 会同步 `useSearchParams`，页面不重挂）：从当前对话打开时 `pushState` 并在 `history.state` 里打标记 `eidolonPastFromCurrent`；从一段历史换到另一段用 `replaceState` 保留标记；`backToCurrent` 有标记就 `history.back()`，否则 `replaceState` 成不带 `c` 的地址。刷新后 Next 可能重写 state，标记丢了就走 replace，同样回到当前对话。
- `components/conversations/PastConversations.tsx`：面板，宽屏 Dialog（`sm:max-w-md`、`max-h-[80dvh]`）、窄屏 Drawer，内容上 `herVars`；每次打开重读列表，读时 Spinner，读不到时一句话加「再试一次」。「当前」用 secondary `Badge`，「她结束了」是 12px `EndedIcon` 加 Meta 字；正在看的那行 `bg-muted` 并带 `aria-current`。
- `ConversationView`：菜单三项带图标；历史对话里页首两行、电话键禁用（通话中也禁用，保留 `ref={focus.phoneKey}`）、只读卡 `ReadOnlyCard`、窄屏返回键走 `backToCurrent`；在历史对话里点「新对话」先 `backToCurrent` 再 `startNewConversation`。送礼链接 `giftsHref(characterId)` 不再带对话。
- 对话页 `page.tsx` 把 `ConversationView` 包进 `Suspense`（`useSearchParams`），生产构建通过。
- `LiveConversation`：`canStartNew` 多一条「当前对话的 log 里至少一条」，`startNewConversation` 本身也照这个拒绝（快照的注释说「`startNewConversation` would」，两者保持一致）。`openIdOf` 不再导出。
- 礼物：`giftsHref(characterId)`、`giftsFor` 只认 `to`、`giveGift(characterId, giftId)` 请求体只有 `gift_id`。
- 图标别名：`NewConversationIcon`（SquarePen）、`PastConversationsIcon`（History）、`UnpinIcon`（PinOff）、`HideIcon`（EyeOff）、`ShowIcon`（Eye）；文案在 `copy.conversation.past`。
- DESIGN.md 改了「对话页首」「输入栏」「从对话页跳来」「行菜单」，Overlays 加「更多菜单」「历史对话面板」，Icons 加两条。

**自己定的判断**

- 面板里当前对话若也被她结束，「她结束了」和「当前」两个标记都显示。
- 历史对话读取中：消息区转圈，底部已是只读卡（说明先写不带「她结束了」的那句），页首第二行等读到再出；读失败时消息区是 `Empty`「这段对话没能打开」加原因，只读卡照常能回去。
- 从直接打开的链接看历史对话时，浏览器返回键照浏览器自己的历史走（可能离开这一页）；只有从面板打开的才保证返回到当前对话。

**验收**：本地构建版 Playwright（1280×800 和 390×844，设备时区设成 Asia/Tokyo 验证北京时间划天）82 项全过：菜单图标（16px）、面板 Dialog/Drawer 和她的颜色、加载中、行内容和排序、空对话不列、`?c=`、刷新、无效 `c`（不存在、当前、空）、页首日期、只读卡两种说明、电话键禁用和提示、好感度标识、只读卡按钮/窄屏返回键/浏览器返回、呼叫中打开历史通话条还在、回复中（拦下 turns 请求）打开历史再回来回复在当前对话、历史里点新对话回到当前并且空的当前对话「新对话」禁用、长按菜单图标（含取消置顶）、旧礼物页链接带 `conversation` 照样预选。

**留给票 02**

- 面板行要加标题：`PastConversations.tsx` 行的第一行现在是「日期 + 标记」左右排；有标题时改成「标题（左，截断）+ 日期和标记（右，Meta、muted）」。`ListedConversation` 加 `title: string | null`，后端 `list_conversations` 的 `asdict(c)` 会随 `Conversation` 多一列自动带出。
- 历史对话页首那行照旧写日期（`pastDay(viewing.at)`），不写标题。
