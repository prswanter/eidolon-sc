# 07: 对话中检索剧情与角色资料

**What to build:** 每一句话，对话引擎先让 Jev（通过 Vercel AI Gateway 调用）判断是否需要检索。需要时，从剧情库中检索当前角色出场过的剧情，同时检索角色资料，用硅基流动的 Qwen3-Reranker 重排后放进提示词。这样角色聊天时能自然地提起自己真正经历过的剧情，而不会把别的偶像的剧情说成自己的。

**Blocked by:** 06

**Status:** resolved

- [x] Jev 判断不需要检索时，本回合不做检索（测试中用假判断器验证）
- [x] 剧情检索按出场角色过滤：真乃的对话检索不到她没有出场的剧情
- [x] 支持角色资料（档案与人物关系）的配置和检索，检索结果会进入提示词
- [x] 检索结果先重排再进入提示词，数量有上限
- [x] Jev、向量化、重排服务都通过接口注入，测试中使用假实现
- [x] 以上行为都有通过后端对外接口驱动的测试

## Comments

实现摘要：

- 流程（`retrieval.py` 的 `Retrieval`，由对话引擎在每个回合调用，文字和语音回合都经过它）：Jev 先看最近 4 条消息和这句话，回答 YES/NO；NO 则本回合不做任何检索。YES 时这句话只向量化一次，同时检索剧情库（只含当前角色出场的剧情，`StoryCorpus.search_by_vector`）和该角色的角色资料，各取最多 12 条候选，一起交给 Qwen3-Reranker 重排，取前 5 条（`MAX_REFERENCES`）放进系统提示词的「回忆与资料」一节。提示词要求自然地回忆、不照搬台词、不断言制作人当时选了哪个选项。
- 容错：Jev 出错时照常检索；向量化或重排出错时本回合不带检索结果照常回复，都只记日志，不让回合失败。
- 配置：需要 `SILICONFLOW_API_KEY`、`AI_GATEWAY_API_KEY` 和 `JEV_MODEL`（Jev 在 Vercel AI Gateway 上的模型名，没有默认值）；缺任何一项时关闭检索，只凭人设回复。`RERANK_MODEL` 默认 `Qwen/Qwen3-Reranker-0.6B`，`AI_GATEWAY_BASE_URL` 默认 `https://ai-gateway.vercel.sh/v1`。`EmbeddingSettings` 改名为 `SiliconFlowSettings`，同时带向量化和重排模型。
- 角色资料：`characters.toml` 新增可选的 `facts`，指向一个 Markdown 文件，每个标题下的内容是一条资料，标题路径作为出处（如「人物关系 / 風野灯織」）。文件不进仓库（ADR-0003），提供 `characters/facts/example.md`；缺文件时只警告。向量存在 SQLite 的 `character_facts` 表里，第一次检索某位角色时向量化，之后只有改动过的条目会重新向量化，删掉的条目会被清理，所以改资料只需要重启后端。
- 接口注入：`create_app` 新增 `jev`、`embedder`、`reranker` 参数，测试用 `FakeJudge`、`FakeEmbedder`、`FakeReranker`。样例剧情移到 `tests/stories.py`，`story` fixture 移到 conftest。
- 测试：`test_retrieval.py` 通过文字回合接口验证闲聊不检索、只回忆出场过的剧情（恋鐘检索不到真乃的公园剧情，没有配置角色出场的活动剧情谁都检索不到）、角色资料只属于自己、先重排后截断、修改资料后重启生效、Jev 出错照常检索、向量化出错照常回复。`test_retrieval_services.py` 用模拟的 HTTP 响应验证硅基流动重排接口和 Jev 的请求与解析。

留给后续 ticket 的注意点：

- 检索查询只用了用户这一句话；「那次呢？」这类依赖上文的短句可能检索不准，必要时可以让 Jev 同时改写查询。
- 10（共享记忆）可以把记忆作为第三类候选加进同一次重排。
- ~~Jev 的实际模型名、判断提示词的效果还没有用真实服务验证。~~ 已用真实服务验证，见下方。

真实服务验证（2026-09-25）：

- Jev（`typesafe-ai/jev`）是评估模型，不走 Chat Completions，要调用 AI Gateway 的 `/v1/evaluate`：传入 state 和一个 boolean 问题，返回概率。`JevJudge` 已改为这个接口，概率 ≥ 0.5 时检索。14 句人工标注的样例全部判断正确（闲聊 0.12–0.21，需要检索 0.74–0.89，含「那次之后呢？」这类依赖上文的短句），每次约 0.2–0.4 秒。
- 导入完整 SCTranslationData：5341 段剧情，向量化 1940 段，约 2 分钟。真乃、恋鐘各 4 句检索的结果都只来自她出场过的剧情。
- 重排后没有分数门槛：相关结果的重排分数在 0.93–0.99，无关结果在 0.001–0.08，原先无关时也会固定取 5 条放进提示词；现在重排分数低于 0.3（`MIN_RELEVANCE`）的候选不进提示词。真实验证：问恋鐘没经历过的「公园喂鸽子」不再带任何检索结果，「事务所做料理」只留下唯一相关的 1 条。
