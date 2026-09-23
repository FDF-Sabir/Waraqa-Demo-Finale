#!/usr/bin/env bash
set -e
cd -- "$(dirname -- "$0")"

# Waraqa exige Node.js 22 ou plus. Si le « node » par défaut est plus ancien (ou absent),
# on cherche une version compatible installée via nvm, sans rien modifier sur le poste.
node_ok() { command -v node >/dev/null 2>&1 && [ "$(node -p 'process.versions.node.split(".")[0]' 2>/dev/null)" -ge 22 ] 2>/dev/null; }
if ! node_ok; then
  NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
  best="$(ls -d "$NVM_DIR"/versions/node/v2[2-9]* "$NVM_DIR"/versions/node/v[3-9][0-9]* 2>/dev/null | sort -V | tail -n 1)"
  if [ -n "$best" ] && [ -x "$best/bin/node" ]; then
    export PATH="$best/bin:$PATH"
  fi
fi
if ! node_ok; then
  echo "Waraqa nécessite Node.js 22 ou 24 (https://nodejs.org). Version actuelle : $(node -v 2>/dev/null || echo 'absente')."
  exit 1
fi
node scripts/start.cjs
