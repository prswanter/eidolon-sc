#!/bin/sh
# 生成/重签本机局域网 HTTPS 用的自签证书。
#
#   sh deploy/local-tls/gen-certs.sh 10.34.31.40
#
# 根证书（ca.crt / ca.key）只在第一次生成；之后重签服务器证书都复用它，
# 所以 DHCP 换了 IP 时手机**不用**重装根证书，重下一遍 server 证书即可。
# 根证书丢了就得重新生成、手机上重新信任一次，所以 ca.key 要单独备份。
#
# Apple 对私有 CA 签的服务器证书上限 825 天，根证书这里给 3650 天。
set -u

cd "$(dirname "$0")" || exit 1

ip=${1:-}
if [ -z "$ip" ]; then
  # 没给就退回去读 .env 里的本机 IP
  ip=$(grep '^EIDOLON_TURN_EXTERNAL_IP=' ../../.env 2>/dev/null | cut -d= -f2-)
fi
if [ -z "$ip" ]; then
  echo "用法：sh deploy/local-tls/gen-certs.sh <本机局域网 IP>" >&2
  exit 1
fi

# Git Bash 会把 -subj "/CN=x" 当成路径改写，关掉这个转换
MSYS_NO_PATHCONV=1
export MSYS_NO_PATHCONV

# --- 根证书 ---
if [ ! -f ca.crt ] || [ ! -f ca.key ]; then
  echo "生成根证书（10 年）"
  MSYS_NO_PATHCONV=1 openssl req -x509 -newkey rsa:4096 -sha256 -nodes -days 3650 \
    -keyout ca.key -out ca.crt -subj "/CN=Eidolon Local CA" || exit 1
else
  echo "复用已有的根证书（手机已信任的信任链不变）"
fi

# --- 服务器证书 ---
echo "签发服务器证书：$ip（825 天）"
MSYS_NO_PATHCONV=1 openssl req -newkey rsa:2048 -sha256 -nodes \
  -keyout server.key -out server.csr -subj "/CN=$ip" || exit 1

printf 'subjectAltName=IP:%s,IP:127.0.0.1,DNS:localhost\nbasicConstraints=CA:FALSE\nkeyUsage=digitalSignature,keyEncipherment\nextendedKeyUsage=serverAuth\n' "$ip" >server.ext

MSYS_NO_PATHCONV=1 openssl x509 -req -in server.csr -CA ca.crt -CAkey ca.key \
  -CAcreateserial -out server.crt -days 825 -sha256 -extfile server.ext || exit 1

rm -f server.csr

echo
openssl x509 -in server.crt -noout -dates -ext subjectAltName
echo
echo "cert 就绪。重载 caddy 让它读新证书：docker compose up -d --force-recreate caddy"
echo "还要同步改 .env 的 EIDOLON_TURN_EXTERNAL_IP / EIDOLON_ICE_SERVERS / EIDOLON_TURN_URLS / EIDOLON_EXTRA_ORIGINS。"
