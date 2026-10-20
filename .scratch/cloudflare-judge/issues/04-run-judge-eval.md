# 04: 用真实 key 跑 eval，实测 Cloudflare

**What to build:** 人工拿真实 key 做 agent 做不了的实测，把结果贴回本 ticket 的 Comments，05 据此定数值。

**Blocked by:** 02, 03

**Status:** resolved

- [x] 审核 `backend/eval/judge.toml` 的期望结果（如果 03 里还没审）。
- [x] 准备凭证：Cloudflare API token（Workers AI Read + Edit）和 account id（步骤见 `../research.md` 第 8 节）。
- [x] 启动检查：故意填错 token、填错 account id 各一次，确认报错指向的是对的那一项；再填对的，确认正常启动。
- [x] `eidolon eval judge` 分别跑 Jev（现有 OpenRouter key）、Clef、Clef-flash，各存一份 JSON。
- [x] 截断：看长上文用例在 Clef 系列上是否明显变差；也可以看 `usage.input_tokens` 是否被截在约 2K。
- [x] OpenRouter：用现有的 key，设 `JEV_MODEL=cloudflare/clef-flash` 跑几条，确认 `/systemone` 接不接受。
- [x] 在 VPS 上测一次到 `api.cloudflare.com` 的延迟（例如跑一次 eval 看平均延迟，或者 curl）。
- [x] 真实对话：`JUDGE_PROVIDER=cloudflare` 下做几轮文字对话和一次通话，确认闲聊不检索、问起经过会回忆、立绘的情绪会变化。
- [x] 把三家的汇总、截断结论、OpenRouter 结论和 VPS 延迟写进 Comments。

## Comments

2026-10-07，由 agent 用部署者本地 `.env` 里的 key 实测（第 1 项由人工认可，第 7 项暂缓）。

**审核**：人工认可了 eval 集的期望结果，`judge.toml` 全部标成 `reviewed = true`。

**启动检查**：
- 正确的凭证：通过。
- 填错 token：401 / 10000「Authentication error」，报 `CLOUDFLARE_API_TOKEN 无效`。正确。
- 填错 account id：**同样是 401 / 10000**，不是 404 或 7003，原来的实现会把它报成 token 的问题。已修：遇到 401/403 时再调一次 `GET /user/tokens/verify`，token 有效（`status: active`）就报「CLOUDFLARE_ACCOUNT_ID 不对，或者 token 没有这个账号的 Workers AI 权限」。修完后实测，两种填错都指向了对的那一项。账号所有的 token（不是用户 token）在 `/user/tokens/verify` 上查不了，这时退回原来那句含两种可能的报错。

**三家的汇总**（阈值都是 0.5，47 条检索 + 33 条情绪，没有失败的请求，本地网络）：

| | Jev 1.13 | Clef | Clef-flash |
|---|---|---|---|
| 检索准确率 | 94% | 81% | 85% |
| 长上文（4 条） | 4/4 | 4/4 | 4/4 |
| 情绪准确率 | 100% | 85% | 88% |
| 点头准确率 | 91% | 97% | 88% |
| 平均延迟 | 0.51s | 0.66s | 0.47s |
| 普通用例 input_tokens 中位数 | 965 | 596 | 596 |

检索判断各家判错的条目：
- **Jev**：`mano-memories-remember-cat-name`、`kogane-memories-remember-coriander` 判成 references（检索时也会找记忆，影响不大）；`meguru-references-passing-mention-wing` 判成 nothing（needs_retrieval 0.33）。
- **Clef**：期望 memories 的 11 条里有 5 条判成 nothing，about_producer 在 0.07–0.48，期望为是时中位数只有 0.53。这是最伤的错误：会找不到用户的记忆。另有两条问演出会场的判成 recall（0.60、0.77）。
- **Clef-flash**：
  - 两条问演出会场的判成 recall（0.68、0.83）；
  - `kogane-references-yuika-relation` 判成 nothing（0.44）；
  - `mano-nothing-park-sunbathing` 判成 memories（0.68）；
  - 两条「还记得我说过」判成 references，和 Jev 一样。

各题概率分布（期望为是 / 期望为否；最低值 / 中位数 / 最高值）：

- **needs_retrieval**
  - Jev：是 0.33 / 0.85 / 0.97，否 0.06 / 0.11 / 0.71
  - Clef：是 0.44 / 0.97 / 0.99，否 0.04 / 0.06 / 0.55
  - Clef-flash：是 0.17 / 0.89 / 0.98，否 0.03 / 0.08 / 0.58
- **recall**
  - Jev：是 0.76 / 0.91 / 0.95，否 0.01 / 0.03 / 0.34
  - Clef：是 0.84 / 0.96 / 0.99，否 0.03 / 0.06 / 0.77
  - Clef-flash：是 0.78 / 0.97 / 0.99，否 0.01 / 0.02 / 0.83
  - Clef 期望为是的最低值 0.84，期望为否的最高值 0.77，阈值定在 0.8 左右就能把两条问会场的分出去。
  - Clef-flash 两者有重叠：期望为是的最低值 0.78，期望为否的最高值 0.83（`meguru-references-1st-live-venue`），只调阈值分不干净。好在误判成 recall 时也会带回演出资料，代价不大。
- **about_producer**
  - Jev：是 0.22 / 0.96 / 0.97，否 0.03 / 0.05 / 0.47
  - Clef：是 0.07 / 0.53 / 0.92，否 0.03 / 0.04 / 0.08
  - Clef-flash：是 0.35 / 0.90 / 0.98，否 0.01 / 0.03 / 0.68
  - Clef 的阈值降到约 0.1，期望为否的最高值是 0.08，能救回大部分 memories。

情绪：
- Jev 最可能的情绪概率几乎都是 1.0。
- Clef 系列判错的多是「把带情绪的话判成平静」：难过、生气在 0.4–0.5 之间时落到了阈值下面，被判成平静。情绪阈值降到 0.4 左右，能救回其中几条。
- 点头三家各错几条，多数是「都不是」和「同意」之间的边界。

**截断**：没有看到截断。长上文 4 条在三家都判对了，Clef 系列的 input_tokens 是 2,384–2,672（Jev 用自己的计法是 4,561–4,693），超过了 2K，而且「制作人最新的一句话」放在 state 最后也读到了。至少在 2.7K token 以内，Workers AI 没有截断，05 不需要调整 state 顺序。

**OpenRouter**：`/systemone` 接受 `cloudflare/clef-flash` 和 `cloudflare/clef`，返回正常的 noul 答案。所以只改 `JEV_MODEL=cloudflare/clef-flash` 就能经 OpenRouter 用上 Clef，走 OpenRouter 余额，没有免费额度。

**VPS 延迟**（直连，没有代理；每次都是新建连接）：
- Cloudflare clef-flash：0.81–1.95s，其中 TLS 握手 0.39–1.53s。扣掉握手（应用里连接是复用的），每次判断约 0.4–0.5s。
- OpenRouter Jev：1.31–4.06s，扣掉握手约 0.8–2.6s。
- 通话中情绪判断的超时是 1.5s，在 VPS 上 Cloudflare 明显更稳。

**真实对话**（2026-10-07，人工，用 05 定的阈值）：`JUDGE_PROVIDER=cloudflare` 下的文字对话和通话都没有问题：闲聊不检索，问起经过会回忆，立绘的情绪会变化。

三家的完整逐条结果没有提交进仓库，重跑命令：`eidolon eval judge --provider jev|cloudflare [--model clef|clef-flash] --json F`。
