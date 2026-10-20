# 01: 文字对话最小链路

**What to build:** 打通一条从浏览器到 LLM 的最小完整链路：用户在对话页用文字和真乃聊天，角色的回复流式返回日语原文和中文字幕，两者都写入对话记录。这一步搭好后端（Python）、前端（Next.js）和 Docker Compose 的骨架，并建立一个不依赖语音的「对话引擎」，后续的语音、检索、记忆都叠加在它之上（见 spec「整体结构」）。暂时只用一个默认用户和一份写死的最小人设。同时搭好切入点 A 的测试框架：用假 LLM 通过后端对外接口驱动文字对话回合。

**Blocked by:** None (can start immediately)

**Status:** resolved

- [x] 一条命令就能启动前端和后端（Docker Compose），打开对话页可以用文字和真乃对话
- [x] 对话引擎是一个独立模块，输入为用户、角色、对话、输入文本，输出为日语原文和中文字幕
- [x] LLM 提供方先实现 OpenAI 兼容 Chat Completions 接口，地址、密钥、模型名都可以配置
- [x] 对话模型一次输出结构化结果（日语原文和中文字幕），流式解析后逐步推送到前端（ADR-0001）
- [x] 前端同时显示用户的输入、角色回复的日语原文和中文字幕
- [x] 对话记录（用户输入、日语原文、中文字幕）被持久化，重新打开对话页可以看到
- [x] 测试框架就绪：后端使用 pytest；假 LLM 能记录收到的提示词，并能按剧本返回结构化回复；至少有一个通过后端对外接口驱动的文字对话回合测试

## Comments

**实现完成（分支 `claude/vibrant-gauss-gz0etz`）**

- 后端 `backend/`（FastAPI + SQLite）：`ConversationEngine.turn(conversation, text)`，其中用户和角色取自对话本身。回复按「段」流式推送，每段是一句日语原文 + 它的中文字幕（`<ja>…</ja><zh>…</zh>`，见 `reply_format.py`）。对话记录同时保存整段的 `ja`/`zh` 和逐段的 `segments`，方便语音（04）按段对齐字幕。
- 一个回合只有在回复完整后才连同用户输入一起写入；失败的回合不留记录，前端把文字退回输入框并提示。
- 接口：`POST /api/conversations`、`GET /api/conversations?character_id=`、`GET /api/conversations/{id}/messages`、`POST /api/conversations/{id}/turns`（SSE）。
- 前端 `frontend/`（Next.js）：`/conversation/[characterId]`，`/api/*` 在运行时经路由转发到后端（环境变量 `BACKEND_URL`）。前端里的角色显示名是临时写死的，留给 03 改为读取角色列表。
- 测试：`cd backend && uv run pytest`（切入点 A + OpenAI 兼容适配器的录制流测试）。

