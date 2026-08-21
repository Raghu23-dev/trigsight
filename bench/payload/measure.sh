#!/usr/bin/env bash
# Measures OUR payload as production serves it: brotli-compressed transfer bytes.
#
# Why not curl against localhost: `next start` serves uncompressed, so a naive
# curl overstates transfer by ~2.4x. Vercel serves brotli. This script compresses
# each asset locally at the same quality to estimate real transfer.
set -euo pipefail
PORT="${1:-3990}"
BUDGET_KB="${2:-150}"

npx next start -p "$PORT" > /tmp/trigsight-measure.log 2>&1 &
SERVER=$!
trap 'kill $SERVER 2>/dev/null || true' EXIT
for _ in $(seq 1 30); do
  curl -sf -o /dev/null "http://localhost:$PORT/" && break
  sleep 1
done

# Exclude noModule scripts. Next emits a legacy polyfill bundle with the
# `noModule` attribute, which modern browsers deliberately do NOT fetch — every
# browser supporting ES modules skips it. Counting it overstated the payload by
# ~35 KB brotli. Measured 2026-08-21: <script src=".../polyfills-*.js" noModule="">
HTML=$(curl -s "http://localhost:$PORT/")
MODERN=$(printf '%s' "$HTML" | grep -oE '<script[^>]+src="/_next/static/[^"]+\.js"[^>]*>' \
  | grep -v 'noModule' | grep -oE '/_next/static/[^"]+\.js' | sort -u)

total=0
echo "asset                              raw       brotli"
for f in $MODERN; do
  raw=$(curl -s "http://localhost:$PORT$f" -o /tmp/asset.js -w '%{size_download}')
  br=$(node -e "const z=require('zlib'),fs=require('fs');process.stdout.write(String(z.brotliCompressSync(fs.readFileSync('/tmp/asset.js'),{params:{[z.constants.BROTLI_PARAM_QUALITY]:11}}).length))")
  total=$((total + br))
  printf "%-34s %8s %8s\n" "$(basename "$f")" "$raw" "$br"
done

python3 - "$total" "$BUDGET_KB" <<'PY'
import sys
total, budget = int(sys.argv[1]), float(sys.argv[2])
kb = total / 1024
print(f"\ninitial JS (brotli): {kb:.1f} KB")
print(f"budget:              {budget:.0f} KB")
print(f"headroom:            {budget - kb:.1f} KB")
if kb > budget:
    print("\nOVER BUDGET")
    sys.exit(1)
print("\nwithin budget")
PY
