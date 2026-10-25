# Development and architecture

## Design

The PHP plugin chooses the editor for new/empty posts and pages or posts already
carrying `_jazzbb_markdown`. Other content keeps WordPress's native editing flow.
The plugin enqueues a Vite IIFE bundle; Tiptap supplies the editing surface,
`tiptap-markdown` serializes the document, and `markdown-it` generates frontend
HTML. The hidden fields are named/enabled only after initialization succeeds.
Native editor UI is hidden only after that checkpoint.

Explicit form saves pass the plugin nonce and per-post capability checks; PHP
sanitizes rendered HTML and Markdown's embedded HTML. WordPress 6.4+ registered
revisioned metadata keeps Markdown alongside revisions. Core handles revision
comparison/copy/restore; an unrelated save hook must not copy stale metadata.
Local recovery uses exactly one browser-storage key per WordPress user/post.
It offers explicit restore/discard without scanning or deleting other backups.

The tradeoff is two renderers/representations to keep consistent: Markdown is the
authoring value; HTML lets normal themes render content without this JavaScript
bundle. The current prototype avoids automatic legacy conversion and production
migration. Its next useful integration work is matching Markdown and HTML in
server autosaves and previews; those are not accepted recovery paths yet.

Media uses the WordPress REST endpoint and its nonce. Embed URLs must be HTTP(S),
but arbitrary iframe origins are permitted for trusted local authors. There is
no provider allowlist, collaborative editing or full sanitization/permission
review for deployment to untrusted authors. Never use the fixture credentials
on a public server.

## Source map

| Path | Responsibility |
| --- | --- |
| `admin/src/main.ts` | Editor, toolbar, uploads, rendering, outline, recovery UI |
| `admin/src/drafts.ts` | Exact-key storage and recoverable empty drafts |
| `plugin/jazzbb-wp.php` | Eligibility, form checks, persistence and revision metadata |
| `theme/nothing-burger/` | Companion frontend presentation (MIT) |
| `scripts/wp-setup.sh` | Bounded, repeatable disposable-site setup |
| `tests/*.spec.ts` | Browser behavior, persistence, recovery and failures |
| `tests/unit/` | Offline recovery and fake-Docker setup regressions |

## Verification

Checked October 15, 2026 on macOS/Apple Silicon, Node 24.14.1, npm 11.11.0,
Chromium through Playwright 1.56.1, Docker Desktop/Engine 29.7.2, WordPress 7.1.3
and PHP 8.3.35. This is source-prototype verification, not a production or
cross-platform certification. The final executed scope is recorded below.

```sh
npm ci
npm run check
npm audit
npm run wp:setup
npx playwright install chromium  # only if the browser is not already installed
E2E_DISPOSABLE=1 npm run test:e2e
```

For an isolated second checkout, choose its own Compose name and unused port:

```sh
WP_PORT=18081 COMPOSE_PROJECT_NAME=jazzbb-example npm run wp:setup
BASE_URL=http://localhost:18081 E2E_DISPOSABLE=1 npm run test:e2e
WP_PORT=18081 COMPOSE_PROJECT_NAME=jazzbb-example npm run wp:down
```

Browser tests refuse non-loopback URLs and require the explicit disposable-site
flag. They create posts and media and may activate the companion theme. Do not
run them on real writing. Tests use fresh browser contexts and synthetic content;
no production database imports or real credentials are needed.

Lint PHP with the actual fixture runtime:

```sh
docker compose exec -T wordpress php -l /var/www/html/wp-content/plugins/jazzbb-wp/jazzbb-wp.php
```

`npm run check` is reused in the prepared GitHub workflow. Browser/container
checks remain explicit; a prepared workflow does not establish a remote CI pass.
Dependabot is configured for monthly grouped compatible proposals with a limit
of two. Hook installation is opt-in and preserves custom hooks.

## Troubleshooting and data

- Missing Docker/Compose or a port collision: stop and correct the prerequisite;
  inspect `docker compose logs db wordpress` for this project only.
- Slow first start: image pulls happen before readiness; the container readiness
  wait defaults to 90 seconds (`WP_READY_TIMEOUT`). A failed install/activation
  exits nonzero. It is not silently treated as success.
- Missing assets: run `npm run build`. Native content remains visible; saving an
  existing Markdown post without its initialized editor is rejected.
- Failed upload: the status says Upload failed and retains the current writing.
  Retry with a valid local image after correcting the connection/permission issue.
- Local storage blocked/full/corrupt: the editor warns that local recovery is
  unavailable. Save explicitly. Corrupt data is not silently deleted.
- `.data` holds this checkout's WordPress/database/uploads. Down/down -v stop
  containers but do not remove bind-mounted data. No automatic deletion/reset is
  provided. An old MySQL 8.0 `.data/db` needs its own deliberate migration; use a
  fresh disposable checkout for this configuration.

## Maintenance

Keep package/plugin/theme versions honest at 0.1.0 until a release is selected.
Use Unreleased notes for current changes; there is no tag or packaged release.
Refresh dependencies through compatible updates, audit and the full relevant
gate. Run `npm run notices` from the installed locked tree when dependencies
change. The generated notices include runtime dependency license texts; tools and
container images retain their separate upstream licenses.

The final local pass completed all 45 Chromium scenarios, five offline regressions,
strict TypeScript checking, a Vite production build, normal clean `npm ci`, and
PHP syntax checks for the plugin and every theme PHP file. The dated npm audit
reported zero vulnerabilities. Save/reload/media, restore/discard, empty drafts,
empty and nonempty revision restore, blocked storage, failed upload, native legacy
content and missing/failed assets were exercised. Server autosaves/previews,
other browsers/OSes, screen readers and remote CI remain unverified.

A first clean installation can report a WordPress CLI `HTTP_HOST` warning if it
boots before the site URL exists. Setup supplies an explicit `--url` to avoid it.
Earlier browser logs also contained an inherited NO_COLOR/FORCE_COLOR warning;
it is a runner-environment warning rather than a product deprecation.

### October 25, 2026 dependency maintenance check

Selected `markdown-it` 14.3.3, the compatible 14.x security backport for
[inline HTML parsing](https://github.com/markdown-it/markdown-it/security/advisories/GHSA-vfgh-jcmw-g37q)
and [multiline reference definitions](https://github.com/markdown-it/markdown-it/security/advisories/GHSA-gfr2-rv44-r23c).
The direct renderer, `tiptap-markdown` and `prosemirror-markdown` resolve to one
14.3.3 installation. The manifest requires at least that patch within 14.x;
the lockfile retains the package integrity hash. Regenerated third-party notices.

CI pins [checkout v7.0.1](https://github.com/actions/checkout/commit/3d3c42e5aac5ba805825da76410c181273ba90b1)
and [setup-node v7.1.0](https://github.com/actions/setup-node/commit/949feb2413d6458794dcd2491c4babbbce0c15c1)
to their full release commit hashes. Review covered the upstream signed release
references, action metadata and startup source, including Node 24 entrypoints and
the existing explicit npm cache setting. This was not a full upstream code audit
or an executed remote CI run.

Executed on macOS 27.0.1 / arm64, Node 24.14.1, npm 11.11.0, Playwright 1.56.1 /
Chromium 141.0.7390.37, Docker Engine 29.7.2 and WordPress 7.1.3 / PHP 8.3.35:

```sh
npm ci
npm run check
npm audit
npm ls markdown-it
npm run notices
```

All five offline regressions, TypeScript checking and the production build passed;
the audit reported zero vulnerabilities. The generated `plugin/build/admin.js.map`
contains exactly one copy each of the patched inline-HTML and reference rules,
with source content matching the installed package. Independent clean builds in
the source directory and disposable copy produced identical JavaScript and CSS.
Build output remains ignored and must be regenerated when installing the plugin.

Used a new source-only copy under `/private/tmp`, without Git metadata, site data
or browser profiles, and its own Compose project `jazzbb-wp-security-20261025`:

```sh
npm ci
npm run build
WP_PORT=18085 COMPOSE_PROJECT_NAME=jazzbb-wp-security-20261025 npm run wp:setup
BASE_URL=http://localhost:18085 E2E_DISPOSABLE=1 npm run test:e2e
docker compose -p jazzbb-wp-security-20261025 exec -T wordpress sh -c \
  'find /var/www/html/wp-content/plugins/jazzbb-wp /var/www/html/wp-content/themes/nothing-burger -name "*.php" -print0 | xargs -0 -n1 php -l'
WP_PORT=18085 docker compose -p jazzbb-wp-security-20261025 down
```

All 48 Chromium scenarios passed, including the existing visual checks and new
reference/inline-HTML clipboard-to-save/reload pairing. Both the frontend renderer
and Tiptap's bundled Markdown parser passed the six advisory payload checks:
64,000 repeated openers for each of four inline HTML constructs, a 200,000-line
unclosed reference title and a 20,000-line unclosed label, each within a five-second
budget. Plugin and theme PHP lint passed in the declared WordPress container.
The browser runner emitted only the inherited NO_COLOR/FORCE_COLOR warning.

The stress tests isolate parser work from the rest of clipboard handling. A
separate 200,000-line clipboard probe completed Markdown parsing in about 106 ms
but exceeded a ten-second browser round-trip deadline after paste dispatch;
whole-editor rendering of huge pasted documents remains unbounded. Other
browsers/OSes, server autosaves/previews and remote CI remain unverified.
