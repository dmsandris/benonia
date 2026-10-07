#!/usr/bin/env bash
# Unduh aset berlisensi (Tiny Swords) dari bucket PRIVATE Supabase Storage
# ke web/public/assets/ts/. Aset ini sengaja TIDAK disimpan di repo publik.
#
# Butuh env:
#   SUPABASE_SECRET_KEY  secret key project (sb_secret_...), dari GitHub Secrets
# Opsional:
#   SUPABASE_URL         default: URL project Benonia
#   ASSET_BUCKET         default: game-assets
#   ASSET_PACK           default: benonia-assets-v1.zip (naikkan versi tiap ganti isi)
set -euo pipefail
SUPABASE_URL="${SUPABASE_URL:-https://btwjjjhrdaffhcuperyi.supabase.co}"
ASSET_BUCKET="${ASSET_BUCKET:-game-assets}"
ASSET_PACK="${ASSET_PACK:-benonia-assets-v1.zip}"
: "${SUPABASE_SECRET_KEY:?SUPABASE_SECRET_KEY belum diisi}"

cd "$(dirname "$0")/.."
tmp="$(mktemp -d)"
echo "Mengunduh $ASSET_BUCKET/$ASSET_PACK ..."
note() { echo "$1"; [ -n "${GITHUB_ACTIONS:-}" ] && echo "::error::$1" || true; }
fetch() { # $@ = header tambahan; hasil: kode HTTP
  curl -sS --retry 2 -o "$tmp/assets.zip" -w '%{http_code}' -H "apikey: $SUPABASE_SECRET_KEY" "$@" \
    "$SUPABASE_URL/storage/v1/object/$ASSET_BUCKET/$ASSET_PACK" || echo 000
}
code="$(fetch)"
if [ "$code" != "200" ]; then
  first="$code: $(head -c 300 "$tmp/assets.zip" 2>/dev/null | tr -d '\n')"
  # sebagian endpoint Storage masih minta header Authorization juga
  code="$(fetch -H "Authorization: Bearer $SUPABASE_SECRET_KEY")"
fi
if [ "$code" != "200" ]; then
  body="$(head -c 300 "$tmp/assets.zip" 2>/dev/null | tr -d '\n')"
  list="$(curl -sS -X POST -H "apikey: $SUPABASE_SECRET_KEY" -H "Authorization: Bearer $SUPABASE_SECRET_KEY" \
    -H 'Content-Type: application/json' -d '{"prefix":"","limit":20}' \
    "$SUPABASE_URL/storage/v1/object/list/$ASSET_BUCKET" | head -c 400 | tr -d '\n')"
  note "Gagal unduh $ASSET_BUCKET/$ASSET_PACK. Coba1 [$first] Coba2 [$code: $body] Isi bucket: $list"
  exit 1
fi
rm -rf web/public/assets/ts
unzip -q "$tmp/assets.zip" -d web/public/assets
rm -rf "$tmp"
test -f web/public/assets/ts/units/warrior-idle.png || { echo "Isi zip tidak sesuai (ts/ tidak ditemukan)"; exit 1; }
echo "Aset terpasang: $(find web/public/assets/ts -type f | wc -l) file"
