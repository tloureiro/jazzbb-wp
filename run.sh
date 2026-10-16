#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT_DIR"

echo ">> Installing dependencies"
npm ci

echo ">> Building admin assets"
npm run build

echo ">> Running WP setup (install + activate plugin)"
./scripts/wp-setup.sh

echo ">> Visit WordPress at: http://localhost:${WP_PORT:-8080}/wp-admin/ (admin/admin)"

if [ "${RUN_TESTS:-0}" = "1" ]; then
  echo ">> Running Playwright e2e suite (RUN_TESTS=1)"
  npm run test:e2e
else
  echo ">> Skipping Playwright suite (set RUN_TESTS=1 to enable)"
fi

if [ "${SKIP_WATCH:-0}" = "1" ]; then
  echo ">> Stack is up. Leave containers running for inspection or stop with: npm run wp:down"
else
  echo ">> Starting asset watcher (npm run dev:watch)... (Ctrl+C to stop, stack stays up)"
  npm run dev:watch
fi
