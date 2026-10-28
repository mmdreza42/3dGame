#!/usr/bin/env bash
set -e
mkdir -p .backup_deploy
[ -f nuxt.config.ts ] && cp nuxt.config.ts .backup_deploy/nuxt.config.ts.bak
[ -f wrangler.jsonc ] && cp wrangler.jsonc .backup_deploy/wrangler.jsonc.bak

python3 - <<'PY'
import re, sys
p = "nuxt.config.ts"
s = open(p, encoding="utf-8").read()
pat = re.compile(r"""preset\s*:\s*['"]cloudflare[-_]pages['"]""")
m = pat.findall(s)
if len(m) != 1:
    print("PATCH FAILED: cloudflare-pages preset found %d times (nothing changed)" % len(m))
    sys.exit(1)
s = pat.sub("preset: 'cloudflare_module'", s)
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
  }
}
EOT
echo "wrote wrangler.jsonc"
