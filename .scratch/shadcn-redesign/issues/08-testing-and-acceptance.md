# 08: 测试替换与每波验收方式

Type: grilling
Blocked by: 04
Status: resolved

## Question

现有 vitest 测试里依赖 Astryx 的部分（例如 `notebookTheme.test.ts`，以及 CI 里检查 `theme:build` 有没有重新运行的步骤）要删除、改写，还是换成针对 shadcn 主题变量和印象色注入的新测试？「迁移策略」（`04-migration-strategy.md`）定了两件事：每波结束时应用要能 build 并且能人工逐页验收，底座波的验收标准是旧页面没被污染。在此基础上，每波的验收是只靠人工逐页看，还是加截图对比（Playwright 截图，按浅色、深色两种模式）？截图对比的话，基准图从哪里来，算不算实现 ticket 的完成条件？

## Answer

结论来自 2026-10-09 的 grilling。依据的事实：前端 30 个 vitest 文件里只有 `src/theme/notebookTheme.test.ts`、`src/theme/herVars.test.ts` 两个和 Astryx 有关，其余都是 `lib/` 里的逻辑测试；CI 前端 job 依次跑 `typecheck`、`npm test`、`theme:check`；`playwright` 已经是依赖，但只有 `scripts/stand-thumbnails.mts` 在用，仓库里没有 E2E 或截图测试。

- **单元测试分波替换。** 底座波新增主题对比度测试（测 `DESIGN.md` 列的几组：`--muted-foreground` 在 `--background` 和 `--muted` 上 ≥ 4.5，`--destructive` 上的白字 ≥ 4.5，深色浮层边线 ≥ 3），并在 `herVars.test.ts` 加上 `--primary`/`--ring` 的断言。旧断言（`--color-accent`、`--her-note` 等）先保留，作为「旧页面没被污染」的证据；哪个旧变量在某一波之后没人用了，就在那一波删掉它的断言。最后一波删掉 `notebookTheme.test.ts` 和剩下的旧断言。
- **CI。** `theme:check` 一直保留到最后一波，然后和 `theme:build`/`theme:check` 两个 npm 脚本、`src/theme/built/` 一起删掉，不换新的同类检查（shadcn 组件源码就是我们自己的代码，没有产物过期的问题）。最后一波在 CI 前端 job 里加一步：`grep -r @astryxdesign src` 结果必须为零。这一步加早了，分支上的 CI 会一直是红的。
- **截图只做存档，不做回归。** 新增一个 Playwright 截图脚本，参照 `stand-thumbnails.mts` 调用 Chromium 的写法，连本地真实后端和开发库（不造 mock），每页拍浅色、深色两张，输出到被 gitignore 的目录。截图供人工翻看和附在 PR 里，不做自动比对，也不算 ticket 的完成条件。通话层等依赖实时状态的页面不进脚本，只放在人工清单里。这样做的原因：除底座波外，每一波本来就是要改外观，基准图会一直重拍，起不到回归检测的作用。
- **底座波的污染检测用像素比对。** 字体（LINE Seed JP、Noto Sans SC）在底座波全局换上，字体变化不算污染。底座波的**第一个提交只换字体**，在这个提交上拍基准图，由人工确认字体效果；之后每个底座提交（Tailwind、`shadcn init`、共存层、base 层重置、印象色注入）都和这套基准做像素比对，要求零差异。比对范围限于不依赖实时数据的页面：登录、法务、后台各页的静态部分。
- **人工验收清单写进 `spec.md`。** 固定一张清单，按「页面 × 浅色/深色 × 关键状态」逐行列出；由「实现波次的切分」把各行分到具体波次。
- **实现 ticket 的完成条件。** `typecheck` 和 `test` 都通过，`next build` 成功，分到这一波的清单行由人工验收通过（agent 列出清单交给用户逐项看）。
