# 02: 调研：Jev 能不能给台词判断情绪

Type: research
Status: resolved
Blocked by: none

## Question

Jev（`typesafe/jev-1.13`，经 OpenRouter System One，见 `.scratch/jev-provider/research.md` 和 `backend/src/eidolon/retrieval.py`）能否对「用户这句话 + 角色这一段日语台词（及中文字幕）」回答一个多选一的问题（例如从 7 种情绪里选一种），返回什么形状（choice、每项概率？）；一次请求能否带多个问题；实际延迟（p50/p95，与 Fish Audio 合成一段的时长相比）；费用；失败和超时的表现。能实测就实测（`JEV_API_KEY` 在后端环境里）。

## Research

调研在分支 `research/jev-emotion` 上进行，结论写在 [`research/jev-emotion.md`](../research/jev-emotion.md)（2026-10-01 从该分支挪进 main，分支已删除）。

## Answer

可以。详细结论见 [`research/jev-emotion.md`](../research/jev-emotion.md)，下面是摘要：

- **题型**：Jev 有 Choice 题型，从最多 255 个选项里选一个，中文选项名原样返回。返回 `choice`、每个选项的 `probabilities`（加起来为 1，键的顺序不固定，要按名字读）和 `confidence`。没有多选题型。
- **一次请求带多题**：可以，各题独立作答。一次请求判断一条回复的全部 4 段，也不变慢。
- **准确度**（自编自标的 20 句，仅供参考）：逐段判断 18/20 与标注一致，两处不一致都是 confidence 约 0.5 的两个选项几乎打平；整条回复 4 段一起判断 40/40。打平的句子重复问 5 次，答案会在两种情绪之间来回跳，所以 confidence 低时需要退回平静或上一段的情绪。
- **延迟**（开发机经 OpenRouter 实测）：p50 约 0.4s，p95 约 0.8–1.5s；Fish Audio 首个音频到达的 p50 是 0.59s，一段合成完是 3.5s。和合成同时进行的话，情绪通常在开口前就到了。部署后要在服务器上重测。
- **费用**：约 $0.000026 每段，一条 4 段的回复一次请求约 $0.000065。
- **失败**：整个请求失败，没有部分答案（401、400，文档里还列了 402、429、502、524、529）。OpenRouter 上只有 TypeSafe 一家提供，没有备选。官方说中文和日语的准确度低于英文。现有的 5s 超时太长，适合改成短超时、不重试、失败时用默认情绪。
