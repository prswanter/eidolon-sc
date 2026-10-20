# 05: world sync 的名单 module

**What to build:** world sync 的唱片、演出、曲目单三个导入，共用一个名单 module。它由世界设定里的偶像、组合、社长和事务员构造，纯 in-process，只有一套规范化，回答三件事：
- 一个人名（可以附带声优名）是哪位偶像；
- 一个名字或读音是哪个组合；
- 一个人是不是社长或事务员。

规范化规则：
- NFKC，`’` 换成 `'`，去掉非文字字符，casefold；
- 组合的名字和读音都先把片假名转成平假名再比；
- 偶像名和声优名去空格、去掉「（初代）」这类尾注后比，也做 NFKC。

留在各导入里的：
- 从各自来源抽出人名和声优名（Lantis 的「名字（CV:xx）」、wikiwiki 的角色和声优两栏、imas-db title 属性里的「名字(CV:声优)」）；
- 唱片的特别组合、全員和拆分多人；
- 演出的「标题行不算人」。

world sync 在建立名单之前要在官方组合页和 SPARQL 之间对组合，这一步也改用同一套规范化。曲名比对不动。各导入共用的小工具（取网页的函数类型、片假名转平假名、去空格）收进一个共享的同步小工具模块；把 HTML 拆成行的函数两份标签集合不同，各自保留。背景见 `../spec.md`。

**Blocked by:** None (can start immediately)

**Status:** resolved

- [x] 名单的表驱动测试覆盖以下情况：
  - 全角组合名；
  - `’` 和 `'`；
  - 片假名读音；
  - 「三峰結華（初代）」；
  - 只有声优名；
  - 带空格的声优名；
  - 事务员和社长；
  - 对不上的名字。
- [x] 三个导入里各自的偶像和组合对应、各自的规范化函数，以及重复的小工具都删掉。
- [x] `test_world_sync` 经由 CLI 的端到端测试不改断言，全部通过。
- [x] 用真实来源重跑 `eidolon world sync`：`characters/world.json` 和导入报告要么不变，要么每一处变化都能解释（比如原来对不上的现在对上了），解释记到本 ticket 的 Comments。出现意外的变化就停下来，先和人讨论再提交。
- [x] 全部测试通过，pyright 无新错误。

## Comments

### 2026-09-28 实现记录

**名单的 interface**（`backend/src/eidolon/roster.py`）：
- `Roster(idols, units, staff=())`，由世界设定的偶像、组合、社长和事务员构造。
- `idol(name, cv=None) -> str | None`：先按名字，对不上再按声优名；两个都可以是 None 或空。
- `unit(name) -> Unit | None`：按组合名或读音；特别组合不在里面。
- `is_staff(name) -> bool`：社长或事务员。
- 另有 `idols`（偶像名字，按世界设定的顺序，曲目单导入用来排序）和 `units`（唱片导入用来判断「恰好是一个组合的成员」）。
- 模块级的 `unit_key` 和 `person_key` 就是那两套规范化；`world_sync` 在建立名单之前对官方组合页和 SPARQL 的组合、唱片导入比对特别组合名，都用 `unit_key`。

**留在各导入里的**：Lantis 的「名字（CV:xx）」拆分、wikiwiki 的角色和声优两栏、imas-db title 属性的「名字(CV:声优)」拆分；唱片的特别组合、全員、拆分多人；演出的「标题行不算人」；各自的 `_lines`；曲名比对（`release_sync._key`、`live_sync._comparable`）。共用的 `Fetch`、`hiragana`、`without_spaces` 在 `backend/src/eidolon/sync_tools.py`。

**顺带统一的一处**：曲目单导入里「只出演点名曲目的人」（出演名单上标 ※ 的），原来按 title 属性去掉空格后的名字和出演偶像逐字比，现在也经由名单对应。

**测试**：`test_roster.py` 34 条表驱动用例，先写，因为模块不存在而失败，然后才实现。`test_world_sync.py` 没有改，全部通过。改动前的基线（HEAD 的快照）：697 passed、1 failed（`test_voice_interruption.py::test_interrupting_her_while_she_speaks_is_passed_on_before_reconnecting`，之前的 ticket 已经记过它是计时上的偶发失败），pyright 0 errors。改动后：732 passed，pyright 0 errors。

**真实验收**：同一天分别用改动前的代码（HEAD 的快照）和改动后的代码，对真实来源各跑一次 `uv run eidolon world sync`，两次都以已提交的 `characters/world.json` 为旧文件。结果：
- 两次写出的 `world.json` 逐字节相同，也和已提交的文件相同，`git diff` 为空（资料截止日同为 2026-09-28）。
- 两次的导入报告逐行相同：偶像 28 位、组合 8 个、唱片 168 张、歌曲 1175 首、演出 44 场、有曲目单的演出日 71 个，都「没有变化」；各类「对不上」的条数（曲目单里对应不到偶像的演唱者 45 项、那天不在出演偶像里的 16 项等）也相同。
- 也就是说，统一规范化在现在的真实数据上没有造成任何变化：全角组合名、`’`、带空格的声优名这些写法，当前的来源里正好没有落在原来各导入规则不同的那几处。没有需要提交的数据变化。

