# 02: 判断阈值按模型给定，情绪变量改名

**What to build:** 检索判断的阈值（现在是 `retrieval.py` 的 `JUDGE_THRESHOLD = 0.5`）和情绪判断的最低概率（现在是 `EmotionSettings.min_probability` 的默认值 0.5）改成按模型在代码里给定。情绪的两个环境变量改用不带厂商名的名字。这一张不改任何数值：所有模型先都用现在的 0.5，真正的数值在 05 里按 eval 结果填。

**Blocked by:** 01

**Status:** resolved

- [x] 一张按模型分组的阈值表：
  - 每组包括检索的三个阈值（`needs_retrieval`、`recall`、`about_producer`，可以各不相同）和情绪的最低概率；
  - 先建 Jev、Clef、Clef-flash 三组，数值都是 0.5；
  - 模型名归一化后查表：`typesafe/jev-1.13`、`jev-latest` 之类归到 Jev 组，`clef-flash`、`cloudflare/clef-flash` 归到 Clef-flash 组，`clef`、`cloudflare/clef` 归到 Clef 组；
  - 查不到的模型用 Jev 组，启动时打一次警告。
- [x] 判断的顺序不变：recall → references → memories → nothing。
- [x] 改名：
  - `JEV_EMOTION_MIN_PROBABILITY` → `JUDGE_EMOTION_MIN_PROBABILITY`
  - `JEV_EMOTION_TIMEOUT` → `JUDGE_EMOTION_TIMEOUT`
  
  填了新名字就覆盖所有模型的默认值。配了旧名字时启动报错，说明已改名，做法和 `AI_GATEWAY_API_KEY` 改名的报错一样。
- [x] `.env.example` 里情绪变量的名字和说明同步修改。README 留到 05 统一改。
- [x] 测试：
  - 模型名归一化和查表；
  - 未知模型回退到 Jev 组并打警告；
  - 阈值表里的数值确实被检索判断和情绪判断用上（拿一组故意不是 0.5 的表测试）；
  - 新变量覆盖默认值；
  - 配了旧变量名就报错。
- [x] 全部测试通过，pyright 和 ruff 无错误。

## Comments

实现说明：
- 阈值表在 `judge.py`：`JudgeThresholds`（`needs_retrieval`、`recall`、`about_producer`、`emotion`）、`JUDGE_THRESHOLDS`（`jev` / `clef` / `clef-flash` 三组，都是 0.5）、`judge_family` 做模型名归一化（取最后一段 `/` 之后、小写；Clef 只认 `clef`、`clef-flash` 两个名字，`clef-2` 之类算未知模型，Jev 认 `jev` 和 `jev-*`），`judge_thresholds_for` 查表，查不到用 Jev 组并打警告。`build()` 只调一次，所以启动时只警告一次。
- `ModelRetrievalJudge(judge_model, thresholds)`，不传时用 Jev 组。
- `EmotionSettings.min_probability` 改为 `float | None`，不填为 None。`judge.judge_thresholds(judge, emotion)` 给出所选模型的阈值，填了 `JUDGE_EMOTION_MIN_PROBABILITY` 就覆盖其中的情绪阈值；`build()` 和 `eidolon eval judge` 都用它。
- 旧变量名只在有值时报错：照 `.env.example` 抄过来的空行 `JEV_EMOTION_MIN_PROBABILITY=` 不会挡住启动。
