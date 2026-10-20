# 03: 判断模型的 eval 集和 `eidolon eval judge`

**What to build:** 一份提交进仓库的判断模型 eval 集，以及一个对它跑任意判断模型、输出对比结果的命令，用来定阈值、选默认模型、确认 state 会不会被截断。做法参照 `backend/eval/rerank-calibration.toml` 和 `eidolon eval rerank`。

**Blocked by:** 01

**Status:** resolved

- [x] `backend/eval/judge.toml`，由 agent 起草、人工审核：
  - **检索判断**，约 40 条。每条有角色、上文（0–4 条）、制作人最新的一句话，以及期望结果（`nothing` / `references` / `recall` / `memories`）。覆盖：
    - 闲聊和寒暄；
    - 问歌曲、唱片、演出、组合成员；
    - 问剧情经过（「那时候怎么样」）；
    - 谈自己的事（猫、工作、心情）；
    - 容易混淆的情况：提到剧情里的地名但只是闲聊，问「你还记得我说过……」。
    
    话以日语为主，夹几条中文。
  - **长上文**，若干条：上文写得很长，让 state 超过 2K token，关键信息只出现在「制作人最新的一句话」里，用来测截断。
  - **情绪判断**，约 30 条：角色的一段日语回复和期望的情绪（七选一），以及点头、摇头或都不（三选一）。七种情绪都要覆盖，包括「平淡的话应判为平静」。
  - 用到的角色、歌曲、剧情都是真实的，但不放剧情原文（ADR-0003）。
- [x] `eidolon eval judge`：
  - 用当前环境的配置建判断模型；可以用参数临时指定 `--provider` / `--model`，方便同一份配置轮流跑三家。
  - 每条输出：期望结果、实际结果、各题的概率，用量（input_tokens）也一并输出。
  - 汇总输出：
    - 检索判断四类结果的混淆矩阵和准确率；
    - 每道题在期望为是 / 否时的概率分布（最小值、中位数、最大值），用来看 0.5 是否合适；
    - 情绪和点头的准确率；
    - 长上文用例单独统计；
    - 平均延迟。
  - 可以把结果写成 JSON 文件，方便三家对比。
  - 失败的请求单独计数，不中断整轮。
- [x] 测试：用假的判断模型跑一份极小的 eval 集，核对汇总的计算（混淆矩阵、分布、长上文分组）。
- [x] 全部测试通过，pyright 和 ruff 无错误。

起草完 eval 集后，在 Comments 里请人工审核期望结果；审核后再进入 04。

## Comments

实现说明：
- `backend/eval/judge.toml`：检索判断 43 条（nothing 10、memories 11、references 11、recall 11，四个角色都有，中文 7 条）；长上文 4 条（recall 2、references 1、memories 1，每条上文 3,500 字以上，关键信息只在 said 里；没有 nothing，因为截掉 said 本来就会判 nothing，测不出截断）；情绪 33 条（calm 7、happy 6、其余各 4；点头 yes 6、no 6、none 21）。全部 `reviewed = false`。
- `eidolon eval judge [--provider jev|cloudflare] [--model M] [--file F] [--characters C] [--json F]`，代码在 `backend/src/eidolon/judge_eval.py`。state 和问题都走对话里同一套代码（`ModelRetrievalJudge.ask` / `ModelEmotionJudge`），按 `judge_thresholds_for` 查到的阈值决定。
- 为了拿到用量，`JevJudge` / `CloudflareJudge` 加了 `reply()`，返回答案和 `input_tokens`；`ask()` 基于它。`ModelRetrievalJudge` 拆成 `ask`（三题概率）和 `decide`（按阈值），`emotion.decide` 同理。
- 各题「期望为是 / 否」的划分：needs_retrieval 在期望 references、recall 时为是，nothing、memories 时为否；recall 只在期望 recall 时为是；about_producer 在期望 memories 时为是，只和 nothing 比（期望 references 的回合本来就会找记忆，不计入）。
- 情绪的「猜对 / 猜错时的概率」是最可能那个选项的概率，按它是否等于期望来分，不看阈值；`JUDGE_EMOTION_MIN_PROBABILITY` 应落在两者之间。

**请人工审核期望结果**（04 的第一项）。起草时最拿不准的几条：
1. `meguru-references-passing-mention-wing`：鼓励时顺口提到 W.I.N.G.，按「提到具体的事件」标 references，标 nothing 也说得通。
2. `mano-nothing-park-sunbathing`：提到「いつもの公園」只是闲聊。
3. `kogane-memories-champon-lunch`、`hiori-memories-cooking-plan`：制作人自己的事，但碰到了角色资料（长崎、做菜）。
4. `meguru-memories-mistake-at-work`：带情绪，可能被当成情绪回应。
5. `hiori-nothing-today-lesson`：问今天的练习，标 nothing。
6. 情绪边界：`meguru-emotion-not-tired-no`（开心还是平静）、`hiori-emotion-rehearsal-mistake-sad`（难过还是生气）、`hiori-emotion-hard-worker-shy-no`（害羞还是平静）、`kogane-emotion-champon-praise-happy`（「そうやろ？」算不算同意）。
- 长上文按字符数估算，是否真的超过 2K token 要在 04 里看 `input_tokens`。
