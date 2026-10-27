#!/usr/bin/env bash
# Prints every important source file with a header, for pasting into chat.
cd "$(dirname "$0")" || exit 1
show() { echo; echo "=================== $1 ==================="; cat "$1"; }
for f in nuxt.config.ts package.json app.vue; do
  [ -f "$f" ] && show "$f"
done
find app -type f \( -name '*.vue' -o -name '*.js' -o -name '*.ts' \) | sort | while read -r f; do
  show "$f"
done
