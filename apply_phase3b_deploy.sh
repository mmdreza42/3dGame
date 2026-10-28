#!/usr/bin/env bash
set -e
mkdir -p .backup_3b
cp nuxt.config.ts .backup_3b/nuxt.config.ts.bak
[ -f wrangler.jsonc ] && cp wrangler.jsonc .backup_3b/wrangler.jsonc.bak

python3 - <<'PY'
import sys
p = "nuxt.config.ts"
s = open(p, encoding="utf-8").read()
old = "preset: 'cloudflare_module'"
if s.count(old) != 1:
    print("PATCH FAILED: %s found %d times (nothing changed)" % (old, s.count(old)))
    sys.exit(1)
if "experimental" in s:
    print("PATCH FAILED: 'experimental' already in nuxt.config.ts, paste the file (nothing changed)")
    sys.exit(1)
s = s.replace(old, "preset: 'cloudflare-durable',\n    experimental: { websocket: true }")
open(p, "w", encoding="utf-8").write(s)
print("patched nuxt.config.ts")
PY

cat > wrangler.jsonc <<'EOT'
{
  "$schema": "node_modules/wrangler/config-schema.json",
  "name": "3dgame",
  "main": ".output/server/index.mjs",
  "compatibility_date": "2025-07-15",
  "assets": {
    "directory": ".output/public",
    "binding": "ASSETS"
  },
  "durable_objects": {
    "bindings": [
      { "name": "$DurableObject", "class_name": "$DurableObject" }
    ]
  },
  "migrations": [
    { "tag": "v1", "new_sqlite_classes": ["$DurableObject"] }
  ]
}
EOT
echo "wrote wrangler.jsonc"
