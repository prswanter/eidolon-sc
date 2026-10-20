#!/bin/sh
# 校验 Cloudflare 的 Clef-flash 判断模型凭证能不能真的用。
#
# 用法（先验证，再填 .env，避免填错导致后端拒绝启动）：
#   sh scripts/check-cloudflare-judge.sh <API_TOKEN> <ACCOUNT_ID>
#   sh scripts/check-cloudflare-judge.sh              # 不给参数就从 .env 读
#
# 它做两件事：
#   1. /user/tokens/verify   → token 本身是否有效
#   2. POST /accounts/<id>/ai/run/@cf/cloudflare/clef-flash
#      → account id 对不对、token 有没有 Workers AI 权限、模型能不能出结果
#
# 排错对照（和后端启动时的判定一致，见 backend/src/eidolon/judge.py 的 check()）：
#   401/403 且 token 有效  → account id 不对，或 token 没这个账号的 Workers AI 权限
#   401/403 且 token 无效  → token 本身无效（过期/复制不全/被撤销）
#   404 或 7003 类错误码   → account id 不对
#   429                    → 当天免费额度用完了（10,000 neurons），次日恢复
set -u

cd "$(dirname "$0")/.." || exit 1

TOKEN=${1:-}
ACCOUNT=${2:-}
if [ -z "$TOKEN" ]; then
  TOKEN=$(sed -n 's/^CLOUDFLARE_API_TOKEN=//p' .env | head -1)
fi
if [ -z "$ACCOUNT" ]; then
  ACCOUNT=$(sed -n 's/^CLOUDFLARE_ACCOUNT_ID=//p' .env | head -1)
fi

if [ -z "$TOKEN" ] || [ -z "$ACCOUNT" ]; then
  echo "用法：sh scripts/check-cloudflare-judge.sh <API_TOKEN> <ACCOUNT_ID>"
  echo "（不给参数时会从 .env 读 CLOUDFLARE_API_TOKEN / CLOUDFLARE_ACCOUNT_ID）"
  exit 1
fi

echo "token    长度=${#TOKEN}  开头=${TOKEN%"${TOKEN#?????}"}...  末尾=...${TOKEN#${TOKEN%????}}"
echo "account  ${ACCOUNT}"
echo

echo "=== 1. token 本身是否有效 ==="
verify=$(curl -s --max-time 20 \
  -H "Authorization: Bearer $TOKEN" \
  "https://api.cloudflare.com/client/v4/user/tokens/verify" 2>&1)
printf '%s' "$verify" | "C:/Users/touma/.workbuddy/binaries/python/versions/3.13.12/python.exe" -c '
import sys, json
try:
    d = json.load(sys.stdin)
except Exception:
    print("  返回无法解析（网络问题？）"); sys.exit(3)
if d.get("success"):
    st = (d.get("result") or {}).get("status")
    print("  token 有效，状态 =", st)
    sys.exit(0)
errs = d.get("errors") or []
print("  token 无效或不可验证：")
for e in errs:
    print("   ", e.get("code"), e.get("message"))
print("  → 重新创建 token：Dash 右上角头像 → My Profile → API Tokens")
sys.exit(1)
'
token_ok=$?

echo
echo "=== 2. account id + Workers AI 权限 + 模型能否出结果 ==="
body='{"model":"clef-flash","state":{"测试":"启动检查"},"questions":{"check":{"type":"noul","instructions":"这是一条测试消息吗？"}}}'
resp=$(curl -s --max-time 60 -w '\n__STATUS__%{http_code}' \
  -X POST "https://api.cloudflare.com/client/v4/accounts/$ACCOUNT/ai/run/@cf/cloudflare/clef-flash" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "$body" 2>&1)

printf '%s' "$resp" | "C:/Users/touma/.workbuddy/binaries/python/versions/3.13.12/python.exe" -c '
import sys, json
raw = sys.stdin.read()
status = None
if "\n__STATUS__" in raw:
    raw, st = raw.rsplit("\n__STATUS__", 1)
    status = int(st.strip() or 0)
try:
    d = json.loads(raw)
except Exception:
    print("  HTTP", status, "返回不是 JSON：", raw[:300])
    print("  → 检查网络，或 token 是否被中间设备拦了")
    sys.exit(3)

if status and status < 400 and d.get("success") is not False:
    res = d.get("result") or {}
    ans = res.get("answers")
    usage = res.get("usage")
    print("  ✓ 可用：模型返回了结果")
    if ans is not None:
        print("    answers:", json.dumps(ans, ensure_ascii=False)[:160])
    if usage:
        print("    usage:", json.dumps(usage, ensure_ascii=False))
    sys.exit(0)

errs = d.get("errors") or []
codes = {e.get("code") for e in errs if isinstance(e, dict)}
print("  ✗ 被拒：HTTP", status)
for e in errs:
    if isinstance(e, dict):
        print("   ", e.get("code"), e.get("message"))
if status == 429 or 429 in codes:
    print("  → 当天免费额度（10,000 neurons）用完了，次日恢复；或开 Workers Paid")
elif status in (401, 403):
    print("  → token 没这个账号的 Workers AI 权限，或 account id 不是这个 token 的账号")
    print("    重新建 token 时权限要给：Workers AI 的 Read + Edit")
elif status == 404 or codes & {7003, 7000, 7001}:
    print("  → account id 不对（Cloudflare 找不到这个账号）")
sys.exit(1)
'
