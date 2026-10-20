# 02: 调研：NovelAI 中转的常见协议

Type: research
Status: resolved
Blocked by: none

## Question

国内外常见的 NovelAI 中转（代理转售、聚合 API 平台）对外提供哪几种接法，各自什么样：

- 原样转发 NovelAI 官方接口：只换 base URL 和 key，路径、请求体、返回（zip）都不变？
- OpenAI images 兼容（`/v1/images/generations`）：模型名怎么写，NovelAI 特有的参数（负面词、多角色描述、尺寸、步数、种子）怎么塞，返回 `b64_json` 还是 `url`？
- OpenAI chat 兼容（`/v1/chat/completions`，图片以 markdown 链接或 base64 出现在回复里）？
- 其他常见形态（异步任务 + 轮询等）。
- 鉴权方式（Bearer、自定义头）、错误和限流怎么表现。
- 哪几种最普遍，我们支持哪几种就能覆盖绝大多数中转；中转常见的坑（返回的是临时 URL、会过期，参数被静默忽略等）。

结论写成 `.scratch/photos/research/relays.md`，每条附出处（平台文档链接）；只凭个别帖子的说法要注明。

## Answer

全文在 `research/novelai-relays` 分支（提交 `04c5a4e`）的 `.scratch/photos/research/relays.md`，每条附出处。要点：

- 常见形态四种：A 原样转发官方 `/ai/generate-image`（请求体同官方，回 ZIP；带 `Accept: application/json` 时官方回 201 + base64 JSON）；B OpenAI images 兼容 `/v1/images/generations`（`b64_json` 或 `url`）；C OpenAI chat 兼容（图片以 Markdown 链接、URL 或 data URI 出现在回复里）；D 各家自定义（异步任务 + 轮询、GET 直链）。同一个中转常常几种都开。
- 推断：支持 A 和 B 就能覆盖绝大多数中转，A 顺带覆盖官方接入点；C 只能送提示词，D 要逐家适配。拍板留给「后台配置和自带密钥」。
- B 形态里 NovelAI 特有参数（负面词、步数、种子）怎么塞没有统一做法（顶层、`parameters`、`extra_fields` 都有），模型名也不统一，只能让配置的人填；返回要宽进（`b64_json`、`url`、data URI，甚至 chat 形状）。
- 常见坑：参数被静默忽略或截断（步数上限 28、尺寸只认几档），所以负面词不一定生效，这点关系到「全年龄怎么守」；返回 URL 要在服务端立刻下载保存；HTTP 200 也可能是「服务器繁忙」的错误图或缓存里的同一张图。
- 慢且排队：官方每个账号同时只跑一个生成，中转普遍排队，客户端超时设在 180–600 秒；超时不要自动重试（上游可能还在生成、照样扣费），只对 408/429/5xx 退避重试。这些进「失败、限额和计费」。
- 官方接口说明里写着生成请求必须由人的操作发起，留给条款调研（「NovelAI 官方图像 API 现状」）一并看。
- 文件末尾「未确认 / 需要实测的」列了拿用户的中转要验的几项（`/v1/models`、A 和 B 各一次、同种子出两次看负面词/尺寸/种子是否生效），并进「准备测试用的中转地址和 key」的探测。
