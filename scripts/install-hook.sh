#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
if [[ -n "$(git config --get core.hooksPath || true)" ]]; then
  echo 'A hooksPath is already configured; leaving it unchanged.' >&2; exit 1
fi
hook="$(git rev-parse --git-path hooks/pre-commit)"
if [[ -e "$hook" ]]; then
  if cmp -s .githooks/pre-commit "$hook"; then echo 'Hook already installed.'; exit 0; fi
  echo 'A pre-commit hook already exists; leaving it unchanged.' >&2; exit 1
fi
cp .githooks/pre-commit "$hook"
chmod +x "$hook"
echo 'Quick hook installed. Full checks remain explicit.'
