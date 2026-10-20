# 01: 拆掉「必须自带 LLM」

**What to build:** 不论部署怎么设置，没带 LLM 自带密钥的用户都能发起文字回合和通话，只受限额约束，再也不会收到「必须自带 LLM」的 403。这项要求的痕迹全部去掉：后端的规则和拒绝、拨号预检里的检查、`/api/account` 的 `own_llm_required`、单独限额里的「可以用部署者的 LLM」（迁移时删掉那一列和存在后台的覆盖值）、后台配置「限额」一节的开关、前端对话页的提前拦截、设置页的「LLM 必填」、通话结束原因 `own_llm_required` 和相关文案，以及部署文档、README、`.env.example`、`docs/agents/local-acceptance.md` 里的说明。`.env` 里留着 `EIDOLON_OWN_LLM_REQUIRED` 时，启动时打一条警告说它已经不起作用，照常启动。豁免规则这张票不动：通话仍是三项全带才不计入。

详见 `.scratch/exempting-keys/spec.md`。

**Blocked by:** None (can start immediately)

**Status:** resolved

- [x] 没带 LLM 的文字回合、通话和拨号预检都不再因为没带 LLM 被拒绝，照常计入限额；冷却的 409、超限的 429 不变
- [x] `/api/account` 不再返回 `own_llm_required`
- [x] 后台配置「限额」一节没有这个开关；后台改它的请求不再被接受（这个字段不存在）
- [x] 单独限额接口不再读写放行；后台「单独限额」对话框和用户详情里不再有放行
- [x] 旧库升级后，`user_limits` 没有 `deployer_llm_allowed` 列，`config_overrides` 没有 `limits.own_llm_required` 这一行；单独限额照常可读写
- [x] `.env` 里留着 `EIDOLON_OWN_LLM_REQUIRED`（任何值）时启动照常，并打一条警告
- [x] 前端：对话页输入框和电话键不再因为没带 LLM 被替换；设置页不再把 LLM 标成必填；API 层和通话结束原因里不再有这种 403
- [x] 部署文档（三种语言）、README（三种语言）、`.env.example`、`docs/agents/local-acceptance.md` 去掉这项要求
- [x] 后端测试走 HTTP（`make_client`）：原有两份必须自带 LLM 的测试和放行的测试删掉，补上「没带 LLM 照常放行并计入」和迁移、旧变量警告的测试
- [x] 后端、前端的全部测试、类型检查、`check-discipline`、`next build` 通过

## Comments

2026-10-13 审查后定下：「没带 LLM 照常放行并计入」不另写测试。规则删掉后这里没有分支了，已有的 `test_rate_limit.py`（没带自带密钥的回合、通话超出每小时限额被拒）和 `test_own_speech_keys.py`（没带的语音用部署者的 key）已经覆盖这条路径（`CODING_STANDARDS.md`「Same path, another file」）。新测试只留迁移和旧变量警告两条（`test_own_llm_no_longer_required.py`）。后台 PUT 限额时多带的 `own_llm_required` 被忽略（200），不报 422，和其他配置项一样；开着旧后台页的人照样能保存限额。
