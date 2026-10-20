#!/bin/sh
# 把本机的局域网改造重新打在干净的代码上。重新解压上游包、或者换新版升级以后跑这个。
#
# 改造内容（背景见根目录 EIDOLON本地部署交接.md 第五节）：
#   0001 后端放行局域网来源：config.py 加 extra_origins 字段、sessions.py 的白名单认它
#   0002 加 caddy（8443 HTTPS + 8080 证书下载）和 coturn（WebRTC 中继）两个服务
#
# 证书不在 patch 里（含私钥，不进 git）：新环境先跑 deploy/local-tls/gen-certs.sh <本机IP>。
# .env 也不在 patch 里，脚本最后会检查那几个变量在不在。
#
#   sh scripts/apply-local-patches.sh            应用，已经应用的跳过
#   sh scripts/apply-local-patches.sh --check    只检查能不能干净应用，不动文件
#
# 退出码：0 全部就绪；非 0 有 patch 打不上（多半是上游改了同一处，需要手工合并）。
set -u

cd "$(dirname "$0")/.." || exit 1

check_only=0
if [ "${1:-}" = "--check" ]; then
  check_only=1
fi

patch_dir=deploy/patches
status=0

for p in "$patch_dir"/*.patch; do
  [ -e "$p" ] || {
    echo "找不到 $patch_dir/*.patch" >&2
    exit 1
  }
  name=$(basename "$p")

  # 反向能干说明已经在里面了（重复跑不该报错）
  if patch -p1 --dry-run --reverse --force --silent <"$p" >/dev/null 2>&1; then
    echo "跳过 $name：已经应用过"
    continue
  fi

  if ! patch -p1 --dry-run --force --silent <"$p" >/dev/null 2>&1; then
    echo "失败 $name：打不上，上游可能改过同一处" >&2
    echo "     看细节：patch -p1 --dry-run < $p" >&2
    status=1
    continue
  fi

  # 反向也失败、正向能过 => 干净可打
  if [ "$check_only" -eq 1 ]; then
    echo "可以 $name（--check 模式，未改动文件）"
    continue
  fi

  if patch -p1 --force --silent <"$p"; then
    echo "应用 $name"
  else
    echo "失败 $name：写入时出错" >&2
    status=1
  fi
done

# 以下只做体检，不改任何文件
echo
echo "=== 检查依赖的本地环境 ==="

missing_env=""
for key in EIDOLON_EXTRA_ORIGINS EIDOLON_ICE_SERVERS EIDOLON_TURN_URLS EIDOLON_TURN_SECRET EIDOLON_TURN_EXTERNAL_IP; do
  if [ ! -f .env ]; then
    missing_env="$missing_env .env(整个文件)"
    break
  fi
  if ! grep -q "^$key=..*" .env; then
    missing_env="$missing_env $key"
  fi
done

if [ -n "$missing_env" ]; then
  echo "缺 .env 配置：$missing_env"
  echo "  照 .env.example 补上；EIDOLON_TURN_SECRET 用 openssl rand -hex 32 生成，"
  echo "  EIDOLON_TURN_EXTERNAL_IP 填本机局域网 IP。三项地址里的 IP 要和它一致。"
  status=1
else
  echo ".env 五项都在"
fi

if [ -f deploy/local-tls/server.crt ] && [ -f deploy/local-tls/server.key ]; then
  san=$(openssl x509 -in deploy/local-tls/server.crt -noout -ext subjectAltName 2>/dev/null | tail -1 | tr -d ' ')
  echo "证书在：$san"
  ip=$(grep '^EIDOLON_TURN_EXTERNAL_IP=' .env 2>/dev/null | cut -d= -f2-)
  case "$san" in
  *"IPAddress:$ip"*) : ;;
  *) echo "  ⚠ 证书里没有 $ip，手机访问会报证书错误：跑 sh deploy/local-tls/gen-certs.sh $ip" ;;
  esac
else
  echo "没有证书：跑 sh deploy/local-tls/gen-certs.sh \$(本机局域网 IP)"
  status=1
fi

if [ "$status" -eq 0 ]; then
  echo
  echo "接下来：docker compose up -d --force-recreate"
fi

exit "$status"
