# 03: 准备测试用的中转地址和 key

Type: task
Status: resolved
Blocked by: none

## Question

原型「外貌一致性」要真生成图片来看，需要能调用的接入点。用户手上有一个中转（地址和 key），没有官方订阅。

要用户做（HITL）：

1. 在仓库根目录建 `.env.novelai`（`.gitignore` 的 `.env.*` 会挡住它，不会进仓库），写：
   ```
   NOVELAI_RELAY_URL=<中转给的地址>
   NOVELAI_RELAY_KEY=<中转给的 key>
   ```
2. 如果中转给了文档或说明（支持哪些模型、哪种协议），把链接或原文贴进本票 `## Comments`。

然后代理（AFK）用一个最小请求探一下这个中转：是哪种协议（对照「NovelAI 中转的常见协议」）、支持哪些模型、返回什么格式、一张图多久；再按那份调研末尾「未确认 / 需要实测的」验一遍：`/v1/models`、原样转发和 OpenAI images 两种各发一次、同一个种子出两次，看负面词、尺寸、种子到底生不生效。结果写进 `## Answer`，key 不写进任何文件。

## Answer

2026-10-17 用户在仓库根目录的 `.env.novelai` 里填了 `NOVELAI_RELAY_URL` 和 `NOVELAI_RELAY_KEY`，key 没写进别的任何文件。中转是 `https://v2.ninijoker-api.com`，没有给文档。首页只有额度查询、发卡商店和售后入口；`/docs`、`/openapi.json`、`/api/status` 都返回 404（FastAPI 风格的 `{"detail":"Not Found"}`），说明它**不是 New API**。探测脚本和生成的图都放在仓库外的 `E:/tmp/nai-probe/`（脚本 `probe.py`，图在 `out/`）。

**协议**：A（原样转发官方接口）和 B（OpenAI images 兼容）都开着，路径直接挂在根上：`{base}/ai/generate-image` 和 `{base}/v1/images/generations`。用 Bearer 鉴权。

**模型**：`GET /v1/models` 返回 200，列出 `nai-diffusion-5-full`、`nai-diffusion-5-full-medium`、`nai-diffusion-5-curated`、`nai-diffusion-4-5-full`、`nai-diffusion-4-5-curated`、`nai-diffusion-4-full`、`nai-diffusion-4-curated-preview`、`nai-diffusion-3`、`nai-diffusion-furry-3`。其中 `-medium` 是官方文档没提过的名字。另外，A 形态模型名填错时，报错里给的可用模型清单和 `/v1/models` 不完全一样：它写的是 `nai-diffusion-4-curated`，不是 `-preview`，也没有列 `nai-diffusion-3`。

**A 形态**（请求体照官方 V5 的写法：`params_version: 3`，带 `v4_prompt`/`v4_negative_prompt`）：
- 返回 HTTP 200，`Content-Type: binary/octet-stream`，内容是 ZIP，里面一张 `image_0.png`。带 `Accept: application/json` 也照样回 ZIP，**不支持官方的 JSON 返回**。
- PNG 带 NovelAI 原生的元数据：`Software: NovelAI`、`Source: NovelAI Diffusion V5 0ADF9AB7`，`Comment` 里是完整参数。可以靠它核对参数到底有没有生效。
- 参数**全部生效**：同一个种子出两次，画面逐像素一致（文件 sha 不同，是因为元数据块不同）；同种子只改负面词（加了 `smile, wooden ceiling, chair`），99% 的像素变了，木天花板和椅子确实消失了；尺寸 1024×1024 和步数 28 都照请求出。
- 一张 832×1216、23 步的图，单发 7.5–8.3 秒。同时发 3 张全部 200，各用 13–16 秒，**没有 429**，说明中转背后不止一个账号在排。

**B 形态**：
- 返回 HTTP 200 `application/json` `{"created", "data":[{"b64_json"}]}`。`b64_json` 是不带 `data:` 前缀的裸 base64，解出来同样是带 NovelAI 元数据的 PNG。单张 4.9–8.9 秒。
- **只认顶层的 `negative_prompt` 和 `size`**（832x1216、1024x1024 都照出）。`seed` 被换成随机数，`steps` 固定成 28，所以同一个种子没法复现。
- 把参数嵌进 `parameters` 对象或放进 `extra_fields`，负面词都被忽略，换成中转自己的默认负面词（`lowres, bad anatomy, bad hands, missing fingers, extra digit, fewer digits, worst quality, jpeg artifacts`）。不会报错，**静默忽略**，印证了「NovelAI 中转的常见协议」里说的坑。

**错误**：
- key 错误：A 回 403 `{"error":"<中文提示>"}`，B 回 401 OpenAI 形状 `{"error":{"message","type":"invalid_request_error"}}`，都在 1 秒内返回。
- 模型名错误：A 回 400，`error` 里列出可用模型；**B 过了 60 秒还没返回**，客户端超时断开。不知道它是在排队、在用别的模型偷偷生成，还是卡死了，也不知道扣没扣额度。
- 这次没撞上「200 但其实是错误图」的情况。

**这次没验的**：参考图（V4.5 的角色参考 / director reference）中转支不支持，留给「原型：外貌一致性」去试；图片 URL 的有效期（这个中转两种形态都直接回图片数据，没有 URL，用不上）。
