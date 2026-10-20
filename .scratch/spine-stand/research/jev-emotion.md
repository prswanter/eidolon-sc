# 调研：Jev 能不能给台词判断情绪

访问与实测日期：2026-09-30。结论都附了一手来源（TypeSafe 官方文档、OpenRouter 官方文档和 API）或本机实测。标 **未确认** 的是一手来源里没查到的。

## 结论先行

- **能。** Jev 有专门的多选一题型 **Choice**：你给一组选项（最多 255 个），它返回选中的一项 `choice`、**每个选项的概率** `probabilities`（加起来等于 1），以及一个 0–1 的 `confidence`。7 种情绪正好用一道 Choice。
- **一次请求可以带多道题**，题型可以混用（Choice、Score、Noul），各题独立、并行评估。官方说多加题几乎不增加延迟，只多花题目本身的 token。实测：一道情绪题 p50 0.38 s；情绪 + 强度 + 是否同意 + 动作四道题 p50 0.36 s，没有变慢。**一整段回话（4 段台词）用一次请求、每段一道情绪题**，p50 0.44 s，而且 20 句台词和我的标注全部一致。
- **延迟**（本机实测，经 OpenRouter）：单题 p50 0.38 s / p95 1.52 s；四题 p50 0.36 s / p95 0.83 s；4 段合一请求 p50 0.44 s / p95 0.94 s。同一批台词让 Fish Audio 合成：**首字节** p50 0.59 s / p95 1.30 s，合成完 p50 3.46 s，每段音频本身长约 5.7 s。也就是说，Jev 通常**比 Fish 吐出第一块音频还快**，和 TTS 并行跑的话，多数时候情绪能赶在这一段开口前到。
- **费用**：只按输入 token 收费，$0.042 / 百万 token，输出免费。实测一道情绪题约 630 个输入 token，约 $0.000026；4 段合一请求约 1,550 token，约 $0.000065。1 美元大约够 1.5 万次回话。
- **失败**：错误都是 HTTP 状态码加 JSON（`{"error":{"message","code"}}`），没有「部分答案」。实测 40 + 40 + 5 次正常请求全部 200。需要注意：TypeSafe 是 OpenRouter 上 Jev 唯一的 provider，没有备用；官方说 CJK 的准确率不如英文；接近平局时，同一句话重复问，`choice` 会在两项之间来回跳。

---

## 1. 能不能问多选一？返回什么形状？

**Choice 题型**（来源：https://docs.typesafe.ai/api 、https://docs.typesafe.ai/primitives/choice ）

- 请求：`{type: "choice", instructions, criteria}`。`criteria` 是「选项名 → 描述」的 map，描述可以是字符串、对象、数组，也可以是 `null`（选项名本身就够清楚时）。"You can have a maximum of 255 options per Choice."
- 选项名和描述**都会送进模型**；题目的 key（比如 `emotion`）**不会**送进模型，所以题目要写全在 `instructions` 里。
- 回答：

  | 字段 | 含义 |
  |---|---|
  | `choice` | 概率最高的选项 |
  | `probabilities` | 每个选项 → 概率，"floats that sum to 1" |
  | `confidence` | 0–1，由概率分布的集中程度算出；概率全在一项上为 1，越平越低 |

- 官方建议列表可能覆盖不全时加一个 `other` / `none of the above` 选项。
- 另外两种题型：**Noul**（是/否，只返回 `noul`，即 yes 的概率，**没有** `confidence`）和 **Score**（有序等级，最多 10 级，返回 `score`（可以落在两级之间）、`legend`、`probabilities`、`confidence`）。来源：https://docs.typesafe.ai/api 、https://docs.typesafe.ai/primitives
- **没有「多选多」题型**。想让一段台词同时带好几种情绪，官方做法是每种情绪各问一道 Noul（各自独立，可以都低）。官方也提醒：Choice 是相对的（哪一项最像），Noul 是绝对的（这一项成不成立），**给 Noul 调好的阈值不能直接搬到 Choice 上**。来源：https://docs.typesafe.ai/model-jaggedness/jev-1.13

**实测返回样例**（`typesafe/jev-1.13`，经 `https://openrouter.ai/api/v1/systemone`；state 是 `{角色, 制作人刚才说的话, 角色的这一段台词, 这段台词的中文意思}`）：

```json
{"model": "typesafe/jev-1.13-20260917",
 "answers": {"emotion": {"type": "choice", "choice": "害羞",
   "probabilities": {"生气": 0, "难过": 0, "平静": 0, "开心": 0.45, "害羞": 0.54, "惊讶": 0.01, "思考": 0},
   "confidence": 0.47}},
 "usage": {"input_tokens": 625, "output_tokens": 74, "cost": 2.625e-05},
 "id": "gen-dec-...", "provider": "TypeSafe"}
```

OpenRouter 在 TypeSafe 原来的格式上多加了 `id`、`provider`、`usage.cost`（美元）。来源：https://openrouter.ai/docs/guides/community/typesafe-sdk 。选项名用中文没有问题，原样返回。注意 `probabilities` 里的 key **顺序不固定**，代码要按 key 取值，不能按位置。

## 2. 一次请求能带多道题吗？

能。

- "Send every question that uses the same state in one request. You can mix question types freely. System One models evaluate every question in a request in parallel. Adding questions barely changes the response time and costs only the tokens for the extra questions." 来源：https://docs.typesafe.ai/primitives
- 各题之间**互相独立**，一道题的答案不会成为另一道题的上下文；真要依赖前一题的答案，只能发第二次请求。来源同上。
- 上下文上限：OpenRouter 上写的是 32,000 token（state 加上题目）。来源：https://openrouter.ai/docs/guides/community/jev 。TypeSafe 直连写的是每次请求 64k，其中 state 加上最长的一道题不能超过 32k。来源：https://docs.typesafe.ai/models
- 官方 cookbook：13 道题合成一次请求，比分成 13 次请求便宜 12.2 倍、快 10 倍（0.27 s 对 2.71 s，13 次是串行相加的时间），答案没有变化。来源：https://docs.typesafe.ai/cookbooks/parallel_questions
- state 里可以用反引号加路径指向具体的某一部分，比如 `` `角色这次回话的各段台词[2]` ``。来源：https://docs.typesafe.ai/primitives

**实测**（同一批 20 句台词）：

| 请求形状 | 次数 | p50 | p95 | 平均输入 token | 单次费用 |
|---|---|---|---|---|---|
| 1 道情绪 Choice，一段台词 | 20 | 0.38 s | 1.52 s | 628 | ≈ $0.000026 |
| 4 道题（情绪 Choice + 强度 Score + 是否同意 Noul + 动作 Choice），一段台词 | 20 | 0.36 s | 0.83 s | 834 | ≈ $0.000035 |
| 一次请求放 4 段台词，每段一道情绪 Choice | 10 | 0.44 s | 0.94 s | ≈ 1,550 | ≈ $0.000065 |
| 4 段台词各发一次单题请求，4 个并发（墙钟时间） | 10 组 | 0.64 s | 1.78 s | 4 × 628 | ≈ $0.000105 |

所以「一次回话一次请求，每段一道题」比「每段一个请求」更快、更便宜。代价是要等整段回话的文字都生成出来才能发；而 pipecat 是一段一段交给 TTS 的，**逐段发**可以更早拿到第一段的情绪。这是实现时要做的取舍，这份调研不替你定。

## 3. 判断得准不准（只是小样本的参考）

这不是 eval，只是 20 句我自己写的真乃风格台词，由我一个人标注，用来确认情绪题能不能用：

- 单段、单题：**18/20 和我的标注一致**。不一致的两句：
  - 「ほわっ……ありがとうございます、プロデューサーさん！みんなのおかげです」（我标开心）→ 害羞 0.54 / 开心 0.45，confidence 0.47。
  - 「はい、ありがとうございます。マフラー、ちゃんと巻いてきました」（我标平静）→ 开心，confidence 0.5。
  - 两句都是 **confidence 只有 0.5 左右的近似平局**，其他 18 句的 confidence 在 0.82–1。
- 4 段放进同一个 state（带上前后文）：**40/40 一致**（20 句各测 2 次），上面两句这次也判对了。样本太小，只能说明前后文**可能**有帮助，不能下结论。
- **重复问同一句**（第一句，5 次）：概率稳定在「开心 0.44–0.51 / 害羞 0.48–0.55」，但 `choice` 在两者之间来回跳。说明结果不是完全确定的；**confidence 低时需要一条兜底规则**（比如退回「平静」，或者沿用上一段的情绪）。官方也建议按 confidence 分三档处理：高就直接用，中低另行处理。来源：https://docs.typesafe.ai/confidence

官方已知的相关弱点（来源：https://docs.typesafe.ai/models 、https://docs.typesafe.ai/model-jaggedness/jev-1.13 ）：

- "English is the primary training language... Other languages, including CJK scripts, are handled but not equally well; test on your own content." 我们的 state 是日语加中文，正好落在这一条里。
- 按字面理解题目（literal reading）：边界情况要写进每个选项的描述里。
- 有 context rot：state 里和题目无关的内容越多，准确率越低。所以不要把整段通话历史都塞进去。
- 一道题里不要藏好几个判断。

## 4. 延迟：和 Fish Audio 合成一段比

**测量条件**：2026-09-30，在开发机（Windows，本地网络）上串行发送，httpx 复用连接，发之前先预热一次。Jev 走 `.env` 里配置的 OpenRouter `systemone` 端点；Fish Audio 走 REST `POST https://api.fish.audio/v1/tts`，用 streaming 读取，参数和 pipecat 一致（`s2.1-pro-free`、`pcm` 24 kHz、`latency: balanced`），音色是真乃的。服务器部署后的网络路径不同，数字会变，上线后应该重新测一次。

| | p50 | p95 | 最小–最大 |
|---|---|---|---|
| Jev 单题 | 0.38 s | 1.52 s | 0.32–1.66 s |
| Jev 四题 | 0.36 s | 0.83 s | 0.32–0.83 s |
| Jev 4 段合一 | 0.44 s | 0.94 s | 0.35–0.95 s |
| Fish 首字节（TTFB） | 0.59 s | 1.30 s | 0.43–2.57 s |
| Fish 一段合成完 | 3.46 s | 4.53 s | 2.09–5.65 s |
| 一段音频本身的时长 | 5.69 s | 6.87 s | 3.99–7.80 s |

- Jev 的 p50 比 Fish 的首字节快约 0.2 s；p95 两者差不多（1 s 左右）。所以**如果和 TTS 同时发起，多数段落的情绪能在开口前到位**，少数会晚几百毫秒。晚到的话可以先按上一段的情绪开口，再切换过去。
- 和一段音频 5–7 s 的播放时长相比，Jev 的延迟都很小。
- Fish 的首字节偏慢，和 `s2.1-pro-free` 的定位一致：官方说它和 `s2.1-pro` 是同一个模型，但 "No TTFA or DPA guarantees"；上一代 `s2-pro` 标称 "100ms time-to-first-audio"。来源：https://docs.fish.audio/developer-guide/models-pricing/models-overview
- 仓库里的日志 `logs/dev-backend.log` 没有记录 Fish 的 TTFB，所以只有这次实测的数字。
- OpenRouter endpoints API 上 Jev 的 `latency_last_30m` 和 `throughput_last_30m` 都是 `null`，官方没有公布延迟数字（`GET https://openrouter.ai/api/v1/models/typesafe/jev-1.13/endpoints`，2026-09-30）。

## 5. 费用

- $0.042 / 百万输入 token，输出 token 免费。来源：https://openrouter.ai/typesafe/jev-1.13 、https://docs.typesafe.ai/models ；endpoints API 返回的 `pricing.prompt` 是 `"0.000000042"`，`completion` 是 `"0"`。
- 实测 `usage.cost` 正好等于输入 token × $0.042/M（例如 625 → $0.00002625），`output_tokens` 不计费。
- 按一次回话 1–4 段估算：每段一个单题请求约 $0.000026 / 段；整段回话一次请求约 $0.00004–0.000065。和现有的检索判断（每轮一次 Jev 请求）同一个量级，1 美元大约够 1.5 万次回话。
- OpenRouter 充值另收 5.5% 手续费（最低 $0.80），见 `.scratch/jev-provider/research.md`。

## 6. 失败和超时的表现

**文档上的**：

- OpenRouter Decisions API 列出的错误码：400（参数错）、401、402（额度不足）、403、404、413（请求太大）、429（限流）、500、502（上游 provider 出错）、503、524（"Provider request timed out at edge network"）、529（provider 过载）。来源：https://openrouter.ai/docs/api/api-reference/alphadecisions/submit-a-decisions-request.md 。`/api/v1/systemone` 没有单独的错误表，**未确认**两者的错误码是否完全一致；实测 systemone 返回的错误格式和 OpenRouter 通用格式一样。
- TypeSafe 直连：401、422、429、529；遇到 429 和 529 建议指数退避后重试。来源：https://docs.typesafe.ai/api
- 官方 Python SDK 默认会重试 408、429、5xx，以及连接错误和超时，`max_retries=2`、退避从 0.5 s 开始、最长 5 s，整个调用的总预算 30 s。来源：https://docs.typesafe.ai/sdk/python/api/retries 。这个预算对通话来说太长；项目没用 SDK，直接用 httpx。
- 限流（TypeSafe 直连）：100K tokens/s、40 requests/s，而且 "can change without notice"。来源：https://docs.typesafe.ai/models 。（`.scratch/jev-provider/research.md` 记的是 250K tokens/s、1,200 req/min，说明这个数字确实在变。）OpenRouter 这一层的限流**未确认**。
- 只有一个 provider：endpoints API 只列出 TypeSafe 一个，没有备用。今天 `uptime_last_1d` 是 100；上线初期模型页曾显示 3 天可用率约 33%（见 `.scratch/jev-provider/research.md`）。

**实测**（2026-09-30）：

| 情形 | 结果 |
|---|---|
| 正常请求 | 85 次全部 200，没有遇到 429、5xx 或超时 |
| key 无效 | 401 `{"error":{"message":"User not found.","code":401}}`，0.32 s |
| 模型 id 不存在 | 400 `Model typesafe/jev-9.99 does not exist`，0.16 s |
| Choice 没写 criteria | 400，zod 校验信息，指出 `questions.e.criteria` 缺失 |
| `type` 写错 | 400，提示只能是 `noul` / `choice` / `score` |
| Choice 只有 1 个选项 | **200**，`probabilities: {"开心": 1}`，confidence 1（不会报错，但也没有意义） |
| 客户端超时设成 0.2 s | httpx 抛出 `ReadTimeout`，0.20 s |

- 错误都是整次请求失败，**不会**出现有的题有答案、有的题没有的情况（文档里没有提到部分答案；实测也没遇到）。
- 项目现有的 `JevJudge` 超时是 5 s（连接 3 s），出错时抛 `JudgeError`，检索照常进行（`backend/src/eidolon/retrieval.py`）。情绪判断如果照搬这个超时，失败时最坏要等 5 s，而一段音频的首字节约 0.6 s 就到了。所以情绪这边更适合**短超时、不重试**（比如 1–1.5 s），失败就退回默认情绪或沿用上一段的情绪。具体数值要到实现时再定。

## 7. 给后续拍板的要点（只列事实，不做决定）

1. 题型用 Choice 就够了；返回里有每个选项的概率和 confidence，可以在代码里做「confidence 低就用默认情绪」这样的兜底。
2. 一次请求可以同时问情绪、强度、动作等好几件事，延迟基本不变，每多一道题只多几百 token。
3. 「每段一个请求」和「整段回话一个请求」都可行。前者能更早拿到第一段的结果，后者更便宜、判断时有上下文，这次小样本里也更准。
4. 延迟和 Fish 的首字节是同一个量级（Jev 略快），可以并行，不应该串行地挡在 TTS 前面。
5. 准确率只做了 20 句的小样本测试。要正式用的话，应该像检索判断那样做一套带标注的 eval（最好用真实通话里的台词），并参考官方关于 CJK 和 literal reading 的提醒来写选项描述。

## 附：实测用的题目

```json
{"type": "choice",
 "instructions": "`角色的这一段台词` 是角色此刻说出口的话。说这一段时，角色脸上最主要的情绪是哪一种？",
 "criteria": {
   "开心": "高兴、兴奋、感激、期待",
   "害羞": "难为情、脸红、被夸或被说到心事时的不好意思",
   "惊讶": "吃惊、意外、慌张",
   "难过": "伤心、失落、寂寞、担心、不甘心",
   "生气": "不满、责怪、赌气、不能原谅",
   "思考": "在想、犹豫、斟酌措辞",
   "平静": "普通地回应、打招呼、确认事务，没有明显情绪"}}
```

state：`{"角色": "櫻木真乃", "制作人刚才说的话": ..., "角色的这一段台词": <日语>, "这段台词的中文意思": <中文字幕>}`。测量脚本是一次性的，没有提交进仓库。
