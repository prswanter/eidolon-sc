#!/bin/sh
# wayfinder 地图（.scratch/<effort>/map.md）里票和地图对不对得上，CI 的 shellcheck job 跑它。
# 地图的票是 issues/ 下带 `Type:` 行的文件（docs/agents/issue-tracker.md「Wayfinding operations」）：
#
#   1. `Status: resolved` 的票要有 `## Answer`：先写结论再改状态，写结论那步失败时这里会报出来。
#   2. `Blocked by:` 里的每个票号都要有对应的票。
#   3. 已解决的票，挡住它的票也都已解决。
#   4. 已解决的票要在 map.md 里有链接（Decisions so far 或 Out of scope）。
#
#   sh scripts/check-scratch.sh [目录]      目录默认是 .scratch
#
# 退出码：0 没有问题；1 有问题（逐条列出票和原因）。
set -u

cd "$(dirname "$0")/.." || exit 1
root=${1:-.scratch}
failed=0

report() {
  printf '✗ %s：%s\n' "$1" "$2"
  failed=1
}

for map in "$root"/*/map.md; do
  [ -f "$map" ] || continue
  dir=$(dirname "$map")
  for ticket in "$dir"/issues/*.md; do
    [ -f "$ticket" ] || continue
    grep -q '^Type: ' "$ticket" || continue
    name=$(basename "$ticket")
    resolved=0
    grep -q '^Status: resolved' "$ticket" && resolved=1

    if [ "$resolved" = 1 ]; then
      grep -q '^## Answer' "$ticket" || report "$ticket" '标成 resolved 却没有 ## Answer'
      grep -qF "issues/$name" "$map" || report "$ticket" "已解决，但 $map 里没有链接到它"
    fi

    # `Blocked by: 01, 02` 里的票号；none、None 之类没有数字，自然跳过
    # shellcheck disable=SC2013 # 票号本来就是一个个词；改成 while read 的管道会在子 shell 里跑，report 设的 failed 带不出来
    for number in $(sed -n 's/^Blocked by: *//p' "$ticket" | grep -oE '[0-9]+'); do
      # 去掉前导零再补成两位：printf 会把 08、09 当成八进制
      padded=$(printf '%02d' "$(printf '%s' "$number" | sed 's/^0*//; s/^$/0/')")
      set -- "$dir"/issues/"$padded"-*.md
      if [ ! -f "$1" ]; then
        report "$ticket" "Blocked by 里的 $number 没有对应的票"
      elif [ "$resolved" = 1 ] && ! grep -q '^Status: resolved' "$1"; then
        report "$ticket" "已解决，但挡住它的 $(basename "$1") 还没解决"
      fi
    done
  done
done

exit "$failed"
