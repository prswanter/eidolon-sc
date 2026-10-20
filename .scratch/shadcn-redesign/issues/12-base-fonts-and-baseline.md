# 12: 底座①：换字体，拍基准截图

**What to build:** 全站换上新字体：中文用 Noto Sans SC，她的日语台词用 LINE Seed JP（`next/font`，400/700）。页面结构和颜色都不动。同一个提交里新增截图脚本：参照 `stand-thumbnails.mts` 调用 Playwright Chromium 的写法，连本地真实后端和开发库，每页浅色、深色各拍一张，输出到被 gitignore 的目录。拍好的这套图就是后面底座提交和共用件提交的像素基准。这张 ticket 的提交里**只能有字体和截图脚本**，交付后停下来，请人确认字体效果。

属于第 1 波（底座），规格见 `../spec.md`「五个波次」「Testing Decisions」。

**Blocked by:** None (can start immediately)

**Status:** done

- [x] 中文界面用 Noto Sans SC，`<Ja>` 里的日语用 LINE Seed JP；构建时「没有 fallback 度量」的提示可以忽略
- [x] 截图脚本能对不依赖实时数据的页面（登录、法务、后台各页的静态部分）拍浅色、深色两套图，输出目录已加入 gitignore；通话层不进脚本
- [x] 基准图已经拍好，存放位置写进交付说明
- [x] 验收清单第 1 行：人工确认字体效果（agent 列出要看的页面，交给用户逐页看）
- [x] `typecheck`、`test` 通过，`next build` 成功
- [x] 开工前已把 main 合进 `feat/shadcn-redesign`，冲突在分支里解决

## Comments

2026-10-09 交付（提交 119ee39）：
- 中文原本就是全站 Noto Sans SC；`<Ja>` 的 `--font-ja` 从 M PLUS 1p 换成 LINE Seed JP（400/700），浏览器里确认渲染的是 `LINESeedJP-Regular`。
- 截图脚本 `frontend/scripts/screenshots.mts`（`npm run screenshots -- --user <管理者名字>`）：11 页 × 电脑/手机 × 浅色/深色共 44 张，输出到 gitignore 的 `frontend/screenshots/<名字>/`。为了逐像素可比：Chromium 关 GPU 和分块光栅化、浏览器时间固定、等字体和图片解码完再拍；用户详情拍「不是登录者」的那位。
- 基准图在 `frontend/screenshots/baseline/`。唯一不稳定的是后台用户列表（电脑宽度）里登录者自己「最近活动」那一格，是真实数据。
- 用户确认字体效果（验收清单第 1 行）。换衣装面板的衣装名要 500 字重，LINE Seed JP 没有，显示成 400。
