# Jev 能否改走 OpenRouter？与继续用 Vercel AI Gateway（付费额度）的对比

访问日期：2026-09-28。所有结论都附了一手来源（官方文档、官方模型页、官方 API）。标 **未确认** 的是没能在一手来源里查到的。

## 结论先行

- **能。Jev 已经上了 OpenRouter**，由 TypeSafe 自己作为唯一 provider 提供服务。模型 id 是 `typesafe/jev-1.13`（canonical slug `typesafe/jev-1.13-20260917`），另有别名 `~typesafe/jev-latest`。它**不走** `/chat/completions`，而是走 OpenRouter 专门的 System One / Decisions 接口：`POST https://openrouter.ai/api/v1/systemone`（兼容 TypeSafe 格式），或 `POST https://openrouter.ai/api/alpha/decisions`（alpha）。
- 价格三家一样：输入 $0.042 / 百万 token，输出免费。按每轮约 1,000–1,500 输入 token 估算，**每轮约 $0.00004–0.00006**。差别在于怎么充值：OpenRouter 买额度收 5.5% 手续费（最低 $0.80）；Vercel 只要买过一次额度，就会永久转到付费档，每月的免费额度也就没了。
- 要改的代码不多：URL、鉴权 key、模型 id；问题类型 `"boolean"` 改成 `"noul"`；回答字段从 `probability` 改成 `noul`。
- 注意：OpenRouter 上还有一个 `typesafe/jev-router`，它是一个**聊天路由器**（走 chat/completions，替你挑选其他 LLM），**不是** Jev 这个判断模型本身，不要搞混。

---

## 0. 项目目前依赖的具体行为

`backend/src/eidolon/retrieval.py` 里的 `JevJudge`（配置在 `config.py` 的 `JevSettings`：`AI_GATEWAY_API_KEY`、`JEV_MODEL`、`AI_GATEWAY_BASE_URL`，默认值 `https://ai-gateway.vercel.sh/v1`）：

- `POST {base_url}/evaluate`，header `Authorization: Bearer <key>`，超时 5s（连接超时 3s）。
- 请求 body：`{model, state: {"角色", "上文", "制作人最新的一句话"}, questions: {needs_retrieval, recall, about_producer}}`。每个问题的形状都是 `{type: "boolean", instructions, criteria: {true, false}}`，而且三个问题都写了 `true` 和 `false` 两个 criteria。
- 读取 `res.json()["answers"][name]["probability"]`，拿 `JUDGE_THRESHOLD = 0.5` 做阈值：recall 优先，其次 references，再其次 memories，否则 nothing。
- 用不到 confidence、choice、score，也用不到 fallback 和 providerMetadata。

所以对任何替代方案来说，要求只有一条：**一次请求能对同一个 state 答三个是/否问题，每个问题各给一个 0–1 的概率。**

---

## 1. OpenRouter 上有没有 Jev？

有。

- OpenRouter 的 Typesafe 作者页列出 2 个模型：Jev Latest 和 Jev 1.13。价格 $0.042/M 输入、$0/M 输出，上下文 32K，发布日期 2026-09-18。来源：https://openrouter.ai/typesafe
- 模型页 `typesafe/jev-1.13` 写着 "This model is hosted by one provider"，provider 是 TypeSafe。来源：https://openrouter.ai/typesafe/jev-1.13
- 别名 `~typesafe/jev-latest` 始终指向 Jev 家族的最新版本。来源：https://openrouter.ai/~typesafe/jev-latest
- OpenRouter 官方的 Jev 文档中心写明："`typesafe/jev-1.13` (or the `~typesafe/jev-latest` alias) is available to anyone with an OpenRouter API key, and billed to your OpenRouter account"，并且 "There's no waitlist or separate TypeSafe account"。来源：https://openrouter.ai/docs/guides/community/jev
- **Models API 实测（2026-09-28）**：
  - 默认的 `GET https://openrouter.ai/api/v1/models` 里**查不到** Jev 1.13，只能看到 `typesafe/jev-router`。要加 `?output_modalities=all` 才会出现 `typesafe/jev-1.13` 和 `~typesafe/jev-latest`，它们的 `architecture.modality` 是 `"text->decisions"`，`output_modalities` 是 `["decisions"]`，`pricing.prompt` 是 `"0.000000042"`，`pricing.completion` 是 `"0"`。（原因推测是默认列表只列文本输出的模型；这一点属于实测观察，文档里没找到明确说明。）
  - `GET https://openrouter.ai/api/v1/models/typesafe/jev-1.13/endpoints` 返回唯一一个 endpoint，`provider_name: "TypeSafe"`，`supported_parameters: []`，当时 `uptime_last_1d: 100`。
- `typesafe/jev-router`（2026-09-25 发布）："Jev Router picks the best model and reasoning effort for each request... It runs on Jev"。它走 `/chat/completions`、`/responses`、`/messages`，上下文 1M，Models API 里的 `pricing` 是 `-1`（按实际路由到的模型计价）。这是一个 LLM 路由器，**没法用来当我们的判断器**。来源：https://openrouter.ai/typesafe/jev-router

## 2. OpenRouter 上调用 Jev 走哪个接口？三个是/否问题怎么对应？

**不是** `/chat/completions`。Jev 在 OpenRouter 上的 `supported_parameters` 是空的，也不支持 logprobs（它本来就不生成 token）。它有两个专用接口：

| 接口 | 端点 | 说明 |
|---|---|---|
| System One API | `POST https://openrouter.ai/api/v1/systemone` | 实现了 TypeSafe 的请求和响应格式，TypeSafe 官方 SDK 把 base URL 换成 `https://openrouter.ai/api` 就能用 |
| Decisions API（alpha） | `POST https://openrouter.ai/api/alpha/decisions` | OpenRouter 自己的接口，schema 同样使用 `noul`、`choice`、`score` |

来源：https://openrouter.ai/docs/guides/community/jev 、https://openrouter.ai/docs/guides/community/typesafe-sdk 、https://openrouter.ai/docs/api/api-reference/systemone/submit-a-system-one-request.md 、https://openrouter.ai/docs/api/api-reference/alphadecisions/submit-a-decisions-request.md

- 模型 id：System One API 接受不带前缀的 `jev-1.13`（会映射成 `typesafe/jev-1.13`）和 `jev-latest`（映射成 `~typesafe/jev-latest`）；已经带前缀的 id 原样使用。来源：https://openrouter.ai/docs/guides/community/typesafe-sdk
- 鉴权：`Authorization: Bearer $OPENROUTER_API_KEY`，不需要 TypeSafe 账号。来源同上。
- 响应多出 `id`、`provider`、`usage.cost`（单位美元）。例如：`{"id":"gen-dec-...","model":"typesafe/jev-1.13-20260917","provider":"TypeSafe","answers":{"refund":{"type":"noul","noul":0.98}},"usage":{"input_tokens":275,"output_tokens":20,"cost":0.00003}}`。来源同上。
- OpenAPI schema 里的 `DecisionsNoulQuestion`：`type` 取值为 `noul`，`instructions` 可以是 string、object 或 array；`criteria` 是可选的，但**只要写了 criteria，`true` 和 `false` 就都必须写**（schema 里 `required: ['true','false']`）。`DecisionsNoulAnswer` 是 `{type: "noul", noul: number}`。来源：https://openrouter.ai/docs/api/api-reference/alphadecisions/submit-a-decisions-request.md
- 实测：不带 key POST 这两个端点，都返回 401，说明端点确实存在（2026-09-28）。

**对应到本项目**（只列要改的地方，这份调研不改代码）：

| 现在（Vercel `/v1/evaluate`） | OpenRouter `/api/v1/systemone` |
|---|---|
| `https://ai-gateway.vercel.sh/v1` + `/evaluate` | `https://openrouter.ai/api/v1` + `/systemone` |
| `AI_GATEWAY_API_KEY` | OpenRouter key |
| `model: "typesafe-ai/jev"` | `model: "typesafe/jev-1.13"`（锁定版本）或 `"~typesafe/jev-latest"` |
| 问题 `type: "boolean"` | `type: "noul"` |
| `criteria: {true, false}` | 不变（我们三个问题都写了 true 和 false，符合 schema） |
| `state` 是一个 object | 不变（string、object、array 都可以） |
| 读 `answers[name]["probability"]` | 读 `answers[name]["noul"]` |
| 阈值 0.5 | 不变（语义同样是 yes 的概率，0 到 1） |

补充：在其他 LLM 上用 logprobs 或 JSON 输出来模拟概率，见第 5 节。Jev 本身在 OpenRouter 上不需要这么做。

## 3. Jev 是什么？谁做的？有没有 TypeSafe 自己的 API？`/v1/evaluate` 是谁的接口？

- **厂商**：TypeSafe（TypeSafe AI）。官网自称 "a new AI lab operating in stealth"；CEO Diogo Almeida 被介绍为 RLHF 和 InstructGPT 的共同发明人。来源：https://typesafe.ai
- **Jev 是什么**："Jev is TypeSafe's flagship model and the first System One model... returns typed decisions and probabilities rather than generated text"。三种问题类型（官方叫 primitives）：Choice、Score、Noul（Noul 就是是/否题）。来源：https://docs.typesafe.ai/concepts/system-one
- **TypeSafe 直连 API**：
  - 端点 `POST https://api.typesafe.ai/v1/systemone`，header `Authorization: Bearer <API_KEY>`；key 在 https://console.typesafe.ai/keys 获取。来源：https://docs.typesafe.ai/api 、https://docs.typesafe.ai/introduction/quickstart
  - 请求：`state`（string、object 或 array，必填）、`model`（必填，比如 `"jev-latest"`）、`questions`（`map<string, Question>`，必填）。Noul 问题是 `{type:"noul", instructions, criteria?:{true,false}}`；问题的 key 不会送进模型。来源：https://docs.typesafe.ai/api
  - 响应：`{model, answers: {id: {type:"noul", noul: 0.95}}, usage: {input_tokens, output_tokens}}`。Choice 和 Score 的回答还带 `probabilities` 和 `confidence`，Noul 不带 confidence。来源同上。
  - 错误码：401、422、429、529（过载），文档建议用指数退避重试。来源同上。
  - 模型与价格：`jev-1.13.0`，每 Mtok $0.042（每 Btok $42），**只对输入 token 计费，输出免费**；速率限制 250,000 tokens/s、1,200 requests/min（文档注明会随需求动态调整）；上下文 "64k tokens per request; 32k tokens for `state` plus the longest question"；别名 `jev-latest` 和 `jev-preview` 目前都指向 `jev-1.13.0`。来源：https://docs.typesafe.ai/models
  - **语言**："English is the primary training language... Other languages, including CJK scripts, are handled but not equally well; test on your own content"。我们的问题和 state 是中文加日文，所以不管走哪家都受这条影响。来源：https://docs.typesafe.ai/models
  - 直连的注册方式、有没有免费额度、最低充值多少：**未确认**。docs.typesafe.ai 没写，账单信息只在 console 里，需要登录。
- **`/v1/evaluate` 是 Vercel 的接口，不是 TypeSafe 的。** 从命名就能区分：
  - Vercel `POST https://ai-gateway.vercel.sh/v1/evaluate` 用的是 AI SDK 的规范化格式：问题类型写 `boolean`，回答字段是 `probability`，usage 是驼峰写法（`inputTokens`），另外带 `providerMetadata.gateway`（含 routing 和 cost）。来源：https://vercel.com/docs/ai-gateway/modalities/evaluation
  - Vercel 另外提供一个兼容 TypeSafe 的接口 `POST https://ai-gateway.vercel.sh/typesafe/v1/systemone`，字段用 `noul`。来源：https://vercel.com/docs/ai-gateway/sdks-and-apis/typesafe
  - TypeSafe 原生接口是 `/v1/systemone`，字段用 `noul`。来源：https://docs.typesafe.ai/api
  - Vercel 文档还写明，evaluation "is not supported through the OpenAI-compatible, Anthropic-compatible, or Cohere-compatible endpoints"。来源：https://vercel.com/docs/ai-gateway/modalities/evaluation
- **Vercel `/v1/evaluate` 的 schema**（来源：https://vercel.com/docs/ai-gateway/modalities/evaluation ）：
  - 请求：`{model: "typesafe-ai/jev", state, questions: {id: {type: "boolean"|"choice"|"score", instructions, criteria?}}, providerOptions?: {gateway: {zeroDataRetention, only, models}}}`
  - 响应：`{model, answers: {id: {type: "boolean", probability: 0.98}}, usage: {inputTokens, outputTokens}, providerMetadata: {gateway: {routing, cost, marketCost, surchargeCost, gatewayCost, generationId}}}`
  - 文档示例：275 个输入 token，`cost` 为 `"0.00001155"`，正好等于 275 × $0.042/M。
  - Vercel 还支持 "evaluation fallbacks"：当某个 Boolean 的概率落在不确定区间时，可以换另一个模型重跑。项目目前没用这个功能。来源：https://vercel.com/docs/ai-gateway/models-and-providers/evaluation-fallbacks
- Vercel 模型列表实测（`GET https://ai-gateway.vercel.sh/v1/models`，2026-09-28）：`typesafe-ai/jev` 的 `type` 是 `"evaluation"`，`pricing.input` 是 `"0.000000042"`，`pricing.output` 是 `"0"`，`context_window` 是 32000，描述里写着 "64,000 tokens total per request; 32,000 tokens for the state plus the longest question"。

## 4. 价格

| 渠道 | Jev 单价 | 充值和门槛 |
|---|---|---|
| Vercel AI Gateway | $0.042/M 输入，$0 输出（按 token 计费，不按请求计费）。来源：https://vercel.com/kb/guide/typesafe-jev-and-ai-sdk ，以及 `/v1/models` 实测 | 免费档只能用部分模型，Jev 不在其中（我们实际拿到了 403）；需要购买 AI Gateway Credits。token 不加价 |
| OpenRouter | $0.042/M 输入，$0 输出。来源：https://openrouter.ai/typesafe/jev-1.13 ，以及 Models API 实测 | 买额度收 5.5% 手续费（最低 $0.80）。来源：https://openrouter.ai/docs/faq （`getTotalFeeString('stripe') = '5.5% ($0.80 minimum)'`）。推理本身不加价 |
| TypeSafe 直连 | $0.042/M 输入，输出免费。来源：https://docs.typesafe.ai/models | 充值方式**未确认** |

**Vercel 免费档和付费档的规则**：

- "The free tier includes a subset of models, not the full catalog... To use any other model, purchase AI Gateway Credits." 来源：https://vercel.com/docs/ai-gateway/pricing
- "Once you purchase credits, your account transitions to the paid tier and the monthly free credit no longer applies." 来源同上。也就是说，**只要买过一次，每月的免费额度就永久没了**。
- FAQ 的错误表：`403` whose message names the free tier 的含义是 "The model is not in the free-tier subset and requires purchased credits"。这就是我们遇到的 `RestrictedModelsError`。来源：https://vercel.com/docs/ai-gateway/faq
- 免费档每个模型都有较低的速率限制；付费档 "does not rate limit paid-tier requests"，只受上游 provider 自己的限制。来源：https://vercel.com/docs/ai-gateway/rate-limits
- 购买的 credits 一年后过期。来源：https://vercel.com/docs/ai-gateway/faq
- 用自己的 provider key（BYOK）也需要先买过 credits。来源：https://vercel.com/docs/ai-gateway/pricing
- 每月免费额度的具体金额（第三方资料说是 $5）和最低充值金额：**未确认**。Vercel pricing 文档没写，充值金额在控制台弹窗里选。

**每轮成本粗算**：

- 一次请求包含 state（角色名、最近几条上文、最新一句话，几百 token）加上三个问题的 instructions 和 criteria（中文，每个大约一两百 token）。估计总输入 **约 800–1,500 token**。中日文的实际 token 数取决于 Jev 的 tokenizer，**未确认**；上线后看响应里的 `usage` 就知道准确值。
- 估算：1,500 × $0.042 / 1,000,000 ≈ **$0.000063 每轮**，也就是 $1 大约能跑 1.6 万轮。三家单价相同。
- 按这个用量，任何一家充一次最低额度都能用很久，**手续费和充值门槛才是真正的成本**。例如在 OpenRouter 充 $5，要多付 $0.80（最低手续费，高于 5.5%）。

## 5. 可选方案和取舍（不替你做决定）

**A. 继续用 Vercel，购买 AI Gateway Credits**
- 优点：代码不用改；可以用 evaluation fallbacks；调用出现在 Vercel 的日志和预算里。
- 缺点：团队永久失去每月的免费额度；如果项目里还有别的调用依赖 Vercel 免费额度，需要一起算进去。最低充值金额未确认。

**B. 改走 OpenRouter 的 Jev（`typesafe/jev-1.13`，走 `/api/v1/systemone`）**
- 优点：同一个模型、同样的单价；不需要 TypeSafe 账号；如果项目别处已经在用 OpenRouter，可以共用一个 key 和一份余额。
- 缺点：
  - 要改 URL、key、模型 id，以及 `boolean`/`probability` 到 `noul`/`noul` 的字段名，外加对应的测试。
  - 充值有 5.5% 手续费，最低 $0.80。
  - Decisions API 标着 alpha。
  - 当前只有 TypeSafe 一个 provider，没有备用。
  - 模型页在上线初期显示过 3 天可用率约 33%（页面上的 "Uptime (3d) 33.31%"，是 exa 抓取时的数据）；2026-09-28 实测 endpoints API 的 `uptime_last_1d` 是 100。建议上线前自己多测几次。来源：https://openrouter.ai/typesafe/jev-1.13 和 endpoints API

**C. 直连 TypeSafe（`https://api.typesafe.ai/v1/systemone`）**
- 优点：少一层中转；有官方 Python SDK `typesafe-sdk`（来源：https://docs.typesafe.ai/introduction/quickstart ）。
- 缺点：要单独注册 TypeSafe 账号；注册方式、免费额度和充值门槛**未确认**；代码改动和 B 一样（改成 `noul`）。

**D. 换掉 Jev，改用 OpenRouter 上便宜的聊天模型**
- 做法一：用 logprobs。OpenRouter 支持 `logprobs`（boolean）和 `top_logprobs`（0–20）参数。来源：https://openrouter.ai/docs/api/reference/parameters.md 。但是**模型层面列出支持，不等于每个 provider 都支持**：默认情况下，不支持某个参数的 provider 也会接到请求，只是 "will ignore unknown parameters"；要设置 `provider.require_parameters: true`，才能只路由到支持的 provider。来源：https://openrouter.ai/docs/guides/routing/provider-selection.md
  - 2026-09-28 从 Models API 实测，`supported_parameters` 同时包含 `logprobs` 和 `top_logprobs` 的低价模型举例（输入/输出，美元每百万 token）：`openai/gpt-oss-20b`（0.018/0.09）、`mistralai/mistral-nemo`（0.019/0.03）、`meta-llama/llama-3.1-8b-instruct`（0.05/0.08）、`qwen/qwen3-235b-a22b-2507`（0.087/0.35）、`google/gemma-3-27b-it`（0.08/0.45）、`mistralai/mistral-small-3.2-24b-instruct`（0.094/0.25）、`meta-llama/llama-3.3-70b-instruct`（0.10/0.32）、`deepseek/deepseek-v4-flash-0731`（0.021/0.32）。这只是某一时刻的列表，价格和参数会变。
  - 映射方式：三个问题分成三次请求，或者一次请求让模型按固定顺序输出三个 `Y`/`N`；然后取 `top_logprobs` 里 `Y` 的概率除以（`Y` + `N`）的概率，当作概率。
  - 缺点：
    - 概率没有经过校准（Jev 的卖点就是 "trained for calibrated decisions"，来源：https://docs.typesafe.ai/concepts/system-one ）。
    - 不同 tokenizer 下 Y/N 的切分不一样，推理模型还会先输出思考内容，影响 logprobs 的读取。
    - 现有 0.5 阈值和 eval 基线都要重新标定。
    - 输出 token 要收费。
- 做法二：用 JSON 结构化输出，要求模型输出 `{"needs_retrieval": true, ...}`。实现最简单，但得到的是硬的 0 或 1，没有概率（等于把阈值固定死）。Vercel 自己的 fallback 文档也提到，用语言模型代答时，"doesn't produce `confidence`"，Boolean 只返回最终值。来源：https://vercel.com/docs/ai-gateway/models-and-providers/evaluation-fallbacks
- 优点：可能能用上免费模型或已有的余额。
- 缺点：判断质量、概率含义、延迟都会变，需要用现有的 eval 集重新验证；工作量是 A、B、C 里最大的。

**不管选哪条都要注意**：TypeSafe 自己说 Jev 对 CJK 语言的准确率不如英文（https://docs.typesafe.ai/models ）。这条和走哪个渠道无关，但如果要趁这次顺便评估换模型（方案 D），这一点会影响比较结果。
