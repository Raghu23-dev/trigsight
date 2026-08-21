#!/usr/bin/env bash
# Initial JS payload as a browser receives it: fetch HTML, extract <script src>,
# fetch each once with br/gzip, sum transfer bytes. One request per asset.
set -uo pipefail
URL="${1:?usage: measure.sh <url>}"
UA="Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36"
ORIGIN="$(printf '%s' "$URL" | sed -E 's#(https?://[^/]+).*#\1#')"
TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT

HTML_BYTES=$(curl -sS --max-time 20 -H "Accept-Encoding: br, gzip" -A "$UA" "$URL" -o /dev/null -w '%{size_download}')
curl -sS --max-time 20 -A "$UA" --compressed "$URL" -o "$TMP/p.html"

# Whole <script> tags, so `noModule` is still visible when the src is extracted. A
# `src`-only regex hid it, and the polyfill bundle it marks was being counted: this script
# reported 174.3 KB where the recorded figure is 133.9 KB, because Next ships a legacy
# polyfill chunk that carries `noModule` and is therefore never fetched by any browser
# supporting ES modules — which is every browser this site targets. Counting bytes no
# client downloads inflates both a baseline and its comparison.
grep -oE '<script[^>]*src="[^"]+"[^>]*>' "$TMP/p.html" \
  | grep -viE '\bnomodule\b' \
  | sed -E 's/.*src="([^"]+)".*/\1/' | sort -u > "$TMP/s.txt"

SKIPPED=$(grep -oE '<script[^>]*src="[^"]+"[^>]*>' "$TMP/p.html" | grep -ciE '\bnomodule\b' || true)

TOTAL=0; COUNT=0; : > "$TMP/d.tsv"
while IFS= read -r s; do
  [ -z "$s" ] && continue
  case "$s" in
    http*) f="$s" ;; //*) f="https:$s" ;; /*) f="$ORIGIN$s" ;; *) f="$ORIGIN/$s" ;;
  esac
  read -r b enc <<< "$(curl -sS --max-time 15 -H "Accept-Encoding: br, gzip" -A "$UA" \
      -o /dev/null -w '%{size_download} %{content_type}' "$f" 2>/dev/null || echo "0 err")"
  TOTAL=$((TOTAL + b)); COUNT=$((COUNT + 1))
  printf '%s\t%s\n' "$b" "$f" >> "$TMP/d.tsv"
done < "$TMP/s.txt"

echo "url=$URL"
echo "html_transfer_bytes=$HTML_BYTES"
echo "script_count=$COUNT"
echo "nomodule_scripts_excluded=$SKIPPED"
echo "js_transfer_bytes=$TOTAL"
echo "js_transfer_kb=$(python3 -c "print(f'{$TOTAL/1024:.1f}')")"
echo "total_initial_kb=$(python3 -c "print(f'{($TOTAL+$HTML_BYTES)/1024:.1f}')")"
echo "--- top scripts by bytes ---"
sort -rn "$TMP/d.tsv" | head -12
