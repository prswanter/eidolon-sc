#!/bin/sh
# 立绘素材的完整同步：拉取 → 整理衣装清单 → 渲染缩略图 → 上传到本机 MinIO。
#
# 上游的 deploy/stand-sync.sh 是给「uv + 宿主机」准备的；这台机器用 docker 跑后端、
# 素材也放在容器挂载的 corpus/stand 里，所以把四步换成容器版，效果一样。
#
#   sh scripts/stand-sync-local.sh            四步全跑
#   sh scripts/stand-sync-local.sh fetch      只跑第一步（拉取，最慢，可以反复中断重跑）
#   sh scripts/stand-sync-local.sh outfits     只整理衣装清单
#   sh scripts/stand-sync-local.sh thumbnails  只渲染缩略图
#   sh scripts/stand-sync-local.sh upload      只上传
#
# 前提：minio 容器在跑（docker compose up -d minio），.env 里 EIDOLON_STAND_* 已填。
# 缩略图那步要宿主机的 Node ≥ 22.18 + frontend/node_modules + Playwright 的 Chromium：
#   cd frontend && npm ci && npx playwright install chromium
#
# 退出码：0 全成功；非 0 有一步失败（详细原因看输出）。
set -u

cd "$(dirname "$0")/.." || exit 1

step=${1:-all}
status=0

run_fetch() {
  echo "=== 1/4 拉取立绘（第一次要几小时，可反复中断重跑，已有文件不重下）==="
  # 源站 cf-static.shinycolors.moe 会间歇性断连（实测拉了一千多套后掉线）。
  # 每次断了就自动重跑，已下载的会跳过，所以重跑很便宜。默认最多补 5 轮。
  tries=${STAND_FETCH_TRIES:-5}
  i=1
  while [ "$i" -le "$tries" ]; do
    if [ "$i" -gt 1 ]; then
      echo "--- 第 $i 轮补拉（上一次断在源站，已下载的会跳过）---"
      sleep 10
    fi
    out=$(docker compose run --rm --no-deps backend eidolon stand fetch 2>&1)
    rc=$?
    echo "$out" | tail -6
    # 上游在源站断连时打印「没能从 ShinyColorsDB 拉取完新卡」，退出码未必非 0，
    # 所以按输出判断，不能只看 $rc。
    if echo "$out" | grep -q "没能从 ShinyColorsDB 拉取完"; then
      echo "源站中断，准备重试（$i/$tries）"
      i=$((i + 1))
      continue
    fi
    [ "$rc" -ne 0 ] && status=1
    return
  done
  echo "补拉 $tries 轮仍未拉完。已下载的都保留，稍后再跑一次本脚本的 fetch 即可续上。" >&2
  status=1
}

run_outfits() {
  echo "=== 2/4 整理衣装清单 ==="
  docker compose run --rm --no-deps backend eidolon stand outfits || status=1
}

run_thumbnails() {
  echo "=== 3/4 渲染缩略图（无界面 Chromium，每套一张）==="
  ( cd frontend && npm run stand:thumbnails ) || {
    echo "缩略图渲染失败：检查 frontend/node_modules 和 npx playwright install chromium" >&2
    status=1
  }
}

run_upload() {
  echo "=== 4/4 上传到 MinIO ==="
  docker compose run --rm --no-deps backend eidolon stand upload || status=1
}

case "$step" in
all)
  run_fetch
  run_outfits
  run_thumbnails
  run_upload
  ;;
fetch) run_fetch ;;
outfits) run_outfits ;;
thumbnails) run_thumbnails ;;
upload) run_upload ;;
*)
  echo "用法：sh scripts/stand-sync-local.sh [fetch|outfits|thumbnails|upload]" >&2
  exit 1
  ;;
esac

if [ "$status" -eq 0 ]; then
  echo
  echo "完成。浏览器从这里读立绘：$(sed -n 's/^EIDOLON_STAND_ASSETS_URL=//p' .env)"
fi

exit "$status"
