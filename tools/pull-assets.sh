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
curl -fsS --retry 3 -H "apikey: $SUPABASE_SECRET_KEY" \
  "$SUPABASE_URL/storage/v1/object/$ASSET_BUCKET/$ASSET_PACK" -o "$tmp/assets.zip"
rm -rf web/public/assets/ts
unzip -q "$tmp/assets.zip" -d web/public/assets
rm -rf "$tmp"
test -f web/public/assets/ts/units/warrior-idle.png || { echo "Isi zip tidak sesuai (ts/ tidak ditemukan)"; exit 1; }
echo "Aset terpasang: $(find web/public/assets/ts -type f | wc -l) file"
