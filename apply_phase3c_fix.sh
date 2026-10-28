#!/usr/bin/env bash
set -e
mkdir -p .backup_3c_fix
cp nuxt.config.ts .backup_3c_fix/nuxt.config.ts.bak
python3 - <<'PY'
import sys
p = "nuxt.config.ts"
s = open(p, encoding="utf-8").read()
old = "export default defineNuxtConfig({\n"
if s.count(old) != 1 or "compatibilityDate" in s:
    print("PATCH FAILED: anchor not found exactly once or compatibilityDate already set (nothing changed)")
    sys.exit(1)
s = s.replace(old, old + "  compatibilityDate: '2025-07-15',\n")
open(p, "w", encoding="utf-8").write(s)
print("patched nuxt.config.ts")
PY
