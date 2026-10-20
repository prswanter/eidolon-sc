# 01: 调研：NovelAI 官方图像 API 现状

Type: research
Status: resolved
Blocked by: none

## Question

以 NovelAI 官方文档和官方发布为准（2026-10），把接图像 API 要知道的事实查清：

- 现在有哪些图像模型（V4.5 Full / Curated 之后有没有更新的），各自的模型标识、适合什么、默认参数；哪些已经下线或不推荐。
- 接入点和鉴权：生成图像的 URL、请求方法、`Authorization` 怎么带（持久 API token 怎么拿），请求体的完整结构，特别是 V4 系列的 `v4_prompt` / `v4_negative_prompt`、多角色描述（char captions）、角色参考图（character reference）、vibe transfer、质量标签和 UC 预设、尺寸、步数、采样器、种子。
- 返回格式（zip 里的 PNG？流式？），错误码和限流的样子。
- 费用：Opus 档免费生成的确切条件（尺寸、步数、张数），超出时扣多少 Anlas；查余额的接口。
- 并发：一个账号能不能同时跑几张，排队还是直接报错。
- 内容：官方有没有内容过滤或安全开关；全年龄要靠我们自己守的话，官方推荐怎么写负面词。
- 条款：Terms of Service 是否允许把一个订阅（或它的 API token）用在面向公众的服务、让多个用户共用；用户自带自己的 token 有没有问题。
- 库：官方有没有 SDK；社区常用的库（例如 Python 的 novelai-python、novelai-api）维护状况如何，值不值得引入，还是直接发 HTTP。
- 模型对《偶像大师 闪耀色彩》角色的认识：官方有没有说明训练数据里的角色 tag 怎么用（danbooru 角色名 tag 的写法）。

结论写成 `.scratch/photos/research/novelai-api.md`，每条事实附出处链接；查不到的明说查不到。

## Answer

全文在 `research/novelai-api` 分支（提交 `0d56ca9`）的 `.scratch/photos/research/novelai-api.md`，出处是官方文档、博客、两个接入点的接口规格、服务条款和 2026-10-17 的官方网页客户端代码。要点：

- **模型**：最新是 V5（2026-08-21），`nai-diffusion-5-curated`、`nai-diffusion-5-full`、`nai-diffusion-5-full-medium`（模型名出自官方客户端，文档没写）；V4.5、V4、V3 没下线。
- **接口**：`POST https://image.novelai.net/ai/generate-image`，`Authorization: Bearer pst-…`（用户在 novelai.net 设置里生成的持久 token）；请求体 `{input, model, action, parameters}`，提示词在 `v4_prompt` / `v4_negative_prompt`，单角色写 `char_captions[]`；返回 zip（png 或 webp）。V5 默认 832×1216、23 步、scale 7、`k_euler_ancestral`。
- **V5 没有角色参考图和 Vibe Transfer**，只有 V4.5 有；V5 稳外貌只能靠角色 tag 加外貌 tag。`sakuragi mano`、`idolmaster shiny colors` 这类 tag 在 V5 和 V4.5 都是已知 tag，像不像要实测。
- **费用**：Opus 免费要 ≤1024×1024 像素、≤28 步、不用角色参考图、一次 1 张；V5 另扣「Opus 用量条」（满条约 1730 张，每天回 11%–14%），扣成负数后改扣 Anlas；V4.5 及以前仍不限张。付费时 832×1216、23 步 V5 每张 26 Anlas（约 0.036 美元），V4.5 每张 17 Anlas，角色参考图每张再加 5。
- **并发**：官方无数字，按一个 token 同时只跑一张设计，我们这边排队；并发时社区报 429。
- **条款**：服务条款 5.3.1、5.3.2、5.3.5、8.1、9.1.2、9.1.3 禁止把一个订阅给公众共用，除非另签书面协议，查不到公开的商用渠道。用户自带自己的 token 是官方 API 文档写明的用法，条件是每次生成由人发起、不自动刷量、token 主人年满 18 岁。→ 定图时的「谁出钱」要重议，新开「拍板：条款之下谁出钱」。
- **内容**：官方服务端没有内容过滤和安全开关；Curated 更不容易出敏感图，官方网页用 Full 时自动在负面最前加 `nsfw`。全年龄全靠我们自己守：建议 V5 Curated、正面加 `rating:general`、负面 `nsfw` 加官方预设、越界请求在写提示词之前就拒掉。生成的图在元数据里带着提示词，转码能去掉。
- **库**：没有官方 SDK；`novelai-python` 主线没有 V5、作者不再积极维护，`novelai-api` 停在 2025-06。建议直接用 httpx 发 JSON。
- **没核实的**（等测试接入点）：V5 纯 JSON 请求能不能成功（官方网页发 multipart）、429 的格式和限速数值、官方全年龄负面词写法、中转和官方的差异。
