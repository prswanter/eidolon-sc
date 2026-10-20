# 01: Jev 改用 System One 格式，默认走 OpenRouter

**What to build:** Vercel AI Gateway 的免费额度已经不能调用 Jev（返回 403 RestrictedModelsError）。判断器改说 TypeSafe 的 System One 格式，默认经由 OpenRouter 调用。OpenRouter、Vercel（`/typesafe/v1/systemone`）和 TypeSafe 直连都支持这个格式，所以换渠道只改环境变量。调研见 `../research.md`。

**Blocked by:** None (can start immediately)

**Status:** resolved

- [x] `JevJudge` 发 `POST {JEV_BASE_URL}/systemone`：问题类型是 `noul`，从 `answers[name].noul` 读概率。三个问题、0.5 阈值和「recall → references → memories → nothing」的顺序都不变。
- [x] 环境变量：
  - `JEV_API_KEY`：填了才开启检索（和现在的规则一样）；
  - `JEV_MODEL`：可选，默认 `typesafe/jev-1.13`，锁定版本；
  - `JEV_BASE_URL`：可选，默认 `https://openrouter.ai/api/v1`。
- [x] 配着旧的 `AI_GATEWAY_API_KEY`、却没有 `JEV_API_KEY` 时，启动报错，说明变量已改名。
- [x] 失败处理不变：判断失败就照常检索参考资料，不重试。
- [x] `.env.example` 和三份 README 写明：
  - 默认走 OpenRouter；
  - 换 Vercel（`https://ai-gateway.vercel.sh/typesafe/v1`）或 TypeSafe 直连（`https://api.typesafe.ai/v1`）时怎么填。
- [x] 更新 `JevJudge` 请求和响应的测试、环境变量配置的测试，补一条「只配了旧变量就报错」的测试。全部测试通过，pyright 无错误。
- [x] 真实验收：用 OpenRouter 的 key 实际调用一次，核对返回格式，记下 `usage` 里的 token 数和费用；做一次真实对话，确认闲聊不检索、问起经过会触发回顾经过。结果记到本 ticket 的 Comments。

不写 ADR：换渠道只是改配置，随时能改回来。

## Comments

### 实现记录（2026-09-28）

- `JevJudge` 改发 `POST {base_url}/systemone`：三个问题的 `type` 是 `noul`，从 `answers[name].noul` 读概率。判断顺序和 0.5 阈值不变。
- `config.py` 的 `JevSettings`：
  - `JEV_API_KEY` 必填；
  - `JEV_MODEL` 默认 `typesafe/jev-1.13`；
  - `JEV_BASE_URL` 默认 `https://openrouter.ai/api/v1`。
- `_jev_from_env()`：有 `JEV_API_KEY` 就开启 Jev；只有旧的 `AI_GATEWAY_API_KEY` 时报错，说明改名和改用 Vercel 的写法。
- `.env.example`、三份 README 的变量说明、换渠道说明和致谢，都改成了 OpenRouter 和 TypeSafe。
- 测试：
  - `test_retrieval_services` 的请求和响应改成 System One 格式，并断言每个问题都带齐 `true` 和 `false` 两条判断标准；
  - 新增 3 条配置测试：默认值、改走其他渠道、只配了旧变量就报错。
  - 全部 765 个测试通过，pyright 无错误。

### 真实验收（2026-09-28，OpenRouter）

**直接调用 `JevJudge`**：四句话四种结果都对。返回的 `model` 是 `typesafe/jev-1.13-20260917`，`provider` 是 `TypeSafe`。

| 话 | 判断 | needs_retrieval / recall / about_producer |
|---|---|---|
| おはよう、真乃 | nothing | 0.08 / 0.01 / 0.03 |
| 「ヒカリのdestination」って誰が歌ってる？ | references | 0.93 / 0.05 / 0.03 |
| W.I.N.G.の決勝、あのときどうだった？ | recall | 0.89 / 0.91 / 0.08 |
| 昨日うちの猫が病院に行ったんだ | memories | 0.11 / 0.03 / 0.96 |

- 用量：每次约 940 个输入 token，`output_tokens` 为 59，`cost` 约 $0.0000394，等于 938 × $0.042/M，输出不收费。
- 耗时：0.34–1.02 秒，第一次最慢，在 5 秒的超时之内。

**真实对话**：在数据库副本上用 `build(Settings.from_env())` 跑文字回合，4 个回合里 Jev 没有一次失败。
- 真乃「おはよう…いい天気だね」：不检索，照常闲聊。
- 真乃「W.I.N.G.の決勝のとき、どんな気持ちだった？」：走回顾经过，带上「準決勝後コミュ」「決勝前コミュ」，不再提供 `recall_story` 工具。回答照着剧情回忆。
- 恋鐘「幻惑SILHOUETTE はどの CD」：检索参考资料，带上 5 条作品资料。回答 WING 03（2018年8月1日）、SOLO COLLECTION 里的恋鐘 Ver.、WING COLLECTION -B side- 里的 2023 Ver.。
- 恋鐘「初めて長崎から東京に出てきたとき」：走回顾经过。
- 顺带发现：有一段剧情的标题显示成 `produce_events_100400002`，是剧情数据里缺标题，和这次改动无关。

