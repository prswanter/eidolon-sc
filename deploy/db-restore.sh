#!/bin/sh
# 从备份恢复数据库：先在一次性的后端容器里检查你在自己电脑上解密好的备份（完整性、是不是本项目的库），
# 不通过就什么都不动；通过后把现在的库备份到存储桶（deploy/db-backup.sh），再停后端，在一次性的后端容器里
# 运行 `eidolon restore` 替换数据卷里的库、删掉旧的 -wal/-shm，最后启动后端。步骤见 docs/deploy.md 的
# 「从备份恢复」和「换服务器」。
#
# 用法：deploy/db-restore.sh <文件> [--no-backup]
#   <文件>       解密后的备份，eidolon-<UTC 时间>.db.gz 或解压后的 .db 都行
#   --no-backup  不先备份现在的库：新服务器上的库是空的，备份也可能还没配好
#
# 交互运行，输出在终端，不写日志文件（先备份的那一次照常写进 logs/db-backup.log）。
# 默认用 docker-compose.prod.yml；设置了 COMPOSE_FILE 时用它指定的配置。
#
# 退出码：
#   0  恢复完成，后端已启动
#   1  参数不对或者文件不存在，什么都没动
#   2  替换前的备份没有成功，什么都没换（原因在 logs/db-backup.log）
#   3  文件没有通过检查（或者没能替换），现在的库没有换；后端在运行
#   4  停止或启动后端失败（docker 自己的错误在上方）

set -u

usage="用法：deploy/db-restore.sh <文件> [--no-backup]"
file=
backup=yes
for arg in "$@"; do
  case $arg in
    --no-backup) backup=no ;;
    -*)
      echo "不认识的参数 $arg，$usage" >&2
      exit 1
      ;;
    *)
      if [ -n "$file" ]; then
        echo "只能恢复一个文件，$usage" >&2
        exit 1
      fi
      file=$arg
      ;;
  esac
done
if [ -z "$file" ]; then
  echo "$usage" >&2
  exit 1
fi
if [ ! -f "$file" ]; then
  echo "找不到文件 $file" >&2
  exit 1
fi
# 换到仓库根目录之前，相对路径先变成绝对路径
file=$(cd "$(dirname "$file")" && pwd)/$(basename "$file")

root=$(cd "$(dirname "$0")/.." && pwd)
cd "$root" || exit 1
export COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.prod.yml}"

say() {
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*"
}

name=$(basename "$file")
# 文件只读挂进一次性的后端容器，和数据卷在一起
restore() {
  docker compose run --rm --no-deps -T -e PYTHONIOENCODING=utf-8 \
    -v "$file:/restore/$name:ro" backend eidolon restore "$@" "/restore/$name"
}

say "检查 $name（后端照常运行）"
if ! restore --check; then
  say "没有通过检查（见上方的原因），什么都没动"
  exit 3
fi

if [ "$backup" = yes ]; then
  say "先把现在的库备份到存储桶（deploy/db-backup.sh，需要几分钟）"
  "$root/deploy/db-backup.sh"
  code=$?
  log=${EIDOLON_BACKUP_LOG:-$root/logs/db-backup.log}
  if [ "$code" -ne 0 ]; then
    say "替换前的备份没有成功（退出码 $code），什么都没换。$log 里这次备份的记录："
    awk '/==== 开始备份数据库/ { run = "" } { run = run $0 "\n" } END { printf "%s", run }' "$log"
    say "新服务器上的库是空的，不用先备份，可以加 --no-backup"
    exit 2
  fi
  say "替换前的库$(grep '已备份为' "$log" | tail -n 1)"
fi

say "停止后端"
docker compose stop backend || exit 4

start_backend() {
  say "启动后端"
  docker compose start backend || exit 4
}
# 中途按了 Ctrl-C 也把后端启动起来：替换是一次改名，库要么是旧的、要么是新的
trap 'start_backend; exit 3' INT TERM HUP

say "替换数据库"
restore
code=$?
trap - INT TERM HUP
start_backend

if [ "$code" -ne 0 ]; then
  say "没有恢复（见上方的原因），现在的库没有换"
  exit 3
fi
say "恢复完成。登录网站看看对话和记忆都在，后台的看板能打开"
