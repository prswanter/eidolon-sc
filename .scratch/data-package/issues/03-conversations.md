# 03: 对话进数据包

**What to build:** 用户导出时能勾「对话」，数据包里带上和每位角色的每段对话：消息（原样，包括语气提示、好感度变化标签、`hurt` / `out_of_line`）、对话事件、对话标题、通话的统计记录，附上角色名。导入后对话按原来的时间插进去：在这个部署上新聊的仍是当前对话，导入的进历史对话；还没聊过的，导入的最后一段就是当前对话，可以接着聊；被她结束的仍是已结束。统计接着算。同一段对话导入两次只留一份；新部署上没有的角色，和她的对话整段跳过，并在结果里告诉用户。见 `../spec.md` 导入接口里的「对话」一节。

**Blocked by:** 02

**Status:** done

- [x] 导出：`data.json` 带 `conversations`，每段有包内 ID、`character_id`、`character_name`、`created_at`、`title`，`messages` 按原来的先后排，`events` 和 `calls` 照原样。所有字段原样导出
- [x] 记忆的 `conversation` 接上：勾了对话时，指向包内对话 ID；没勾时是 `null`
- [x] 导入：角色不在这个部署的角色配置里的，整段跳过（连同通话记录），记进结果的 `skipped`（带包里的角色名和跳过的段数）
- [x] 导入去重：同一位用户、同一位角色、开始时间相同的对话已经存在，就整段跳过、不做逐条合并；包里的记忆引用它时，改成引用已有的那段
- [x] 其余的换新对话 id，消息按原来的先后插入，对话事件和通话记录照原样挂上；当前对话不另定规则，照旧取最新开的那个
- [x] 送礼事件里的礼物不在这个部署的礼物表里的，这一条事件跳过，不算进结果
- [x] 导入的记忆的 `conversation` 对应到新对话 id；对话被跳过（角色不在）的存成空
- [x] 好感度、抽奖次数、重置卡、礼物背包都不碰
- [x] 结果里 `conversations` 是这次真正新加的段数；前端结果那句话带上跳过的角色和段数
- [x] 前端「对话」勾选框能用（两边），导入成功后刷新对话列表的数据
- [x] 格式说明文档补上 `conversations`
- [x] 后端测试（走对外接口）：A 上造几段对话（一段被她结束、一段带送礼事件和接通了的通话、一段起了标题），导出后导入 B，B 的对话列表、当前对话和历史对话的先后、已结束、标题、对话记录（含送礼事件和她挂断的记录、好感度变化标签）、统计里的回合、通话和认识多久都和 A 一致；B 上的好感度是信任、背包和抽奖次数为零；B 上已经和她聊过的，B 的那段仍是当前对话；导入同一份两次，第二次什么也没多；两个有重叠的包先后导入，重叠的那段只有一份；角色不在 B 的被跳过并出现在 `skipped`；礼物不在礼物表的送礼事件被跳过，之后的回合照常；导入后在成了当前对话的那段里照常能发回合；记忆上的对话引用在删掉那段历史对话后照常变空
- [x] 受影响的测试和类型检查通过（`scripts/affected-tests.sh`），CI 绿

## Comments

### 票 01 交接

- `data_package.chosen` 已经做到不勾对话就去掉照片；`Imported.skipped` 和前端 `importSummary` 的跳过那句话（「跳过了和月岡恋鐘的 2 段、櫻木真乃的 1 段对话，这里没有她们。」）都已写好，有 vitest。
- 写入走 `import_` 里自己开的连接 `db`、同一个事务；这张票有多张表，记得补一条「中途出错全部回滚」的测试（票 01 只有一次写，没测）。
- 前端 `OFFERED` 加 `"conversations"`；导入后刷新对话列表的数据（`useDirectory()` 里的对话目录）。

### 票 02 交接

- 记忆的 `conversation` 现在导出一律 `null`，导入一律存空：`PackagedMemory.of` 要填包内对话 ID（就是原来的 `conversation_id`；没勾对话时仍是 `null`），`PackagedMemory.carried()` 里 `conversation_id=None` 那行要换成「包内对话 ID → 新对话 id 或已有那段的 id，跳过的、没勾的为空」。`Memory` 现在不带 `conversation_id`，`Memories.kept` 的查询要一起加上。
- `PackageData` 上的校验 `_memories_superseded_by_memories` 旁边再加一条：记忆的 `conversation` 不为空时，必须引用得上包里的对话，否则坏包（格式说明里「包内 ID 引用不上」已经写了）。
- 写对话要在 `_import` 里写记忆之前，记忆才拿得到新对话 id。

### 实现说明（票 03）

- `store.py`：新加 `KeptMessage`、`KeptEvent`、`ConnectedCall`、`WholeConversation`（一段对话连同下面全部记录的原样）；`Store.whole_conversations(user_id)` 按开始先后读出用户的全部对话；模块级 `add_carried_conversation(db, user_id, conversation)` 在调用方的事务里写一段，返回这里的 id 和是不是新加的。去重按「同一用户、同一角色、开始时间解析后相等」比，不比文本，库里早年 `isoformat()` 没带微秒的也认得出。顺手把 affinity、segments 的读写编码收成 `_change`、`_stored_change`、`_stored_segments`，`_insert_message`、`_insert_event` 也改用它们。
- `data_package.py`：`PackagedChange`、`PackagedSegment`、`PackagedMessage`、`PackagedEvent`、`PackagedCall`、`PackagedConversation`；`PackageData.conversations`；`DataPackages` 构造多了 `characters`、`gift_catalog`（`assembly.py` 传进来）。`_import` 先写对话（`_add_conversations`，同时数 `skipped`），拿到「包内对话 ID → 这里的 id」再写记忆。
- `memory.py`：`Memory` 加 `conversation_id`（默认 `None`），`Memories.kept` 一起查出来；`PackagedMemory.of(memory, with_conversations)`、`carried(conversations)`。
- 前端：`OFFERED` 加 `conversations`；导入成功且新加了对话时调 `useDirectory().refresh()`（只重拉摘要，不像 `reload` 那样整页回到载入中）。
- 格式说明补了 `conversations` 一节和记忆 `conversation` 的引用规则。
- 测试：`backend/tests/test_data_package_conversations.py`（往返、合并时谁是当前对话、去重和有重叠的两个包、角色不在、礼物不在礼物表、记忆的对话引用和删掉后变空、只导入记忆时引用为空、坏包、中途出错全部回滚且不算次数）。她挂断、结束、送礼和通话照现有测试的做法直接写进 A 的库。

判断题（按规格和现有代码选的）：

- 包里同一个对话 ID 出现两次当坏包（和记忆的规则一样）。
- `gift` 事件必须带 `gift_id`、别的事件不能带，否则坏包：她的提示词和对话记录都按礼物表念礼物名，空的会出错。
- 跳过的角色在包里没有名字（导出时那边已经没有她）时，`skipped` 里用 `character_id` 代替名字。
- 记忆引用的对话不在包里（包里没有 `conversations` 或者 ID 对不上）当坏包；导入时没勾对话，或那段因为角色不在被跳过，记忆存成空。
- 用户消息的 `segments` 存 NULL、她的回复存 JSON（哪怕是空列表），导入时按 `role` 还原，和 `_insert_message` 写的一样。
- 导出 `messages` 里先不带 `photo` 键，留给票 04；现在包里带了 `photo` 会因为多出来的键当坏包。

code-review（固定点 f1da502）修了：礼物事件和 `gift_id` 不对应时会让她的提示词出错（上面那条判断）；store 里重复的编码；测试里重复的去 ID 函数和与 `test_data_package.py` 重复的时间无时区一条；导入顺序。只报告、没改：`ConnectedCall` 和现有的 `KeptCall` 名字相近（一个是包里带的那一行，一个是统计用的、带角色）；`WholeConversation.id` 用 `int | str` 没用 `memory.PackageKey`（store 不反过来导入 memory）；`PackagedMessage.of`/`kept` 逐字段对拷，和 `PackagedChange` 用 `asdict` 的写法不一样，字段带嵌套转换，保持显式。

