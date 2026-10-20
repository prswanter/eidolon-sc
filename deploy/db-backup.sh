#!/bin/sh
# 备份数据库：在后端容器里运行 `eidolon backup`，把整个数据库导出、检查完整性、压缩，用 age 公钥加密后
# 上传到私有的 S3 兼容存储桶，再删掉过了保留期（EIDOLON_BACKUP_KEEP_DAYS，默认 30 天）的备份
# （最新的一份总是保留，ADR-0012）。由主机上的 cron 每天运行一次，手动备份也是执行它；
# 配置和安装方法见 docs/deploy.md 的「备份」。
#
# 用法：deploy/db-backup.sh [--cron]
#   --cron  cron 那一行要带上它，备份记录和看板上记为「每天的 cron」；不带时记为「服务器上手动运行」
#
# 同一时间只有一次备份：撞上正在进行的（cron、手动或后台按钮发起的）就放弃，退出码 6。
# 锁在数据库里，由 `eidolon backup` 判断，主机上不用 flock。
#
# 输出追加到仓库根目录的 logs/db-backup.log（可用 EIDOLON_BACKUP_LOG 改到别处）。
# 默认用 docker-compose.prod.yml；设置了 COMPOSE_FILE 时用它指定的配置。
#
# 退出码（含义也写在每次备份的最后一行日志里）：
#   0  完全成功
#   1  配置不全：缺存储桶的设置或 age 公钥，没有备份
#   2  导出数据库或完整性检查失败，没有上传；过期的备份照常删除
#   3  上传失败；过期的备份照常删除，最新的一份保留
#   4  备份已上传，但没能删掉过期的备份，下次备份再删
#   5  后端容器没有运行，或无法运行备份命令（包括参数不对）
#   6  上一次备份还没结束（可能是后台按钮发起的），这次没有运行

set -u

root=$(cd "$(dirname "$0")/.." && pwd)
cd "$root" || exit 5
PATH=/usr/local/bin:/usr/bin:/bin:$PATH # cron 的 PATH 很短
export COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.prod.yml}"
log=${EIDOLON_BACKUP_LOG:-$root/logs/db-backup.log}
mkdir -p "$root/logs" "$(dirname "$log")"
exec >>"$log" 2>&1

say() {
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*"
}

finish() {
  case $1 in
    0) meaning="完全成功" ;;
    1) meaning="配置不全，没有备份，见上方的错误" ;;
    2) meaning="导出数据库或完整性检查失败，没有上传" ;;
    3) meaning="上传失败，这次没有备份；最新的一份旧备份保留" ;;
    4) meaning="备份已上传，但没能删掉过期的备份，下次备份再删" ;;
    5) meaning="后端容器没有运行，或无法运行备份命令" ;;
    6) meaning="上一次备份还没结束，这次没有运行" ;;
    *) meaning="未知" ;;
  esac
  say "==== 结束：退出码 $1（$meaning）"
  echo
  exit "$1"
}

source=manual
case ${1:-} in
  --cron) source=cron ;;
  "") ;;
  *)
    say "==== 开始备份数据库（$root）"
    say "不认识的参数 $1，用法：deploy/db-backup.sh [--cron]"
    finish 5
    ;;
esac

say "==== 开始备份数据库（$root，$source）"

# 出错时（例如没有 docker 的权限）docker 自己的错误信息也写进日志
if [ -z "$(docker compose ps --status running --quiet backend)" ]; then
  say "后端容器没有运行（docker compose ps 里找不到运行中的 backend）"
  finish 5
fi

say "docker compose exec backend eidolon backup --source $source"
# -T：cron 里没有终端；PYTHONUNBUFFERED：输出按实际顺序写进日志；PYTHONIOENCODING：日志里的中文一律是 UTF-8
docker compose exec -T -e PYTHONUNBUFFERED=1 -e PYTHONIOENCODING=utf-8 backend eidolon backup --source "$source"
code=$?
case $code in
  0 | 1 | 2 | 3 | 4 | 6) finish "$code" ;;
  *)
    say "docker compose exec 以 $code 结束"
    finish 5
    ;;
esac
