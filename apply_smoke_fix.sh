#!/usr/bin/env bash
set -e
mkdir -p .backup_smoke
cp tools/net_smoke.mjs .backup_smoke/net_smoke.mjs.bak
python3 - <<'PY'
import sys
p = "tools/net_smoke.mjs"
s = open(p, encoding="utf-8").read()
old = "const dup = bot('ALPHA', 0)\nawait new Promise((r) => setTimeout(r, 400))\n"
new = "const dup = bot('ALPHA', 0)\nfor (let i = 0; i < 50 && !dup.id; i++) await new Promise((r) => setTimeout(r, 100))\nawait new Promise((r) => setTimeout(r, 200))\n"
if s.count(old) != 1:
    print("PATCH FAILED: anchor found %d times (nothing changed)" % s.count(old))
    sys.exit(1)
open(p, "w", encoding="utf-8").write(s.replace(old, new))
print("patched tools/net_smoke.mjs")
PY
