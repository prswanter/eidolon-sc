# 判断模型可选用 Cloudflare Clef

Status: resolved

术语以 `GLOSSARY.md` 为准（本次新增「判断模型」）。调研见 `research.md`。

## Problem Statement

判断模型目前只有 Jev（TypeSafe，经 OpenRouter 的 System One 端点）。它每个回合决定要不要回忆剧情、查资料或想起记忆，通话中还判断每段回复的情绪和点头/摇头。Cloudflare 在 2026-10-01 发布了两款同类的判断模型 Clef 和 Clef-flash，兼容 System One 的请求格式，延迟更低，Workers AI 还有每日免费额度。部署者希望能在部署时改用 Cloudflare 的判断模型。

另外，项目里没有任何数据能说明判断模型判得对不对：0.5 的阈值是凭感觉定的，换模型后也没法比较。

## Solution

1. 新增 `JUDGE_PROVIDER=jev|cloudflare`（不填为 `jev`）。`jev` 保持现状，即任何 System One 端点，`JEV_*` 变量不变。`cloudflare` 直连 Workers AI，需要 `CLOUDFLARE_API_TOKEN` 和 `CLOUDFLARE_ACCOUNT_ID`；模型由 `CLOUDFLARE_JUDGE_MODEL=clef|clef-flash` 选，默认值暂定 `clef-flash`，由 eval 结果最终确定。检索判断和情绪判断都用所选的这一家。
2. 选 `cloudflare` 时，启动时用一个极小的请求试一次凭证：token 或 account id 被拒（401/403/404）就拒绝启动，并说明是哪一项不对；网络问题只警告。
3. 判断阈值改为在代码里按模型给定（检索的 0.5，以及情绪的最低概率），由 eval 结果确定。情绪的两个变量改名为 `JUDGE_EMOTION_MIN_PROBABILITY` 和 `JUDGE_EMOTION_TIMEOUT`，填了就覆盖所有模型；配了旧名字时启动报错并给出新名字。
4. 建一份提交进仓库的判断模型 eval 集，加一个 `eidolon eval judge` 命令，对比 Jev、Clef、Clef-flash 的准确率和概率分布。阈值、默认模型和 state 顺序都按它的结果来定。
5. 如果 OpenRouter 的 `/systemone` 接受 `cloudflare/clef-flash`，文档里说明只改 `JEV_MODEL` 也能用上 Clef（走 OpenRouter 余额，没有免费额度）。

## Decisions

- **判断模型始终由部署者承担，用户不能自带**（GLOSSARY「判断模型」「自带密钥」）。不做 BYOK。
- 用明确的 `JUDGE_PROVIDER` 选择，不从填了哪个 key 推断（同 ADR-0005 的理由）。
- 整个部署只用一家，出故障也不换另一家；失败处理沿用现状：检索判断失败就照常查参考资料，不重试；情绪判断失败就当作平静。
- 检索判断和情绪判断始终用同一家，一个开关决定。
- Cloudflare 直连：`POST https://api.cloudflare.com/client/v4/accounts/{account_id}/ai/run/@cf/cloudflare/{model}`，`Authorization: Bearer <token>`。body 的 `model` 必须是裸名 `clef` / `clef-flash`。答案在 `res.json()["result"]["answers"]`，`success: false` 时读 `errors`。问题格式（`noul`、`choice`、中文选项 id）和 Jev 相同。
- 两款模型都能选，默认值由 eval 决定（暂定 `clef-flash`；如果它的检索判断明显不行，就改成 `clef`）。
- 阈值按模型写在代码里，不为每个模型单独开环境变量。OpenRouter 上的 `cloudflare/clef-flash` 和直连的 `clef-flash` 用同一组阈值。未知模型（例如自己填的 `JEV_MODEL`）用 Jev 的阈值并打警告。
- state 截断（OpenRouter 说 Workers AI 只读 state 的前约 2K token）：先用 eval 里的长上文用例实测。确实会截断时，所有服务商统一把「制作人最新的一句话」放到 state 最前面，并用 eval 确认 Jev 没有变差。
- Workers 免费计划每天的额度用完后，当作普通的判断失败处理，日志里写清楚是额度用完。文档写明公开部署选 Cloudflare 时应开 Workers Paid：通话中每段回复都要判断一次情绪，免费额度不够用。
- 启动时检查只对 Cloudflare 做，Jev 维持现状。
- 隐私页的「部署者配置的语言模型服务」已经涵盖判断模型，文案不改。Cloudflare 承诺不存储、不训练（research.md 第 7 节）。
- 不写 ADR：换服务商只是改配置，随时能改回来。

## Out of Scope

- 用户自带判断模型的密钥。
- 经 Cloudflare 调用 Jev（`typesafe/jev`，第三方模型，走 Unified Billing）。
- 经 Cloudflare AI Gateway 调用（`cf-aig-gateway-id`）。
- Clef 的图片输入。
- 一家失败时切换到另一家。
- Jev 的启动检查。

## Issues

- `issues/01-cloudflare-judge.md`
- `issues/02-per-model-thresholds.md`（Blocked by 01）
- `issues/03-judge-eval.md`（Blocked by 01）
- `issues/04-run-judge-eval.md`（人工，Blocked by 02、03）
- `issues/05-apply-eval-and-docs.md`（Blocked by 04）
