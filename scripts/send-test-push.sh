#!/usr/bin/env bash
# Send a test Web Push to a user's registered devices, straight through the
# web-push CLI — no DB writes, no cron, no app interaction. For verifying push
# delivery end-to-end on a real device. Reads the device subscriptions from
# Supabase (REST, service_role key) and fires one notification per subscription,
# with the same {title, body, url} payload shape the service worker expects.
#
# All secrets come from the environment — nothing is committed. Needs Node
# (uses npx web-push + JSON parsing). Usage:
#
#   SUPABASE_URL=https://<ref>.supabase.co \
#   SUPABASE_SERVICE_KEY=<prod service_role key> \
#   VAPID_PUBLIC_KEY=<public> VAPID_PRIVATE_KEY=<private> \
#   VAPID_SUBJECT=mailto:you@example.com \
#   ./scripts/send-test-push.sh <user-email-or-uuid> [title] [body]
set -euo pipefail

: "${SUPABASE_URL:?set SUPABASE_URL (https://<ref>.supabase.co)}"
: "${SUPABASE_SERVICE_KEY:?set SUPABASE_SERVICE_KEY (prod service_role key)}"
: "${VAPID_PUBLIC_KEY:?set VAPID_PUBLIC_KEY}"
: "${VAPID_PRIVATE_KEY:?set VAPID_PRIVATE_KEY}"
: "${VAPID_SUBJECT:?set VAPID_SUBJECT (mailto:...)}"

TARGET=${1:?"usage: send-test-push.sh <user-email-or-uuid> [title] [body]"}
TITLE=${2:-"Test notification"}
BODY=${3:-"If you see this, push works 🎭"}

api() {
  curl -fsS "$SUPABASE_URL/rest/v1/$1" \
    -H "apikey: $SUPABASE_SERVICE_KEY" \
    -H "Authorization: Bearer $SUPABASE_SERVICE_KEY"
}

# A 36-char UUID is used directly; anything else is treated as an email.
if [[ "$TARGET" =~ ^[0-9a-fA-F-]{36}$ ]]; then
  USER_ID=$TARGET
else
  USER_ID=$(api "profiles?email=eq.$TARGET&select=id" \
    | node -e 'const d=JSON.parse(require("fs").readFileSync(0));process.stdout.write(d[0]?.id??"")')
  [ -n "$USER_ID" ] || { echo "No profile found for $TARGET" >&2; exit 1; }
fi

SUBS=$(api "push_subscriptions?user_id=eq.$USER_ID&select=endpoint,keys")
COUNT=$(echo "$SUBS" | node -e 'process.stdout.write(String(JSON.parse(require("fs").readFileSync(0)).length))')
[ "$COUNT" != "0" ] || {
  echo "No push subscriptions for $USER_ID — enable notifications on the device first." >&2
  exit 1
}
echo "Sending to $COUNT subscription(s) of $USER_ID…"

PAYLOAD=$(TITLE="$TITLE" BODY="$BODY" \
  node -e 'process.stdout.write(JSON.stringify({title:process.env.TITLE,body:process.env.BODY,url:"/"}))')

# One push per registered device.
echo "$SUBS" | node -e '
  const subs = JSON.parse(require("fs").readFileSync(0));
  for (const s of subs) console.log([s.endpoint, s.keys.p256dh, s.keys.auth].join("\t"));
' | while IFS=$'\t' read -r endpoint p256dh auth; do
  if npx --yes web-push send-notification \
    --endpoint="$endpoint" --key="$p256dh" --auth="$auth" \
    --vapid-subject="$VAPID_SUBJECT" \
    --vapid-pubkey="$VAPID_PUBLIC_KEY" --vapid-pvtkey="$VAPID_PRIVATE_KEY" \
    --payload="$PAYLOAD" >/dev/null; then
    echo "✓ sent to ${endpoint:0:48}…"
  else
    echo "✗ failed ${endpoint:0:48}… (subscription may be expired)"
  fi
done
