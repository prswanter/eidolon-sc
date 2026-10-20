# 向量化服务可选 + 重排模型升级

Status: ready-for-agent

术语以 `CONTEXT.md` 为准；相关决策见 ADR-0003（剧情库与音色仅限私用）、ADR-0005（向量化服务在部署时二选一）。

## Problem Statement

剧情库、角色资料和记忆的向量化目前只能用硅基流动的 Qwen3-Embedding。参考项目 LAPLACE Eidolon 用的是 Gemini 向量，我想在部署时能选用 Google 的 `gemini-embedding-2`，和现在的 Qwen 二选一。

另外，重排目前默认用 Qwen3-Reranker-0.6B，想换成效果更好的 4B。但检索和记忆的阈值（`0.3`、`0.01`）是按 0.6B 定的，项目里也没有任何数据能说明阈值该定多少。

## Solution

1. 新增 `EMBEDDING_PROVIDER=siliconflow|gemini`（默认 `siliconflow`），`gemini` 走 Google 原生接口（`GEMINI_API_KEY`），维度由 `EMBEDDING_DIMENSIONS` 指定（默认 1536）。重排仍在硅基流动，所以两种选择下都需要 `SILICONFLOW_API_KEY`。
2. 库里只保留当前模型的向量。换模型（或换维度）后运行 `eidolon reembed`，用库里已有的原文重新向量化剧情库、角色资料和全部记忆，不需要重新下载或导入；后端启动时发现剧情库缺当前模型的向量就打警告。
3. 用一份提交进仓库的小校准数据集和 `eidolon eval rerank` 命令，比较 0.6B 与 4B 的分数分布，定出 4B 的阈值；默认重排模型改为 `Qwen/Qwen3-Reranker-4B`（校准后决定保持 0.6B，见 issues/03 的 Comments），阈值按已知模型分组，可用 `RERANK_MIN_RELEVANCE` 覆盖。

## Decisions

- 用明确的 `EMBEDDING_PROVIDER` 选择，不从模型名推断。
- Gemini 走原生 `batchEmbedContents`：每条文本一个请求项（放进同一个 `parts` 会被合并成一个向量）；不走 Google 的 OpenAI 兼容接口（beta，未说明数组输入与 `dimensions`），也不走 Vercel AI Gateway（数组输入行为未确认，且用不了免费层）。
- Gemini 不支持 `task_type`，用文本前缀区分：查询 `task: search result | query: …`；文档 `title: … | text: …`。`title` 在剧情段落里是「卡名或活动名 + 话标题」，在角色资料里是该条资料的 Markdown 标题，在记忆里是 `none`。Qwen 这一侧的查询指令保持不变。
- 存储用的模型标识带上维度（如 `gemini-embedding-2@1536`），改维度等同于换模型，避免同一标识下混入不同长度的向量。硅基流动保持现在的标识（裸模型名），已有部署不需要重新向量化。
- 允许用 Gemini 免费层，文档提醒免费层数据会被 Google 用于改进产品（ADR-0005）。VPS 不能在中国大陆、香港、澳门（Gemini API 不对这些地区开放）。
- 只保留当前模型的向量；`reembed` 成功后删除其他模型的向量。换回去就再跑一次。
- `reembed` 期间服务照常运行，检索暂时不完整；命令只补缺的向量，可中断、可重跑。
- 阈值按已知模型分组（0.6B 一组、4B 一组）；未知模型用 4B 的阈值并打警告；`RERANK_MIN_RELEVANCE`（检索）与对应的记忆阈值变量可手动覆盖。
- 校准数据集只含问题、剧情编号、资料标题和标注，不含剧情原文，可以提交（不违反 ADR-0003）。

## Out of Scope

- 更换重排服务商（Cohere、zerank 等）。
- 同时保留两套向量以便免费切换。
- 中文 BM25 / 混合检索。
- 调整 Qwen 一侧的查询指令。

## Issues

- `issues/01-embedding-provider-and-gemini.md`
- `issues/02-reembed-command.md`（Blocked by 01）
- `issues/03-rerank-calibration-and-4b.md`
- `issues/04-docs.md`（Blocked by 01、02、03）
