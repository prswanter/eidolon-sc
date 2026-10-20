# Cloudflare Clef 能否替代 Jev（检索判断 + 通话情绪判断）

访问日期：2026-10-07。所有结论都附了一手来源（Cloudflare 官方 changelog、博客、developers.cloudflare.com 文档及其 GitHub 源文件、Hugging Face 官方模型卡、OpenRouter 官方模型页和 Models API）。标 **未确认** 的是没能在一手来源里查到的。第三方文章只作线索，引用时会注明。

## 结论先行

- **名字和 id**：Cloudflare 自研的两款决策模型叫 **Clef**（`@cf/cloudflare/clef`，27B，基于 Qwen3.8-27B）和 **Clef-flash**（`@cf/cloudflare/clef-flash`，9B，基于 Qwen3.5-9B），**2026-10-01 发布**。权重以 Apache 2.0 开源在 Hugging Face。
- **能替代**：它和 Jev 同类，按官方说法 "follows the System One API"，问题类型同样是 `noul` / `choice` / `score`，一次最多 64 个问题，回答字段也是 `answers[id].noul`、`answers[id].choice` / `probabilities` / `confidence`。我们的三个是/否问题和两个 choice 问题（情绪 7 选 1、点头 3 选 1）都能原样表达。
- **价格**：只按输入 token 计费，输出免费。Clef $0.24/M 输入，Clef-flash $0.09/M 输入。Jev 是 $0.042/M，所以 **Clef-flash 约是 Jev 的 2 倍，Clef 约是 5.7 倍**。不过 Workers AI 每天有 10,000 neurons 的免费额度，折算下来 Clef-flash 每天约 122 万输入 token 免费，Clef 每天约 46 万。
- **两条接入路线**：
  1. **Cloudflare 直连**：`POST https://api.cloudflare.com/client/v4/accounts/{account_id}/ai/run/@cf/cloudflare/clef-flash`，用 Cloudflare API token 鉴权。代码要改三处：URL 不再是 `base_url + "/systemone"`；body 里的 `model` 必须写 `"clef"` 或 `"clef-flash"`；REST 响应外面包了一层 `{result, success, errors, messages}`，要从 `res.json()["result"]["answers"]` 取答案。
  2. **经 OpenRouter**：OpenRouter 已经上架 `cloudflare/clef` 和 `cloudflare/clef-flash`（provider 是 Cloudflare，价格和直连一样），走 Decisions API。如果它的 `/api/v1/systemone` 接受这两个 id，我们**只改 `JEV_MODEL` 环境变量就能切换**。但 `/systemone` 是否接受非 TypeSafe 的模型 id，**未确认**，需要用 key 实测一次。
- **两个要先实测的风险**：
  1. **state 截断**：OpenRouter 的模型页写着 "Workers AI currently truncates long text state to roughly the first 2K tokens"。Cloudflare 自己的文档只写了 "Long text state is truncated to fit the model's token limit"，没给数字。我们的 state 有几百到 1,500 token，离 2K 很近。
  2. **中日文效果**：官方没有任何语言支持的说明，**未确认**。Qwen 底座本身擅长中文，但这只是推断。
- **Cloudflare 还托管了 Jev 本身**（`typesafe/jev`，第三方模型），见第 9 节。

---

## 0. 项目目前依赖的具体行为（对照用）

- `backend/src/eidolon/retrieval.py` 的 `JevJudge`：`POST {JEV_BASE_URL}/systemone`（默认 `https://openrouter.ai/api/v1`），模型 `typesafe/jev-1.13`。state 是一个中文 key 的 object（`角色`、`上文`（最近 4 条）、`制作人最新的一句话`），三个 `noul` 问题（`needs_retrieval`、`recall`、`about_producer`），读 `res.json()["answers"][name]["noul"]`，阈值 0.5。超时 5s，连接超时 3s。
- `backend/src/eidolon/emotion.py` 的 `JevEmotionJudge`：同一个 `ask()`，一次请求问两个 `choice`：`emotion`（7 个选项，选项 id 是中文，如 `平静`、`开心`）和 `nod`（3 个选项）。读 `answers[q]["probabilities"]`。

所以替代方案要满足：一次请求对同一个 state 答多个 noul 和 choice；choice 返回每个选项的概率；选项 id 可以是中文。

## 1. 两款模型分别是什么、区别、发布日期

| | Clef | Clef-flash |
|---|---|---|
| Workers AI id | `@cf/cloudflare/clef` | `@cf/cloudflare/clef-flash` |
| body 里的 `model` 字段 | `"clef"` | `"clef-flash"` |
| 参数量 / 底座 | 27B，Qwen3.8-27B | 9B，Qwen3.5-9B |
| 定位 | "Highest-precision decisions" | "Latency-critical, hot-path decisions" |
| 上下文 | 65,536 tokens（64K） | 65,536 tokens（64K） |
| 视觉 | 支持，最多 4 张图 | 支持，最多 4 张图 |
| 价格 | $0.24 / M 输入 token（21,818 neurons/M） | $0.09 / M 输入 token（8,182 neurons/M） |
| 官方中位延迟 / p95 | 209.3 ms / 238.6 ms | 38.8 ms / 122.4 ms |
| OpenRouter id | `cloudflare/clef` | `cloudflare/clef-flash` |
| HF 权重 | https://huggingface.co/Cloudflare/clef | https://huggingface.co/Cloudflare/clef-flash |

- 发布日期 2026-10-01。来源：https://developers.cloudflare.com/changelog/post/2026-10-01-clef-workers-ai/ 、https://blog.cloudflare.com/clef-decision-models/
- 模型页：https://developers.cloudflare.com/workers-ai/models/clef/ 、https://developers.cloudflare.com/workers-ai/models/clef-flash/ 。模型元数据（含完整 schema、价格、上下文）的源文件：https://github.com/cloudflare/cloudflare-docs/blob/production/src/content/workers-ai-models/clef.json （`clef-flash.json` 同目录，schema 两者完全相同）。
- 官方延迟对比（43 组 benchmark 的中位数）：Jev 是 524.1 ms，Clef 快 2.5 倍，Clef-flash 快 13 倍。这是 Cloudflare 自测的数据。来源：changelog。
- 能力对比（Cloudflare 自测的 Decision Index 0.2.1，完整表在 HF 模型卡）：Clef 在 BANKING77、CLINC150 这类意图分类上明显高于 Jev；但在 GPQA、MMLU-Pro、BBH、ANLI、When2Call 这类需要推理的题上低于 Jev。Clef-flash 在 CLINC150+OOS（66.8，Jev 89.3）和 RAGTruth（35.6，Jev 76.5）上明显偏弱。Typesafe 自己的四个 workflow eval 里，三家差距在几个点以内。来源：https://huggingface.co/Cloudflare/clef
- 名字的含义：clef 是乐谱上的谱号，"CF" 暗指 Cloudflare。来源：博客。

## 2. 模型类型：是否像 Jev 那样对 state 答多个问题、给 0–1 概率？

是。官方原文："Clef is a decision model, in the same family as Typesafe's Jev. Instead of generating text, it reads an input state and a set of typed questions, then returns a probability for every allowed answer." 来源：changelog。

三种问题类型（官方 JSON schema，来源：上面的 `clef.json`）：

| type | 请求 | 回答 |
|---|---|---|
| `noul` | `instructions` 必填；`criteria` 可选，是 `{true, false}` 两个描述（schema 里没把两者都设为 required） | `{type:"noul", noul: 0..1}`，即答 yes 的概率 |
| `choice` | `instructions` 和 `criteria` 都必填；`criteria` 是 "option id → 描述" 的 map，**2–255 个选项**，选项 id 是任意非空字符串，描述可以是 string/object/array/null | `{type:"choice", choice, probabilities:{option: p}, confidence}`，概率之和为 1 |
| `score` | `instructions` 和 `criteria` 都必填；`criteria` 是有序数组，**2–10 级**，从低到高，从 0 开始编号 | `{type:"score", score（按概率加权，可落在两级之间）, legend, probabilities, confidence}` |

- 问题 id 只能用字母、数字、`_`、`.`、`-`，最长 100 字符。我们现有的 id（`needs_retrieval`、`recall`、`about_producer`、`emotion`、`nod`）都符合。choice 的**选项** id 没有字符限制，中文选项 id（`平静` 等）符合 schema。来源：`clef.json`。
- HF 模型卡说 `instructions` 可以省略，省略时用问题 id 代替；但 Workers AI 的 schema 把 `instructions` 列为 required。以 Workers AI 为准，照常写上。来源：https://huggingface.co/Cloudflare/clef
- 原理：Qwen 只做一次 prefill，再用一个小的 "joint schema head" 一次性给所有问题的所有选项打分，每个问题各做一次 softmax，不生成 token。来源：博客、HF 模型卡。

## 3. 调用方式

### 3.1 Cloudflare REST（直连）

- 端点：`POST https://api.cloudflare.com/client/v4/accounts/{account_id}/ai/run/@cf/cloudflare/clef`（Clef-flash 把最后一段换成 `clef-flash`）。
- 鉴权：`Authorization: Bearer <Cloudflare API token>`。来源：模型页的 curl 和 Python 示例。
- 请求 body（来源：模型页；顶层字段 `model`、`state`、`questions` 都是 required）：

```json
{
  "model": "clef",
  "state": "Checkout has been failing for every customer for the last hour.",
  "questions": {
    "urgent": { "type": "noul", "instructions": "Is this support request urgent?" },
    "team": {
      "type": "choice",
      "instructions": "Which team should handle this request?",
      "criteria": {
        "billing": "Payments, invoices, and refunds",
        "technical": "Outages, errors, and configuration",
        "sales": "Plans and upgrades"
      }
    },
    "severity": {
      "type": "score",
      "instructions": "How severe is the customer impact?",
      "criteria": ["No impact", "Minor", "Major", "Critical"]
    }
  }
}
```

  - `state` 可以是 string，也可以是 object/array。
  - 可选的 `images`：最多 4 张，只收 base64 data URL 或 `{content_type, base64}`，不收远程 URL。官方说明这是 "Clef extension to the System One API"。
- 响应：模型的输出 schema 是 `{model, answers:{id: answer}, usage:{input_tokens, output_tokens}}`（来源：`clef.json`）。**走 REST 时，外面会再包一层 Cloudflare 的标准信封** `{"result": {...}, "success": true, "errors": [], "messages": []}`。信封格式见 https://developers.cloudflare.com/workers-ai/get-started/rest-api/ 的示例。以下是 Clef-flash 的一个实际响应示例（第三方实测，来源：https://flaviocopes.com/clef/ ，结构与官方 schema 一致）：

```json
{
  "result": {
    "model": "clef-flash",
    "answers": {
      "category": { "type": "choice", "choice": "bug_report",
        "probabilities": { "bug_report": 0.9664, "feature_request": 0.0135, "billing": 0.0058, "other": 0.0143 },
        "confidence": 0.9126 },
      "has_repro_steps": { "type": "noul", "noul": 0.5355 }
    },
    "usage": { "input_tokens": 395, "output_tokens": 0 }
  },
  "success": true, "errors": [], "messages": []
}
```

- 同一篇第三方文章还报告：`model` 字段如果写 `jev-latest`，会返回错误码 5006。这和官方 schema 的 `pattern: ^\s*(clef|clef-flash)\s*$` 一致。
- 在 Worker 里用 binding 调用 `env.AI.run("@cf/cloudflare/clef", {...})`，返回的是不带信封的对象。我们的后端是 Python 服务，用不上 binding。

### 3.2 与 System One、OpenRouter、Vercel 格式的兼容性

| 接口 | 能否调用 Clef | 说明 |
|---|---|---|
| TypeSafe System One 格式 | 请求和回答字段兼容 | "Clef follows the System One API, so you can switch an existing Jev integration to Clef by changing the endpoint and model"（来源：changelog）。HF 模型卡："The Clef API is fully compatible with Jev and SystemOne"。但 Cloudflare 的路径是 `/ai/run/<model>`，**不是** `/systemone`，而且 REST 多一层信封。 |
| OpenRouter | **能**，已上架 | `cloudflare/clef` 和 `cloudflare/clef-flash`，唯一 provider 是 Cloudflare。Models API 实测（2026-10-07）：`modality: "text+image->decisions"`、`context_length: 65536`、`pricing.prompt` 分别为 `0.00000024` / `0.00000009`、`completion: "0"`、`uptime_last_1d: 100`。模型页写明它 "runs on the OpenRouter Decisions API rather than the OpenAI-compatible chat endpoint"。来源：https://openrouter.ai/cloudflare/clef 、https://openrouter.ai/cloudflare/clef-flash 、`GET https://openrouter.ai/api/v1/models/cloudflare/clef/endpoints` |
| OpenRouter `/api/v1/systemone` | **未确认** | 该接口的 OpenAPI 描述只提到 "a System One model such as Jev"，示例是 `typesafe/jev-1.13`，没说是否接受 `cloudflare/clef`。来源：https://openrouter.ai/docs/api/api-reference/systemone/submit-a-system-one-request.md 。可以确认的是 `/api/alpha/decisions`（Decisions API）是 OpenRouter 模型页指向的接口。 |
| Vercel `/v1/evaluate` | **未确认**（未查到 Vercel 上架 Clef） | — |
| Cloudflare AI Gateway | **能** | changelog："You can also use AI Gateway with these endpoints." 做法是给 `/ai/run/@cf/...` 请求加 header `cf-aig-gateway-id: <gateway id>`；也可以用通用端点 `POST /accounts/{id}/ai/run`，body 写成 `{model, input}`。来源：https://developers.cloudflare.com/ai-gateway/usage/rest-api/ |
| OpenAI 兼容端点（`/ai/v1/chat/completions`） | **不适用** | 这个端点只服务文本生成和 embedding（来源：https://developers.cloudflare.com/workers-ai/configuration/open-ai-compatibility/ ）。Clef 不生成文本，OpenRouter 也写明 "chat completions SDKs will not work with it"。 |
| 第三方转售 | 有 | 例如 Opper 的 `https://api.opper.ai/v3/compat/v1/systemone`（模型 `cloudflare:global/clef`），来源：https://opper.ai/cloudflare/clef 。非一手来源，仅供参考。 |

## 4. 价格、速率限制、上下文

- **计价**：Workers AI 底层用 neurons 计费，$0.011 / 1,000 neurons。Clef 是 21,818 neurons/M 输入 token（= $0.24/M），Clef-flash 是 8,182 neurons/M 输入 token（= $0.09/M）。价格表**只列了输入 token**，输出不计费。来源：https://developers.cloudflare.com/workers-ai/platform/pricing/ （"Other model pricing" 一节，页面 2026-10-01 更新）
- **免费额度**："10,000 Neurons per day at no charge"，Workers Free 和 Workers Paid 都有。超出部分在 Free 计划下不能用，要升级 Workers Paid（最低 $5/月，来源：https://developers.cloudflare.com/workers/platform/pricing/ ）；Paid 计划下超出部分按 $0.011/1,000 neurons 收费。来源：Workers AI pricing 页。
- **免费额度能跑多少轮**（我自己的估算）：
  - Clef-flash：10,000 ÷ 8,182 × 1M ≈ **122 万输入 token/天**。按每轮检索判断 1,500 token 算，约 **815 轮/天**。
  - Clef：约 **45.8 万 token/天**，约 **305 轮/天**。
  - 通话里每一段都要判断一次情绪，也会消耗这份额度。
  - 中日文的实际 token 数要看响应里的 `usage.input_tokens`。
- **与 Jev 的对比**：每轮 1,500 token 时，Jev 约 $0.000063，Clef-flash 约 $0.000135，Clef 约 $0.00036。
- Clef **不在**"必须付费才能用的模型"名单里（名单只有 kimi、glm、deepseek-v4 等）。来源：pricing 页。
- **速率限制**：Clef 在目录里归类为 "Text Generation" 任务（来源：`clef.json` 的 `task.name`）。该类的默认限制是 **300 requests/min**（来源：https://developers.cloudflare.com/workers-ai/platform/limits/ ）。限制页没有为 Clef 单独列数字，所以"Clef 适用 300 rpm"是按任务类型推断的，**未单独确认**。
- **上下文**：65,536 tokens（模型页、`clef.json`、OpenRouter）。但有两个相互矛盾或需要注意的点：
  - OpenRouter 模型页："**Workers AI currently truncates long text state to roughly the first 2K tokens**, so content beyond that is not read"。Cloudflare 官方只写了 "Long text state is truncated to fit the model's token limit"，没给数字。**2K 这个上限在 Cloudflare 一手文档里未确认**，但 OpenRouter 是转发 Workers AI 的，可信度较高。第三方 decisions-api.dev 也说实测到约 2K。
  - HF 开源实现的 `encode_record` 默认 `max_length` 是 16,384 tokens，说明自托管时的默认上限也低于 64K。
  - 对我们的影响：检索判断的 state 包含最近 4 条消息加最新一句话，长消息时可能超过 2K，**被截掉的是 state 末尾**。如果被截掉的恰好是 "制作人最新的一句话"，判断就会出错。如果改用 Clef，建议把 `制作人最新的一句话` 放在 state 的最前面，或者控制上文长度。

## 5. 语言支持（中文、日文）

- **未确认**。Cloudflare 的 changelog、博客、模型页和 HF 模型卡都没有提到任何语言支持或限制。Benchmark 全是英文数据集。
- 可推断但未经证实：底座是 Qwen3.x，Qwen 系列的中文和日文能力较强，tokenizer 对中文的切分也比较高效（OpenRouter 显示 tokenizer 为 "Qwen"）。但后训练用的是 Cloudflare "internal synthetic datasets"（来源：博客），语种没有公开。
- 对比：TypeSafe 明确说 Jev 对 CJK "handled but not equally well"（见 `.scratch/jev-provider/research.md`）。Clef 在中日文上是否更好，只能用我们自己的 eval 集实测。

## 6. 概率校准、多问题一次请求

- **校准**：博客说后训练用了 "label-smoothed cross-entropy ... paired with a **Brier loss** to refine probability calibration"，并且用了自研的 RLCD（Reinforcement Learning for Calibrated Decisions）。OpenRouter 的描述称其返回 "a calibrated probability"。唯一公开的校准相关数字是 ForecastBench 的 Brier 分数（越低越好）：Clef 13.9、Clef-flash 10.6、Jev 17.4（来源：HF 模型卡）。**没有公开 ECE、可靠性图，也没有说明 0.5 附近的概率含义是否和 Jev 一致**，所以现有 0.5 阈值需要重新标定。
- **多问题**：支持，每次请求 1–64 个问题，所有问题共享同一个 state，答案按问题 id 返回。来源：`clef.json`（`minProperties: 1, maxProperties: 64`）。（第三方 decisions-api.dev 说它自己的服务限制为 8 个问题，那是它自己的限制。）
- choice 返回的 `confidence` 是 "derived from the probabilities"（来源：`clef.json`）。noul 不带 confidence，和 Jev 一样。

## 7. 数据训练与保留政策、地域可用性

- **训练和保留**：
  - 博客原文："our guarantee that we don't read, store, or train on your requests or responses (unless you want to use our fine-tuning product)"。来源：https://blog.cloudflare.com/clef-decision-models/
  - Workers AI 数据使用页："Cloudflare does not use your Customer Content to (1) train any AI models made available on Workers AI or (2) improve any Cloudflare or third-party services"，除非明确同意；只有在你自己使用 R2、KV 等存储服务时才会存储。这一条没有区分免费和付费账户。来源：https://developers.cloudflare.com/workers-ai/platform/data-usage/ 。注意该页面最后更新于 2026-04-21，里面 "Cloudflare neither creates nor trains the AI models" 的说法已经和 Clef 的现状不符，页面尚未更新。
  - 如果经 AI Gateway 并开启日志，请求和响应会存在 Gateway 日志里，这是用户自己开启的。
  - 经 OpenRouter 时，还要再看 OpenRouter 和 Cloudflare 这个 provider 的数据政策：**未确认**。
- **地域可用性**：
  - Workers AI 在 Cloudflare 的全球 GPU 节点上运行。没有找到地域限制的说明。
  - Workers AI 和 AI Gateway **不在** Cloudflare 中国网络（京东云合作，仅限 Enterprise）的可用产品列表里。来源：https://developers.cloudflare.com/china-network/reference/available-products/
  - 因此从中国大陆直接调用 `api.cloudflare.com` 的稳定性**未确认**。社区有零星的超时报告，不是官方说法。
  - 我们的后端部署在 VPS 上，能否稳定访问，取决于 VPS 所在地。建议在 VPS 上直接 curl 测一下延迟。

## 8. 拿到凭证的步骤（Cloudflare 直连）

来源：https://developers.cloudflare.com/workers-ai/get-started/rest-api/ 、https://developers.cloudflare.com/fundamentals/account/find-account-and-zone-ids/ 、https://developers.cloudflare.com/ai-gateway/usage/rest-api/

1. 注册 Cloudflare 账号：https://dash.cloudflare.com/sign-up/workers-and-pages 。免费即可，不需要绑定域名。
2. 打开 Dashboard → **Workers AI** 页面（https://dash.cloudflare.com/?to=/:account/ai/workers-ai）→ 选 **Use REST API**。
3. 选 **Create a Workers AI API Token**，确认预填的信息后 **Create API Token**，再 **Copy API Token**。token 只显示这一次，要立刻保存。
   - 如果自己手动创建 token，权限要勾 **`Workers AI - Read`** 和 **`Workers AI - Edit`**（Account 级）。
   - AI Gateway 的 REST 文档说 `/accounts/{id}/ai/*` 只需要 Account > Workers AI > Read；只有 AI Gateway 权限的 token 会返回 401（错误码 10000）。
4. 获取 Account ID：
   - 方法一：在同一个 "Use REST API" 页面的 **Get Account ID** 处复制；
   - 方法二：在 Dashboard 里按 `Ctrl+K`，搜 "Copy account ID"；
   - 方法三：在 **Workers & Pages** → **Account Details** 里复制。
5. 免费额度用完前不需要付款方式。如果每天会超过 10,000 neurons，需要升级 Workers Paid（$5/月起）。
6. 如果想要日志、缓存、限流：再建一个 AI Gateway，请求时加 `cf-aig-gateway-id` header。这一步可选。

走 OpenRouter 则只需要现有的 OpenRouter key（项目已有 `JEV_API_KEY`），按 OpenRouter 余额计费，没有 Cloudflare 的每日免费额度。

## 9. 附带发现：Cloudflare 也托管了 Jev 本身

- Cloudflare 的 AI 模型目录里有 `typesafe/jev`，标注为 "Third-party" 和 "Zero data retention"。上下文 32,000，价格 $0.042/M 输入、$0 输出，和其他渠道一样。调用方式是 `POST /accounts/{id}/ai/run`，body `{"model":"typesafe/jev","input":{state, questions}}`。来源：https://developers.cloudflare.com/ai/models/typesafe/jev/
- 第三方模型通过 AI Gateway 的 Unified Billing 计费，要先买 credits（来源：https://developers.cloudflare.com/ai-gateway/usage/rest-api/ ）。按理**不吃** Workers AI 的每日免费 neurons，但这一点**未确认**。
- 如果目的只是"换个渠道继续用 Jev"，这也是一个选项；但它没有免费额度方面的优势。

## 10. 对本项目的映射（只列要改的地方，这份调研不改代码）

| 现在（OpenRouter Jev） | 方案 A：Cloudflare 直连 Clef | 方案 B：OpenRouter 上的 Clef |
|---|---|---|
| `POST {base}/systemone` | `POST https://api.cloudflare.com/client/v4/accounts/{id}/ai/run/@cf/cloudflare/clef-flash`。URL 拼法不同，需要新的配置项或新的 judge 类 | 如果 `/systemone` 接受该 id，就不变（**未确认**）；否则改走 `/api/alpha/decisions` |
| `JEV_API_KEY`（OpenRouter key） | Cloudflare API token，另需 account id | 不变 |
| `model: "typesafe/jev-1.13"` | `model: "clef-flash"` 或 `"clef"`（必须是这两个裸名） | `cloudflare/clef-flash` 或 `cloudflare/clef` |
| `res.json()["answers"]` | `res.json()["result"]["answers"]`；错误时检查 `success`/`errors` | 不变（如果走 `/systemone`） |
| 问题 `type: "noul"`、`criteria: {true,false}` | 不变 | 不变 |
| choice 读 `probabilities` | 不变，中文选项 id 合法 | 不变 |
| 阈值 0.5 | 要用 eval 集重新标定（不同模型的概率分布不同） | 同左 |
| state 约 1,500 token 以内 | 注意约 2K 的 state 截断，最新一句话要放前面 | 同左（底层同是 Workers AI） |

**选择上的取舍**（不替你做决定）：

- **Clef-flash 直连**：
  - 优点：有免费额度（约 800 轮检索判断/天）；延迟最低（官方中位 39 ms，不含网络）；Cloudflare 承诺不存储、不训练。
  - 缺点：要改代码（URL、信封、model 名）；要多管一套凭证；中日文效果和截断都没有官方说明，必须用 eval 实测；Clef-flash 在部分 benchmark（CLINC150+OOS、RAGTruth）上明显弱于 Jev。
- **Clef 经 OpenRouter**：
  - 优点：可能只改一个环境变量。
  - 缺点：单价是 Jev 的 2 到 5.7 倍；没有免费额度；`/systemone` 兼容性待实测。
- **继续用 Jev**：最便宜（按 token 单价算），也有现成的 eval 基线；缺点是延迟较高（官方对比中位 524 ms），而且 TypeSafe 自己承认 CJK 效果较弱。

建议的下一步验证（都需要人工拿 key 操作）：

1. 用 OpenRouter key 调一次 `POST https://openrouter.ai/api/v1/systemone`，body 写 `model: "cloudflare/clef-flash"`，确认 `/systemone` 是否接受。
2. 用现有的检索判断 eval 集和情绪 eval 集，分别跑 Jev、Clef、Clef-flash，对比准确率和概率分布，重新定阈值。
3. 构造一个超过 2K token 的 state，把关键信息放在末尾，测截断是否存在。
4. 在 VPS 上测到 `api.cloudflare.com` 的延迟。
