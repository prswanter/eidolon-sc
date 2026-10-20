# 05: 剧本缓存 module：「拉一个剧本」只写一次，缓存以文件为准

**What to build:** 把 `story_sync` 里三处拉剧本的规则（已汉化不下载、失败结局不下载、已有就跳过、下载、镜像上没有、记 ETag）、`_Cache` 的剧本部分和 `Mirror.download` 的写盘收进一个 `ScriptCache` module。缓存里有没有一个剧本以文件本身为准，让 `docs/deploy.md` 的「删掉缓存里的剧本，下次同步会重新下载」对卡牌、相册、活动都成立。

**Blocked by:** —

**Status:** resolved

- [x] 回归测试（卡牌、相册、活动各一个）：删掉缓存里的剧本后再同步，镜像被请求、剧本回到盘上
- [x] 相册列出而镜像上没有的剧本，相册没变时不再被请求
- [x] 新增 `eidolon/script_cache.py`：`ScriptCache`，interface 见下
- [x] `Mirror.download` 改为 `Mirror.script(script, etag)`，不再写盘
- [x] 剧情库新增 `is_translated(id)`，取代 `story_sync` 里的 `imported_from(x) == "csv"`
- [x] 三类进度记录（`cards.json` / `albums.json` / `events.json`）只表示「还需不需要再问镜像」；每次同步在本地核对所有已知剧本
- [x] `docs/deploy.md`：保留删缓存重下的说明，补上强制重试「镜像上没有」的剧本
- [x] 现有测试不改仍全部通过

## 背景（2026-09-26，架构体检候选 1）

PR #9（剧情同步）合入后的架构体检发现：

1. 「拉一个剧本」在 `_fetch_cards`、`_fetch_albums`、`_walk_event` 里各写了一遍，细节各不相同：只有卡牌会带 ETag 条件请求、处理「没变」；只有相册会先查失败结局；只有活动在「镜像上没有」时停下。相册和活动计 `downloaded` 时总是加一，这只在它们总传 `etag=None` 时才对，没有写在任何地方。
2. 「这个剧本缓存了吗」有两个答案：文件在不在，和进度记录（`_CardState.complete`、相册 ETag、`events.json`）。已拉完且没变的卡、回 304 的相册、不是最新的活动，都只看进度记录，于是删掉缓存里的剧本后，下次同步既不重新下载、也不再导入它（已复现：删 `produce_events/300100401.json` 后再同步，镜像一次也没被请求）。
3. `Mirror.download` 收一个 `Path` 并自己写 `.part` 再替换，缓存布局一半在 `_Cache`，一半在 `Mirror`。
4. 「已汉化」写成 `corpus.imported_from(x) == "csv"`，在 `story_sync` 里出现 8 次，把存储格式当成领域概念。

## Comments

### 决定（2026-09-26，grill-with-docs）

- **承诺**：保留 `docs/deploy.md` 的「删掉缓存里的剧本，下次同步会重新下载」，改代码让它对三类剧情都成立。
- **以文件为准**：剧本文件在，就是缓存了。三类进度记录只回答「还需不需要再问镜像」：没变的卡不再请求剧情 API，但本地核对它列出的剧本、缺的补上；相册回 304 时同样本地核对；走完的活动不再试探新话，但本地核对第 1 到 n 话，最新活动照旧重走。只多本地查文件，网络请求不变。`_CardState.complete` 不再使用，读到时忽略。
- **范围**：只管剧本（文件、`.etag`、`.missing`）。三类进度记录留在 `_Cache`，归候选 2。
- **跳过规则在 ScriptCache 里**：已汉化、失败结局都由 `fetch` 判断，对三类剧情统一适用（卡牌和活动的剧本编号不会匹配失败结局的规则，统一执行无害）。ScriptCache 依赖剧情库和 `story_import.is_failure_ending`。
- **interface**：
  - `fetch(script, *, recheck=False, retry_missing=True) -> 结果`，结果是「已汉化 / 失败结局 / 已有 / 刚下载 / 没变 / 镜像上没有」之一。`recheck`：已有的文件也带 ETag 条件请求一次（卡牌版本变了时）。`retry_missing`：记着「镜像上没有」的剧本也再问一次。
  - `path(script) -> Path | None`：盘上有这个剧本时的路径，给导入用。
  - `downloaded(前缀) -> 剧本列表`：取代活动那边的 glob。
  - `_Cache` 的 `script_path`、`etag`、`set_etag`、`event_scripts` 移走，调用方不再接触 ETag。名字可在实现时微调。
- **镜像上没有**：ScriptCache 在剧本旁记一个 `.missing`，下载成功时清掉。卡牌、活动总是 `retry_missing=True`（卡牌的新剧本常晚几天上镜像；最新活动的下一话每次都要问，404 就是「走到头了」）；相册只在相册变了时 `retry_missing=True`（相册 2024 年后不再更新，缺的基本永远缺）。管理员删掉剧本文件不会留下 `.missing`，所以一定会重拉；想强制重试缺失的剧本就删 `.missing`。
- **Mirror**：`download(script, target, etag)` 改为 `script(script, etag)`，返回新内容和 ETag、没变、或镜像上没有；帧数组的格式检查留在 `Mirror`。落盘、`.part` 原子替换、`.etag` 都归 ScriptCache。
- **剧情库**：新增 `is_translated(id)`；`CONTEXT.md` 新增「汉化版」（已提交）。
- **计数**：调用方按 `fetch` 的结果计入同步报告，报告字段和日志口径不变（`translations_kept` 仍只算卡牌和相册，`missing` 与 `album_missing` 分开，`album_failures` 仍只算相册）。报告的形状归候选 3。
- **兼容**：磁盘布局不变（`scripts/<类型>/<编号>.json` 与旁边的 `.etag`），现有 `cards.json` 等照旧能读，已有的缓存不用重拉。
- **文件**：新建 `backend/src/eidolon/script_cache.py`，只被 `story_sync` 使用。
- **测试**：仍只经 `sync_stories` 测外部行为；现有测试不改，作为重构的安全网（按请求次序计数的测试若因顺序变化失败，再按行为重写）。新增：卡牌、相册、活动各一个「删缓存重下」，相册「镜像上没有」在相册没变时不再请求。
- 不写 ADR（都容易撤回）。

### 实现（2026-09-26）

- `eidolon/script_cache.py`：`ScriptCache(directory, mirror, corpus)`，`fetch(script, *, recheck=False, retry_missing=True) -> Fetched`、`path(script)`、`kept(kind) -> {剧本: 路径}`。结果比 ticket 多一种、名字有调整：`translated / failure / kept / downloaded / unchanged / missing / known_missing`（「已有」叫 `kept`；`known_missing` 是记着「镜像上没有」、这次没再问；取代 `downloaded(前缀)` 的是 `kept(kind)`，免得和结果 `downloaded` 撞名）。
- `Mirror.download(script, target, etag)` → `Mirror.script(script, etag) -> Script | "unchanged" | "missing"`，`Script(content, etag)`；帧数组检查留在 `Mirror`，`mirror.py` 不再 import `os`/`Path`。
- `StoryCorpus.is_translated(id)`；`story_sync` 和 `story_import` 里的 `imported_from(x) == "csv"` 全部换掉。
- `story_sync`：`_Cache` 只剩三类进度记录，`_CardState.complete` 删除（旧 `cards.json` 里的字段读时忽略）。没变的卡、回 304 的相册、走完的非最新活动都经 `fetch` 在本地核对；卡牌变了时 `recheck=True`，相册只在变了时 `retry_missing=True`。
- 测试：新增卡牌、相册、活动各一个「删缓存重下」（请求、盘上、剧情库都断言）；「相册没变时不再问镜像上没有的剧本」由现有的 `test_an_unchanged_album_is_asked_for_conditionally_and_nothing_is_downloaded_again` 覆盖。现有测试一行没改。
- `docs/deploy.md`：补上 `.missing` 标记与强制重试。
- 验证：`pytest` 318 passed，`pyright` 0 errors；新增三个测试在改动前都失败（镜像一次也没被请求）。变异检查：卡牌变了时不 recheck、相册总是 retry_missing、把 `.etag` 当成「已缓存」、去掉失败结局规则，各自至少一个测试失败。兼容：用改动前的代码同步出一份缓存，再用新代码同步，0 下载。

### 评审（2026-09-26，code-review）

- 修复：`story_import` 里漏掉的一处 `imported_from == "csv"`；没变的相册里，管理员删掉 `.missing` 后镜像仍然没有的剧本，也记入 `album_missing` 并写日志（之前静默）；`kept(kind)` 直接给出路径，去掉回查和 `assert`；`fetch` 里 `.etag`/`.missing` 路径各算一次；相册和活动的回归测试补上「剧本回到盘上」。
- 已知、接受的差异：
  - 升级后的第一次同步：旧缓存没有 `.missing`，相册里镜像上没有的剧本会各被问一次（404），之后有了标记就不再问；这一次会记入 `album_missing` 并写日志。
  - 没变但未完成的卡（旧代码的 `complete=False`）不再每次把已汉化的剧情计入 `translations_kept`：它这次没被问 API，符合该字段「asked about this sync」的定义。
  - 活动试探留下的 `.missing`（最新活动的下一话、试探过的编号）不会清掉，数量有上限，无害。
- 保留不改：按 `Fetched` 计数的几处分支（报告的形状归候选 3）；跳过规则在 `ScriptCache` 里（grill 的决定）；`Mirror.script(script, …)` 的参数名沿用全仓库的 `script: str`；`Fetched` 里调用方不区分的 `kept`/`unchanged`/`known_missing` 留着，让结果完整、可读。

### 后续候选（2026-09-26，架构体检的其余三个，暂缓）

同一次体检（范围：PR #9 剧情同步）还提出了三个加深候选，合入候选 1 之后评估为暂缓，理由是它们目前没有 bug、近期也不会改到。下次体检若再提出，先看这里的条件是否已经满足：

- **候选 2：每类原文剧情一个来源 module**（卡牌、相册、活动各自负责发现、进度记录和命名，`sync_stories` 驱动一个可续跑的循环，明文写出「卡牌优先于相册」）。候选 1 之后三个拉取函数已只剩十几行，剩下的摩擦是拉取和命名分在两处、优先级靠 dict 顺序。**重新考虑的条件**：新增一类剧情来源，或镜像 / 相册的数据结构变化需要改动同步。依赖本 ticket 的 `ScriptCache`。
- **候选 3：同步结果自己产出摘要、需人工核对的清单和退出码**（`__main__._sync_story` 现算文案与退出码，退出码 0–2 的含义在脚本、注释、`deploy.md` 各写一遍）。**重新考虑的条件**：报告要加字段或改口径。其中缓存 JSON（`cards.json` 等）损坏时直接 traceback、被脚本记为「配置错误」，是一个可以单独修的小 bug，不需要这个重构。
- **候选 4：收窄 `Mirror` 的 interface**。最大的泄漏（`download` 收落盘路径）已在本 ticket 修掉；剩下 `ALBUM_IDOLS` 被同步逻辑使用、`album()` 的三态返回。**重新考虑的条件**：相册来源变化，或做候选 2 时顺手处理。只有一个 adapter，不新增 port。
