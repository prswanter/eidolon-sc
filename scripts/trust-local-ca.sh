#!/bin/sh
# 把本机的自签根证书装进「当前用户」的根证书存储，浏览器才会信任 https://<本机IP>:8443。
#
# 为什么必须做：立绘素材走 https://<本机IP>:8443/stands/...（Caddy 反代 MinIO），而页面可能开在
# http://localhost:3000。浏览器不认这张自签证书时，页面本身能开，但去取衣装清单和 spine 文件会
# 直接 net::ERR_CERT_AUTHORITY_INVALID——表现就是「换衣装里啥也没有」「打电话没立绘」，
# 控制台只有一行证书错误，非常容易被误判成立绘没同步。
#
# 用法：
#   sh scripts/trust-local-ca.sh          装（已经装过就跳过）
#   sh scripts/trust-local-ca.sh --check  只查有没有装
#
# 信任范围是当前 Windows 用户，不需要管理员。Edge / Chrome / 夸克这类用系统证书库的浏览器都吃这个；
# Firefox 用自己的证书库，得在 about:preferences#privacy 里单独导入 ca.crt。
# 重新生成证书（deploy/local-tls/gen-certs.sh）之后根证书会变，要再跑一次本脚本。
set -u
cd "$(dirname "$0")/.." || exit 1

CA=deploy/local-tls/ca.crt
check_only=0
[ "${1:-}" = "--check" ] && check_only=1

if [ ! -f "$CA" ]; then
  echo "找不到 $CA，先跑 deploy/local-tls/gen-certs.sh" >&2
  exit 1
fi

thumb=$(openssl x509 -in "$CA" -outform der 2>/dev/null | openssl dgst -sha1 2>/dev/null | awk '{print toupper($NF)}')
if [ -z "$thumb" ]; then
  echo "读不出 $CA 的指纹，文件坏了？" >&2
  exit 1
fi

if certutil -user -store Root 2>/dev/null | grep -qi "$thumb"; then
  echo "已信任：CN=Eidolon Local CA（$thumb）"
  exit 0
fi

if [ "$check_only" = "1" ]; then
  echo "未信任：证书不在当前用户的根证书存储里，浏览器会报 ERR_CERT_AUTHORITY_INVALID"
  echo "跑 sh scripts/trust-local-ca.sh 装上"
  exit 2
fi

# certutil 不认 Git Bash 的 /d/... 路径，换成 Windows 形式并关掉路径转换
win=$(cygpath -w "$(pwd)/$CA" 2>/dev/null || echo "$(pwd)/$CA")
MSYS_NO_PATHCONV=1 certutil -f -user -addstore Root "$win" >/dev/null 2>&1

if certutil -user -store Root 2>/dev/null | grep -qi "$thumb"; then
  echo "已装上：CN=Eidolon Local CA（$thumb）"
  echo "浏览器的证书判断是启动时读的：完全退出浏览器再打开一次（Edge/Chrome 都关干净），"
  echo "或者在地址栏打开 https://$(sed -n 's/^EIDOLON_PUBLIC_IP=//p' .env 2>/dev/null) 对应的地址刷新。"
  exit 0
fi

echo "装上失败。可以用管理员 PowerShell 手工导入：" >&2
echo "  Import-Certificate -FilePath '$win' -CertStoreLocation Cert:\\CurrentUser\\Root" >&2
exit 3
