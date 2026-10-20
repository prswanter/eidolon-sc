#!/bin/sh
# shadcn 纪律里能机器检查的几条（frontend/AGENTS.md「shadcn 纪律」），CI 前端 job 跑它：
#
#   1. cn 一律从 @/lib/utils 导入：shadcn add 生成的 `from "cn"` 要当场改掉（lib/utils.ts 自己除外）。
#   2. Tailwind 任意值里不写颜色：`-[#…]`、`-[oklch(…)]`、`-[rgb(…)]`、`-[hsl(…)]`、`-[color-mix(…)]`、`-[var(--…)]` 都不行，
#      v4 的变量简写 `bg-(--x)`、`text-(--x)`、`border-(color:--x)` 这类颜色工具类也不行（尺寸的 `h-(--x)` 不管）；
#      颜色用 globals.css 里注册的具名 token（bg-her-wall、bg-hangup 等）。
#   3. 不用 important 类：`!mt-2`、`hover:!bg-x` 这种前缀写法，和 Tailwind v4 的 `mt-2!` 后缀写法。
#      外观要变就到 components/ui/ 里改组件。
#   4. 不再引入 Astryx：`@astryxdesign/*` 已经整个移除（.scratch/shadcn-redesign，ADR-0015）。
#
#   sh scripts/check-discipline.sh [目录]      目录默认是 src
#
# 退出码：0 没有违规；1 有违规（逐条列出文件和行号）。
set -u

cd "$(dirname "$0")/.." || exit 1
root=${1:-src}
failed=0

# 在 $root 下的源码里找 $2（扩展正则），有命中就打印 $1 和命中的行。$3 是要排除的文件（可选）。
check() {
  hits=$(grep -rnE --include='*.ts' --include='*.tsx' --include='*.mts' --include='*.css' -- "$2" "$root")
  if [ -n "${3:-}" ]; then
    hits=$(printf '%s\n' "$hits" | grep -vF "$3:")
  fi
  if [ -n "$hits" ]; then
    printf '%s\n%s\n\n' "$1" "$hits"
    failed=1
  fi
}

check '✗ cn 要从 @/lib/utils 导入，不要 from "cn"：' \
  "from ['\"]cn['\"]" "$root/lib/utils.ts"
check '✗ 任意值里不能写颜色，用具名 token：' \
  '-\[(#|oklch|rgb|hsl|color-mix|var\(--)|(^|[^a-z0-9-])(bg|text|border|ring|outline|fill|stroke|from|via|to|decoration|caret|accent|divide|placeholder|shadow)-\((--|color:)'
check '✗ 不能用 important 类（!mt-2、hover:!bg-x、mt-2!），到 components/ui/ 里改组件：' \
  "(^|[[:space:]\"'\`:])!-?[a-z][a-z0-9]*(-[a-z0-9.]+|:[a-z])|[a-z0-9]-[a-z0-9.]+!([[:space:]\"'\`]|$)"
check '✗ Astryx 已经移除，不要再引用 @astryxdesign：' \
  '@astryxdesign'

if [ "$failed" -eq 0 ]; then
  echo "shadcn 纪律检查通过"
fi
exit "$failed"
