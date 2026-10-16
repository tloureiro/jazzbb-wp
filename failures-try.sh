#!/usr/bin/env bash
set -euo pipefail

# Run just the failing publish-related tests in headed mode for debugging.

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT_DIR"

echo ">> Running editor publish test (headed, trace on)..."
PWDEBUG=1 npx playwright test tests/editor.spec.ts --headed --project=chromium

echo ">> Running theme tests that publish (headed, trace on)..."
PWDEBUG=1 npx playwright test tests/theme.spec.ts --headed --project=chromium

echo ">> Running visual hidden-fields sync test (headed, trace on)..."
PWDEBUG=1 npx playwright test tests/visual.spec.ts -g "hidden fields stay in sync on submit" --headed --project=chromium
