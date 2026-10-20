# 02: 记忆进数据包

**What to build:** 用户导出时能勾「记忆」，数据包里带上他所有的记忆，包括被取代的和它们之间的取代关系，以及来源角色（ID 和名字）。导入到另一个部署或账号后，记忆页上能看到这些记忆，被取代的仍标着「已被取代」；和已有记忆原文重复的只留一条。来源角色在这个部署上没有的照样导入，照现在的做法显示成「已不在的角色」。导入后服务器在后台补算向量，她在之后的回合里想得起这些事。见 `../spec.md` 导入接口里的「记忆」一节。

**Blocked by:** 01

**Status:** done

- [x] 导出：`data.json` 带 `memories`，每条有包内 ID、`source_character_id`、`source_character_name`、`conversation`（这张票里一律是 `null`，对话类在票 03 接上）、`text`、`created_at`、`superseded_by`（包内 ID 或 `null`）
- [x] 导入去重：这位用户已有同样原文的记忆，就不新加，包内 ID 对应到已有的那条
- [x] 新加的记忆换新 id，`superseded_by` 按包内 ID 重新对应到新 id 或已有那条的 id。已有的记忆一律不改，包括它们的取代关系
- [x] 来源角色照原样存，不论这个部署上有没有她
- [x] 不在事务里算向量。导入成功后在后台给这位用户还缺向量的记忆补算，算部署者的钱；补算失败的照现有的懒补路径在下次检索时补
- [x] 结果里 `memories` 是这次真正新加的条数
- [x] 前端「记忆」勾选框能用（导出和导入两边），导入成功后刷新记忆页的数据
- [x] 格式说明文档补上 `memories`
- [x] 后端测试（走对外接口）：A 上用现有的记忆提炼造出几条记忆，有取代关系、来源角色各不相同，导出后导入 B，B 的记忆页条目、「已被取代」、来源角色名都和 A 一致；B 上已有同样原文的那条不重复，指向它的取代关系对应到已有的那条；来源角色不在 B 的角色配置里时显示成已不在的角色；导入后她在下一个回合能想起导入的记忆（用测试替身的向量化验证）；导入同一份两次，第二次 `memories` 是 0
- [x] 受影响的测试和类型检查通过（`scripts/affected-tests.sh`），CI 绿

## Comments

### 票 01 交接

- 往 `data_package.py` 的 `PackageData` 加 `memories` 字段（模型是 `extra="forbid"`、`strict=True`），导出时在 `DataPackages.export` 里填并记 `counts`；`_read` 里「`data.json` 的键要和 `categories` 一致」的检查按字段自动生效。
- 导入的写入必须走 `import_` 里那条自己开的连接 `db`、在同一个 `with db:` 里：记忆模块的写法照 `store.write_profile` 抽成接收 `db` 的函数。补算向量放在事务提交之后。
- 时间字段用 `data_package.Time`（解析后按库里的写法写回）。
- 前端 `lib/dataPackage.ts` 的 `OFFERED` 加 `"memories"`；导入成功后在 `DataPackageSettings.tsx` 的 `submit` 里像档案那样刷新记忆条数（`useSettingsValues().memoryCountChanged`），`importSummary` 已经会写「n 条记忆」。

### 实现说明（票 02）

- `memory.py`：新增 `CarriedMemory` 和模块级的 `add_carried(db, user_id, carried)`，在导入的那条连接、同一个事务里写；先逐条按原文查重或插入，再给新加的那几条按包内 ID 设 `superseded_by`。新增 `Memories.embed_carried(user_id)`：在后台（`detached()` 上下文，部署者的向量化服务）补算这位用户缺向量的记忆；`embed_missing` 多了个只算一位用户的 `user_id` 参数，按 200 条一批存，断了也留下算完的。原来的 `_all` 改名公开成 `kept`（导出用）；把「让这位用户的回合、列出、删除稍等这个任务」抽成 `_hold`，写下记忆和补算共用。
- `data_package.py`：`PackagedMemory`、`PackageData.memories`；包内 ID 可以是整数或字符串；包内 ID 重复、`superseded_by` 指向包里没有的或者自己，整包当坏包。`DataPackages` 多收一个 `Memories`；`import_` 改成 async：事务在线程里跑完以后，有新加的记忆才调 `embed_carried`。
- 前端：`OFFERED` 加 `memories`；导入后有新加的记忆就重新取记忆列表，用 `memoryCountChanged` 更新设置里的条数。记忆页本身每次打开都会重新取。
- 格式说明补了 `memories` 一节。
- 判断题：
  - 补算任务登记进和「写下记忆」同一个等待集合：导入后紧接着的回合、列记忆、删记忆最多等 5 秒（`SETTLE_TIMEOUT`）让它算完。这样测试能确定地验证是服务器在后台算的，代价是导入大量记忆后第一次列出最多慢 5 秒。
  - 补算出的向量化调用照常记成独立的服务调用运行记录（和写下记忆一样，不带内容、不写是谁导入的）；规格「不写运行记录」指的是导入本身，没另外处理。
  - 导出不等正在写下的记忆（`kept` 不 settle）：刚说完的那句可能漏一条，影响很小。
  - 包里两条原文相同的记忆合成一条，后一条的取代关系丢掉；取代成环（A→B、B→A）不当坏包，导入后两条都标「已被取代」，删掉一条另一条就恢复。
  - 导出的来源角色名：这个部署上已经不在的角色导出成 `null`（拿不到名字）；导入时名字不用，按这里的角色配置显示。
  - `text` 限 1 到 200 字（`MAX_MEMORY_LENGTH`），超了当坏包。
