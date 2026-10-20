#!/bin/sh
# 填好 key 之后的一键启用：校验配置 → 重建容器 → 同步剧情库（向量化）→ 体检。
#
# 前置（两处 key 都是服务端配置，浏览器自带 key 顶不了）：
#   .env 里 SILICONFLOW_API_KEY        向量化 + 重排，没有替代
#   .env 里 JUDGE_PROVIDER=bailian     判断模型（检索决策 / 好感度 / 通话情绪）
#          BAILIAN_JUDGE_API_KEY=sk-...
#          BAILIAN_JUDGE_WORKSPACE_ID=llm-...
#
#   sh scripts/enable-retrieval.sh            校验 + 重建 + 同步剧情库
#   sh scripts/enable-retrieval.sh --check    只校验配置，不动任何东西
#   sh scripts/enable-retrieval.sh --no-sync  校验 + 重建，跳过剧情库同步
#
# 剧情库同步第一次要一到两小时（5623 个 CSV + 从镜像补原文），可反复中断重跑。
set -u

cd "$(dirname "$0")/.." || exit 1

mode=${1:-all}
missing=0

echo "=== 1. 校验 .env ==="
need() {
  v=$(sed -n "s/^$1=//p" .env | head -1)
  if [ -z "$v" ]; then
    echo "  缺 $1：$2"
    missing=1
  else
    echo "  有 $1"
  fi
}

need SILICONFLOW_API_KEY "cloud.siliconflow.cn 控制台「API 密钥」新建，sk- 开头。向量化和重排都要它"
judge=$(sed -n 's/^JUDGE_PROVIDER=//p' .env | head -1)
if [ -z "$judge" ]; then
  echo "  缺 JUDGE_PROVIDER：三选一，本机建议 bailian"
  missing=1
else
  echo "  有 JUDGE_PROVIDER=$judge"
  case "$judge" in
    bailian)
      need BAILIAN_JUDGE_API_KEY "阿里云百炼「API-KEY 管理」，必须属于下面那个业务空间"
      need BAILIAN_JUDGE_WORKSPACE_ID "百炼「业务空间管理」，形如 llm-xxxx"
      ;;
    jev) need JEV_API_KEY "openrouter.ai 的 key" ;;
    cloudflare)
      need CLOUDFLARE_API_TOKEN "Workers AI 的 Read + Edit 权限"
      need CLOUDFLARE_ACCOUNT_ID "Cloudflare 控制台右侧的账户 ID"
      ;;
  esac
fi

if [ "$missing" -ne 0 ]; then
  echo
  echo "配置不全，先填 .env 再跑。各项的含义见 .env.example 的注释和交接文档第十四节。"
  exit 1
fi

echo
echo "=== 2. 校验剧情库数据 ==="
story="../corpus/SCTranslationData/data/story"
if [ -d "$story" ]; then
  echo "  $(find "$story" -name '*.csv' | wc -l) 个 CSV：$story"
else
  echo "  缺剧情数据（$story）。从 github.com/ShinyGroup/SCTranslationData 取 master 分支，解压到 corpus/SCTranslationData"
  exit 1
fi

if [ "$mode" = "--check" ]; then
  echo
  echo "配置齐全，可以跑：sh scripts/enable-retrieval.sh"
  exit 0
fi

echo
echo "=== 3. 重建容器让后端读到新 key ==="
# 只 up -d 不会重读 .env 里改过的值，必须 force-recreate。
docker compose up -d --force-recreate backend frontend || exit 1

echo
echo "等待后端就绪（它会试调一次判断模型，配置不对会直接拒绝启动）"
i=0
while [ "$i" -lt 40 ]; do
  if curl -sf -o /dev/null http://localhost:3000/api/characters 2>/dev/null; then
    echo "后端已就绪"
    break
  fi
  i=$((i + 1))
  sleep 3
done
if [ "$i" -ge 40 ]; then
  echo "后端 2 分钟内没起来，看日志：" >&2
  docker compose logs --tail 40 backend >&2
  exit 1
fi

# 判断模型配置错时启动会失败，检查一下有没有因此重启
if docker compose logs --tail 60 backend 2>&1 | grep -qE "判断模型|JUDGE|bailian"; then
  echo
  echo "启动日志里提到判断模型，确认没有报错："
  docker compose logs --tail 60 backend 2>&1 | grep -iE "判断模型|JUDGE|bailian" | tail -5
fi

if [ "$mode" = "--no-sync" ]; then
  echo
  echo "跳过剧情库同步（--no-sync）。要同步时跑："
  echo "  docker compose exec backend eidolon story sync"
  exit 0
fi

echo
echo "=== 4. 同步剧情库并向量化（第一次一到两小时，可中断重跑）==="
# 镜像连不上时退出码 2，已导入的会保留，重跑即可续上。
i=1
while [ "$i" -le 4 ]; do
  [ "$i" -gt 1 ] && { echo "--- 第 $i 轮（镜像可能断过，已导入的会跳过）---"; sleep 15; }
  docker compose exec backend eidolon story sync
  rc=$?
  [ "$rc" -eq 0 ] && break
  if [ "$rc" -ne 2 ]; then
    echo "剧情同步失败（退出码 $rc），停下。看上面的输出定位问题。" >&2
    exit 1
  fi
  i=$((i + 1))
done

echo
echo "=== 5. 体检 ==="
# 没有 doctor 命令，直接查两件事：后端活着、向量库里有东西。
curl -s -o /dev/null -w "接口 http://localhost:3000/api/characters -> %{http_code}\n" http://localhost:3000/api/characters
echo "数据库里的剧情/向量条数："
docker compose exec -T backend sh -c 'ls -la /data/*.db 2>/dev/null | head -3' 2>&1 | tail -3
echo
echo "看日志确认没有报错：docker compose logs --tail 30 backend"
echo "页面上应有的变化：对话页出现好感度档位、礼物页可抽奖、问她剧情会回忆。"
