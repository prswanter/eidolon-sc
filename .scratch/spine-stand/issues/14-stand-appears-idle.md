# 14: 她出现在通话层上（待机）

**What to build:** 部署者给角色配好偶像编号、默认衣装和素材地址后，用户打电话时，通话层的背景图上就叠了一层穿默认衣装的立绘，只做待机的呼吸和眨眼。手机上是「大立绘」，电脑上是「半身 ADV」。素材加载不到、浏览器不支持 WebGL 时，退回现在的背景图，通话不受影响。规则和定义见 `../spec.md`（「渲染」「通话层」「配置与 API」「许可证与文档」几节）。

参考：原型在分支 `prototype/spine-stand`（立绘引擎、`CallLayer` 的 `stand` 插槽、`/prototype/stand` 页面），真机测量版在 `prototype/spine-stand-perf`（两个分支都已于 2026-10-01 删除）。原型是一次性代码，要按 spec 重写，不要直接合并。

**Blocked by:** None (can start immediately)

**Status:** resolved

- [x] **配置**：`characters.toml` 每位角色新增两个可选字段，偶像编号（`spine_manifest.json` 的 `idolId`）和默认衣装（能定位到一套衣装的写法，例如 `stand/<enzaId>`，由你定，写进部署文档）。格式不对时启动报错，照现有字段的校验方式做。
- [x] **素材地址**：新增一个后端环境变量，填立绘素材的公开访问地址。`/api/characters` 每位角色多一个 `stand` 字段：偶像编号、默认衣装、素材地址三项都配好时，给出默认衣装的素材 URL（后续 18 会加衣装清单的 URL），否则为 `null`。前端 `Character` 类型同步修改。
- [x] **runtime**：官方 spine-ts 3.6 的 `spine-webgl.js` 原样放进单独的 vendor 目录，附上它自己的 LICENSE，和一份记录来源、版本、校验和的 README。在 `.gitattributes` 里把这个目录标成 `-text`。在客户端用 `<script>` 加载，通过 `window.spine` 调用（ADR-0009）。
- [x] **许可证**：项目许可证加一条 AGPL 第 7 节的附加许可，允许本项目和 Esoteric Software 的 Spine Runtimes 组合在一起、一起分发；README 声明 vendor 目录不受 AGPL 约束。
- [x] **立绘引擎**（一个不依赖 React 的类）：载入一套衣装，每帧推进并绘制。这一张只播待机，身体 `wait`、表情 `face_wait`。必须做到：
  - 绕开剪裁 bug：每帧把剪裁的结束插槽改成范围内最后一个真的会画出来的插槽；范围内什么都不画时，这一帧摘掉剪裁附件。
  - 预乘 alpha：上传贴图前开启 `UNPACK_PREMULTIPLY_ALPHA_WEBGL`，绘制时 `premultipliedAlpha = true`。
  - 上下文恢复：重设预乘 alpha 的监听要在创建 `ManagedWebGLRenderingContext` 之前注册。恢复不了的，退回背景图。
  - 销毁时不调用 `loseContext()`，因为 React 开发模式下 effect 会执行两次。
  - 像素比取 `min(devicePixelRatio, 2)`；最多 60 帧，刷新率更高的屏幕上跳过多余的帧。
  - 收起通话层时暂停渲染，展开时接着画。
- [x] **通话层**：角色有 `stand` 时，一打电话就用立绘版布局，中途不切换，加载失败时也保持：
  - **手机「大立绘」**：立绘从底部升起，贴着头顶、到膝；名字、计时和字幕在上方；底部压一层她颜色的深色渐变，保证按钮看得清。
  - **电脑「半身 ADV」**：立绘铺满通话层，贴着头顶、到腰，宽度不窄于身体的约 70%；名字、计时和字幕放在底部一个半透明的对话框里，底部同样压一层深色渐变。
  - 立绘叠在背景图和纱上面。加载中只显示背景图和纱，不放转圈，也不放占位剪影；到了用 0.3 秒淡入。
  - 减少动态效果时，手机上的升起入场改成原地淡入。
  - runtime 或素材加载不到、浏览器不支持 WebGL 时，保持立绘版布局，只显示背景图，不提示用户。
  - 角色没有 `stand` 时，和现在完全一样。
- [x] 遵守 AGENTS.md 的 Astryx 规则：用组件布局，数值都用 token。
- [x] **DESIGN.md**：改写「Call layer」一节，写入立绘版的两种布局、渐变和对话框。
- [x] **开发时怎么看效果**：在开发文档或 `.env.example` 里写明，用一个开了 CORS 的本地静态服务器直接提供镜像的 `assets` 目录，把素材地址指过去。
- [x] **测试**：配置解析测试（新字段可选、格式错误时报错）；API 测试（三项齐全时 `stand` 才有值）。
- [x] **人工验证**：真乃和恋钟各打一次电话，手机和电脑两种宽度下构图都正确；在 Comments 里附截图说明。「花風Smiley」这套衣装的眼睛、睫毛、眉毛完整（剪裁 bug 已绕开）。把素材地址改成错的，退回背景图，通话照常。
- [x] `uv run pytest`、`uv run pyright`、`npm test`、`npm run typecheck` 全部通过。

## Comments

**实现记录（2026-10-01，agent）**

- **配置**：`characters.toml` 新增 `idol_id`（正整数，`spine_manifest.json` 的 `idolId`）和 `default_outfit`（写成 `stand/<enzaId>` 或 `stand_costume/<enzaId>`，enzaId 十位数字）。两项各自可选；格式不对时启动报错并指出角色和字段（`idol_id = true`、`"1"`、`0` 都算错）。仓库里真乃配 `1` + `stand/1030010010`（ナチュラルモード），恋钟配 `4` + `stand/1030040010`（ばってん長崎恋岬）。
- **素材地址**：新环境变量 `EIDOLON_STAND_ASSETS_URL`（去掉末尾的 `/`；不是 http(s) 开头时启动报错）。存储桶结构和镜像的 `assets` 目录一样：`<地址>/spine/idols/<stand|stand_costume>/<enzaId>/data.{json,atlas,png}`，这样开发时直接用 CORS 静态服务器提供镜像目录就行，18 的同步脚本也按这个结构上传。
- **API**：`/api/characters` 每位角色多一个 `stand`，偶像编号、默认衣装、素材地址三项齐全时是 `{"default_outfit": {"id": "stand/1030010010", "url": "<地址>/spine/idols/stand/1030010010/"}}`（`url` 是以 `/` 结尾的目录），否则 `null`。18 在 `stand` 里加衣装清单的 URL。前端 `Character.stand: Stand | null`，`Stand`、`Outfit` 类型在 `frontend/src/lib/api.ts`。
- **runtime**：`frontend/public/vendor/spine-3.6/`，`spine-webgl.js` 和 `LICENSE` 是从 spine-runtimes 的 `3.6` 分支（`654c20e5`）重新下载的原文件，SHA-256 与调研时记下的、原型分支里的一致；README 记来源、版本、校验和。`.gitattributes` 把目录标成 `-text`，提交后校验和不变。`stand/spineRuntime.ts` 用 `<script>` 加载（只插一次，失败后下次再试），并给用到的那部分 3.6 API 写了类型。
- **许可证**：`LICENSE` 开头加 AGPL 第 7 节附加许可（允许与 Spine Runtimes 组合、一起分发）和 vendor 目录不受 AGPL 约束的声明；三种语言的 README 在「许可证」一节说明 vendor 目录，在「角色」一节说明两个新字段。
- **立绘引擎**：`frontend/src/components/conversations/stand/StandEngine.ts`，不依赖 React。公开的只有 `constructor(canvas, spine, framing)`（不支持 WebGL 时抛 `StandUnavailable`）、`framing` 属性（`"knees"` 手机到膝、`"waist"` 电脑到腰）、`load(outfit)`、`setPaused(paused)`、`dispose()`。内部用 `play(track, name, loop)` 设轨道，待机只放 0 号 `wait` 和 1 号 `face_wait`；15 在这里加「按选动画结果设置各轨道」，19 在 `load` 里加释放上一套素材。剪裁绕法照原型改写：见到的剪裁按附件记下原本的结束插槽，每帧改成范围内最后一个会画出来的插槽，范围里什么都不画时这一帧摘掉剪裁附件；动画给这个插槽换了别的附件就不再管。预乘 alpha、上下文恢复的监听先于 `ManagedWebGLRenderingContext` 注册、销毁不调 `loseContext()`、像素比 `min(dpr, 2)`、最多 60 帧（`lib/standFrames.ts` 的 `FrameGate`，有测试）、收起时暂停、上下文丢失期间停掉绘制循环。上下文恢复不了时画布一直是空的，看到的就是背景图和纱。
- **通话层**：`CallLayer` 在角色有 `stand` 时用立绘版布局（手机「大立绘」、电脑「半身 ADV」），`stand/Stand.tsx` 负责画布、淡入（0.3 秒，`--duration-medium-min`）和手机上的升起（减少动态效果时只淡入）；失败时去掉画布，布局不变。每拨一次电话重新挂载立绘，上一通失败了这一通再试。
- **测试**：`backend/tests/test_characters.py` 加了新字段可选、格式错误报错、三项齐全才有 `stand`、环境变量解析的测试；`frontend/src/lib/standFrames.test.ts` 测帧率和像素比上限。
- **本地看了一眼**（临时页面挂真正的 `CallLayer` + CORS 静态服务器 + Playwright，页面没有提交）：手机宽度下「花風Smiley」（`stand/1040010060`）眼睛、睫毛、眉毛完整；电脑宽度下恋钟的半身 ADV 构图正常；素材地址改错后画布去掉、只剩背景；用 `WEBGL_lose_context` 模拟丢失再恢复后颜色正常、没有白边；收起再展开接着画。
- **全量**：`uv run pytest` 785 passed，`uv run pyright` 0 errors，`npm test` 247 passed，`npm run typecheck` 通过。第一次跑全量时 `test_voice_interruption.py` 有一条偶发失败（时序相关，和这次改动无关），单独跑和再跑全量都通过；另有一次全量运行卡住超过 10 分钟（当时另一个 agent 也在同一台机器上跑测试），停掉重跑 86 秒全部通过。

**留给人工验证**：真乃和恋钟各打一次真电话，手机和电脑两种宽度下看构图并附截图；把 `EIDOLON_STAND_ASSETS_URL` 改错后打电话，确认退回背景图、通话照常；另外建议目测对话框和手机上方的字在立绘上是否清楚（DESIGN.md「Call layer」的对比度一条）。

### 2026-10-01 人工验收（用户）

在本地开发环境里验收，素材由 CORS 静态服务器直接提供镜像的 `assets` 目录（`EIDOLON_STAND_ASSETS_URL=http://localhost:8765`）。两位角色都没配背景图，所以「退回背景图」看到的是印象色渐变。全部通过：

- 真乃和恋钟各打了电话，手机和电脑两种宽度下构图正确：手机「大立绘」从底部升起、字幕在上方、底部渐变上的按钮看得清；电脑「半身 ADV」铺满、字幕在底部对话框里。待机呼吸、眨眼正常，加载中只露底色，立绘到了淡入。立绘上和对话框里的文字清楚。
- 把真乃的 `default_outfit` 临时改成「花風Smiley」（`stand/1040010060`），衣装正确换上，眼睛、睫毛、眉毛完整；验完已改回。
- 把素材地址改成没有服务的端口：立绘加载不到，保持立绘版布局、只显示底色，没有转圈和报错，通话照常进行。
- 开「减少动态效果」：手机上立绘原地淡入，不从底部升起。
- 通话中收起通话层再展开，立绘接着动。
- **没有附截图**：截图里全是原作立绘，按 ADR-0003 的 2026-09-30 修订（立绘不进仓库）不放进 `.scratch/`，以这份文字记录代替。
