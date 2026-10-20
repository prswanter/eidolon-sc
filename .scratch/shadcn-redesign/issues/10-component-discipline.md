# 10: 新的组件纪律

Type: grilling
Blocked by: 09
Status: resolved

## Question

`AGENTS.md` 和 `frontend/AGENTS.md` 里 Astryx 那套写法规则（不写裸 `<div>`，一律用组件和 token，不硬编码颜色和像素值），在 shadcn 加 Tailwind v4 下要换成什么？具体要定：

- 布局能不能直接写 `<div>` 加 Tailwind 类，还是要抽出布局原语。参考：Astryx 盘点里有 300 多处布局和排版原语，见「Astryx 组件盘点与 shadcn 对应表」（`01-astryx-inventory.md`）。
- 颜色、间距、圆角是只用主题变量和 Tailwind 刻度，还是允许任意值（`[…]`）。
- `components/ui/` 下 shadcn 生成的源码能不能直接改，还是要在外面另包一层。
- 项目自己的共用件放在哪个目录，怎么命名。共用件会在第二波新建，见「实现波次的切分」（`09-wave-slicing.md`）。
- `cn` 的导入路径统一用哪一个；`cn` 合并不掉 `group-data-[…]` 变体，这个坑怎么写成规则（见「后台视觉原型」，`06-admin-style-prototype.md`）。

结论写进 `spec.md`；清理波据此改写两份 `AGENTS.md`。

## Answer

结论来自 2026-10-09 的 grilling。依据的事实：原型分支里布局都是 `<div>` 加 Tailwind 类，任意值用得很多（`text-[15px]`、`rounded-[22px]`、`bg-[var(--her-wall)]`，挂断红甚至写成 `bg-[#c8283c]`）；`DESIGN.md` 的 frontmatter 已列出字号、气泡圆角、头像等尺寸；`lib/utils.ts` 只是 `export { cn } from "cn"`；前端没有 ESLint，CI 只跑 `typecheck`、`npm test`、`theme:check`；`group-data-[…]` 这类带变体前缀的类，tailwind-merge 本来就不当作冲突，换掉 `cn` 包也合并不掉。

- **布局**：直接写 `<div>` 加 Tailwind 类，不自写 `Stack`/`Row` 这类布局原语。同样的结构在两屏以上出现，并且能用 `GLOSSARY.md` 或 `DESIGN.md` 里的词叫出名字，就抽成项目组件，例如页框、页首、区块卡、列表行。
- **颜色**：只用具名主题变量。`--her-*` 和挂断红这类固定色在 `@theme inline` 里注册成 Tailwind 颜色（`bg-her-wall`、`bg-hangup`）。任意值里一律不准出现颜色，`[var(--…)]`、hex、oklch 都不行。新增的固定色要写进对比度测试。
- **尺寸**：`DESIGN.md` frontmatter 里有名字的值（Header/Row/Body/Preview/Meta 字号、气泡圆角等）注册成 `@theme` token（如 `text-header`、`text-meta`、`rounded-bubble`），必须用 token。间距只用 Tailwind 刻度。任意值只用来写一次性的布局约束，比如 `max-w-[min(30rem,72vw)]`、`grid-cols-[…]`、`h-[80%]`，不准拿来写颜色、字号、圆角。
- **`components/ui/` 可以直接改**（Own-the-Source）。改过的地方加一行 `// eidolon: <原因>`。`shadcn add` 不准带 `--overwrite`，更新组件要先看 diff。
- **调用处不改外观**：调用处的 className 只用来定位和排布（margin、宽度、grid 位置）。外观要变，就到 `ui/` 组件里加 variant 或 prop，或者改掉那条带条件的类。禁止用 `!`（important）。`group-data-[…]` 盖不住的情况也照此处理。
- **目录和命名**：项目共用件放 `src/components/app/`，后台的放 `src/components/app/admin/`，文件名和旧版相同、用 PascalCase，新旧靠目录区分；清理波只删旧文件，不搬家、不改名。各屏自己的组件（`conversations/`、`admin/` 下）在所属那一波就地重写。`ui/` 沿用 shadcn 的 kebab-case 文件名。
- **`cn`** 一律从 `@/lib/utils` 导入。`shadcn add` 生成的 `from "cn"` 要当场改掉。
- **规则在哪里生效**：底座波在 `frontend/AGENTS.md` 加一节「shadcn 纪律（新代码）」，写上以上各条；根目录 `AGENTS.md` 的 Astryx 说明保留，加一句「只适用于还没迁移的屏」。清理波删掉两份 AGENTS.md 里的 Astryx 部分。`spec.md` 只引用这一节，不重复。
- **机器检查**：不装 ESLint。底座波在 CI 前端 job 加一个 grep 脚本，禁止三样：`from "cn"`（`lib/utils.ts` 除外）、任意值里的颜色（`-\[(#|oklch|rgb|hsl|var\(--)`）、`!` 前缀的 important 类。清理波把 `@astryxdesign` 加进同一个脚本，取代「测试替换与每波验收方式」里单独那步 grep。字号、圆角的任意值界线比较模糊，交给代码审查。

对「实现波次的切分」的补充：底座波多出「`frontend/AGENTS.md` 纪律一节」和「CI grep 脚本」两项；清理波改 AGENTS.md 的范围缩小为删除 Astryx 部分，`grep @astryxdesign` 并进同一个脚本。这两点由「写 spec.md 并切出实现 ticket」落实。没有新的术语，`GLOSSARY.md` 不变；这些规则都容易改回来，不开 ADR。
