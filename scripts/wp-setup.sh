#!/usr/bin/env bash
set -euo pipefail
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"
command -v docker >/dev/null || { echo 'Docker with Compose is required.' >&2; exit 1; }
[[ -s plugin/build/admin.js && -s plugin/build/admin.css ]] || { echo 'Build assets first: npm ci && npm run build' >&2; exit 1; }
WP_PORT="${WP_PORT:-8080}"
WP_READY_TIMEOUT="${WP_READY_TIMEOUT:-90}"
[[ "$WP_PORT" =~ ^[0-9]+$ && "$WP_PORT" -gt 0 && "$WP_PORT" -lt 65536 ]] || { echo 'Invalid WP_PORT.' >&2; exit 1; }
[[ "$WP_READY_TIMEOUT" =~ ^[0-9]+$ && "$WP_READY_TIMEOUT" -gt 0 ]] || { echo 'Invalid WP_READY_TIMEOUT.' >&2; exit 1; }
export WP_PORT
wp_cli() { docker compose run --rm -T wp wp "$@" --allow-root --url="http://localhost:$WP_PORT"; }
echo 'Starting the local WordPress stack...'
docker compose up -d db wordpress
# Each probe is short and the overall readiness wait is bounded.
deadline=$((SECONDS + WP_READY_TIMEOUT))
until docker compose exec -T db mysqladmin ping --connect-timeout=2 -h 127.0.0.1 --silent >/dev/null 2>&1 \
  && docker compose exec -T wordpress test -f /var/www/html/wp-includes/version.php; do
  if (( SECONDS >= deadline )); then
    echo 'WordPress/MySQL readiness timed out. Inspect docker compose logs db wordpress.' >&2
    exit 1
  fi
  sleep 2
done
if wp_cli core is-installed; then
  echo 'Existing installation retained (including content and credentials).'
else
  wp_cli core install --url="http://localhost:$WP_PORT" --title='Jazzbb WP' \
    --admin_user=admin --admin_password=admin --admin_email=admin@example.com --skip-email
fi
wp_cli plugin activate jazzbb-wp
wp_cli theme activate nothing-burger
wp_cli core version
echo "Ready: http://localhost:$WP_PORT/wp-admin/ (new installations use admin/admin)"
