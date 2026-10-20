# 01: rerank 校准能标注作品资料，并跑出基线

**What to build:** 让 `eidolon eval rerank` 如实反映线上回合的行为：线上是剧情、角色资料、作品资料三类参考资料一起重排、用同一个阈值筛。现在的校准集没法标注作品资料，所以作品资料的候选全被判为「不相关」，校准结果失真。修好以后跑一次，得到一条可信的基线，供 03 改名和改提示词之后对比。背景见 `../spec.md`，决定的来由见 `../grilling-notes.md`。

**Blocked by:** None (can start immediately)

**Status:** resolved

- [x] 校准集的问题类型增加作品资料一类，标签是作品资料条目的标题。
- [x] 作品资料的候选按标签判定为相关、可放可不放或不相关。
- [x] kind 写错、作品资料问题引用了 `world.json` 里没有的标题时，命令报出清楚的中文错误。
- [x] 报告分为两组：「参考资料」包括剧情、角色资料、作品资料，用 references 阈值；「记忆」用 memories 阈值。旧的「剧情与角色资料」标题不再出现。
- [x] 从 `characters/world.json` 起草约 6 条作品资料的校准问题（歌曲、唱片、演出日各 2 条），写上 relevant 和 acceptable，交人工审阅后提交。
- [x] `test_rerank_eval` 补上作品资料的用例和上面的错误用例，经由 `evaluate` 和报告断言。
- [x] 用真实服务跑一次 `eval rerank`，把基线（参考资料和记忆两组的分布、阈值命中）记到本 ticket 的 Comments。只报告结果，不改阈值。

## Comments

### 基线（2026-09-28，ticket 01、02、05 合并之后，03 之前）

- 命令：`uv run --env-file ../.env eidolon eval rerank`（在 `backend/` 下）。
- 重排模型：`Qwen/Qwen3-Reranker-0.6B`；向量化模型：`Qwen/Qwen3-Embedding-0.6B`。
- 这是新代码第一次打开真实数据库。旧的 `character_facts` 和 `world_entries` 已经迁移进 `embedded_texts`（角色资料 55 条，作品资料 1431 条）。迁移前的数据库备份在 `backend/data/backup-20260928/`。

**参考资料**（33 条问题，剧情、角色资料、作品资料一起重排，references 阈值 0.3）

```
相关　n=48 最低 0.0043 p10 0.6390 p25 0.9363 中位 0.9977 p75 0.9995 p90 0.9998 最高 1.0000
不相关 n=1026 最低 0.0000 p10 0.0000 p25 0.0001 中位 0.0010 p75 0.0264 p90 0.3850 最高 0.9996
阈值 0.3：相关命中 46/48，不相关误放 117/1026
```

没进入向量检索结果的相关候选（召回问题，和阈值无关）：
- `mano-story-flower-bird-park-arc`：`produce_events/100100401`
- `mano-story-bench-nap`：`produce_events/200100411`
- `kogane-story-leaving-home`：`produce_events/100400504`
- `kogane-story-homecoming-live`：`produce_events/600400109`
- `kogane-work-release-wing03`：唱片《…BRILLI@NT WING 03 バベルシティ・グレイス》（LACM-14783）

**记忆**（11 条问题，memories 阈值 0.01）

```
相关　n=11 最低 0.0007 p10 0.0018 p25 0.0147 中位 0.1968 p75 0.9511 p90 0.9999 最高 0.9999
不相关 n=108 最低 0.0000 p10 0.0001 p25 0.0001 中位 0.0002 p75 0.0005 p90 0.0010 最高 0.0502
阈值 0.01：相关命中 8/11，不相关误放 2/108
```

**6 条作品资料问题**
- 5 条的相关条目都排第一或并列第一，分数在 0.997 以上。
- `kogane-work-release-wing03`（L'Antica 的第一张 CD 什么时候发售）是召回问题：唱片 WING 03 没进向量检索的候选，排在前面的是各首 L'Antica 版歌曲（最高 0.44）。问题里没写唱片名，只写了「第一张」，向量检索靠名字找不到它。
- 容易混淆的条目分数也很高：
  - `幻惑SILHOUETTE` 的各成员 Ver. 在 0.997 左右；
  - HOPEFUL FE@THERS -Stella- 是 0.9994；
  - `kogane-work-live-wagamama` 里，角色资料「档案 / 名字的由来」以 0.9996 排在演出日前面。
  
  所以 0.3 的阈值挡不住它们，只能靠提示词和模型自己分辨。

只报告，不改阈值。

