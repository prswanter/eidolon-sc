# 04: 隐私说明和文档写上阿里云百炼

**What to build:** 用户看到的隐私说明、部署者看到的文档都改为语音识别两家可选。背景见 `../spec.md` 和 ADR-0010。

**Blocked by:** 03。只改文档和 `frontend/src/i18n/zh.ts` 的文案。

**Status:** resolved

## 要做的

- **隐私说明**（`zh.ts` 里「这些数据会交给哪些第三方处理」的「语音服务」）：固定文案，两家都列。大意：通话时你的声音会发给部署者选择的语音识别服务（Soniox 或阿里云百炼）识别成文字，角色的回复会发给 Fish Audio 合成语音；阿里云百炼不会用它训练模型，但会保存一段时间，存放在中国内地或新加坡，取决于部署者的账号。自带密钥那条 note 不动。
- **`.env.example`**：语音通话那一节加 `STT_PROVIDER`、`DASHSCOPE_API_KEY`、`BAILIAN_STT_MODEL`，写明：两家二选一；百炼的 key 北京、新加坡都行，系统自动判断；要先在百炼控制台开通所选模型；key 不能用时后端拒绝启动；北京有免费额度。加密自带密钥那行的服务列表改掉 Soniox 的写死。
- **`docs/deploy.md`**：语音通话需要的 key 改为「Fish Audio，加 Soniox 或阿里云百炼之一」。
- **README（中、英、日）**：功能表的自带密钥一行、架构图的 Call 边、服务表、致谢里加上阿里云百炼。服务表里写明公开部署选百炼时数据可能存放在中国内地（指向 ADR-0010）。
- 文案里统一写「阿里云百炼」（英文 Alibaba Cloud Model Studio，日文 Alibaba Cloud Model Studio），不写「千问」，模型名除外。

## 验收

- [x] 仓库里除了历史 `.scratch` 和 ADR 以外，不再有「只能用 Soniox」的说法（grep `Soniox` 逐条看过）。
- [x] `frontend/` 下测试和类型检查通过（`callEnd.test.ts` 里的 Soniox 用例是后端给的文字，可以保留）。
- [x] **人工验收（留给用户）**：落地页的隐私说明读起来清楚。

## Comments

### 2026-10-02：实现说明

自动化的验收项都做完了：grep `Soniox` 逐条看过，前端 `vitest` 404 passed，`tsc` 没有报错。人工验收留给用户。

- **隐私说明**（`zh.ts`「语音服务」）：按 ticket 的大意写成固定文案，两家都列，写明阿里云百炼不训练、会保存、存放在中国内地或新加坡取决于部署者的账号。自带密钥那条 note 没动。
- **`.env.example`**：语音通话一节加 `STT_PROVIDER`、`DASHSCOPE_API_KEY`、`BAILIAN_STT_MODEL`，写法照 `EMBEDDING_PROVIDER` 那节：二选一、地域自动判断、北京有免费额度、先开通模型、调不通（两个地域都拒绝、模型没开通、连不上）就拒绝启动、公开部署用北京 key 时声音送到中国内地。`EIDOLON_SECRET_KEY` 那行的服务列表改成「LLM、语音合成、语音识别」。
- **`docs/deploy.md`**：语音通话需要 Fish Audio，加 Soniox 或阿里云百炼之一。
- **README（中、英、日）**：
  - 功能表的自带密钥一行、架构图的 Call 边、快速开始的配置表、致谢都加上阿里云百炼；
  - 「语音通话」一节开头改为填 Fish Audio 和语音识别服务的 key，下面加 `STT_PROVIDER` 的服务表和 WARNING：启动试调、调不通就拒绝启动，公开部署用北京 key 时声音在中国内地处理和保存，指向 ADR-0010；
  - 自带密钥的服务表里语音识别一行改为「Soniox 或阿里云百炼 / 服务商和 key」，下面加一条：百炼只填 key，地域自动判断，模型跟部署者的 `BAILIAN_STT_MODEL` 走；
  - 项目结构加 `bailian.py`。
- **ticket 范围以外**：`scripts/setup-oauth.sh` 生成 `EIDOLON_SECRET_KEY` 时的提示也写死了 Soniox，一并改成「LLM、语音合成、语音识别」。

**grep `Soniox` 剩下的**：`.env.example`、README 里两家并列的说法；`zh.ts` 设置页的服务商名；`callEnd.test.ts` 的后端文字用例（ticket 允许保留）；`backend/` 里 Soniox 自己的实现、两家并列的注释和测试。

**code review 之后改的**

- README 的 WARNING 补上「连不上」也会拒绝启动（`find_region` 把连不上当作失败，`.env.example` 原本就写了）；
- 致谢里百炼那条去掉重复的「语音识别」，改为「可代替 Soniox」；
- `.env.example` 首行改为「语音识别（Soniox 或阿里云百炼）和语音合成（Fish Audio）」，两边对称；
- 中文 README 一处措辞。

**没改的判断题**

- 隐私说明「阿里云百炼不会用你的声音训练模型」没加「按量付费」的限定：ticket 和 spec 给的文案就是这样。免费额度下的数据是否同样不训练没有查证，如果要精确，可以再改；
- 语音识别的选择放在「语音通话」一节里，没像向量化服务那样单独成节；
- `.env.example`、`setup-oauth.sh` 里「用户自带 API 密钥」的旧说法（CONTEXT.md 建议避免「API 密钥」）不是这次引入的，没动。

### 2026-10-02：人工验收

用户看过落地页的隐私说明和三份 README 的改动，验收通过。ticket 标为 resolved。
