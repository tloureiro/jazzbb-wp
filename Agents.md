# Agent and contributor notes

Read README.md and docs/DEVELOPMENT.md. Keep the personal local-prototype scope.
No commits, pushes, publication or account operations unless the owner requests
that action. Preserve existing edits and never use an existing site as a fixture.

## Source map and invariants

- `admin/src/main.ts`: Tiptap setup, toolbar, Markdown/HTML sync, media and outline.
- `admin/src/drafts.ts`: exact user/post local-recovery keys; never scan/clear other
  storage. Preserve empty drafts and surface storage errors.
- `plugin/jazzbb-wp.php`: WordPress integration, eligibility, form authorization,
  sanitization and registered revisioned metadata. Keep nonce and per-post capability
  checks. Never accept generated fields before the client initializes them.
- `theme/nothing-burger/`: companion frontend theme, separate from editor behavior.
- `scripts/wp-setup.sh`: local fixture only; retain content, propagate real errors,
  bound readiness, and bind HTTP to loopback. Do not expose MySQL.
- `tests/`: real browser behavior plus isolated offline recovery/setup regressions.

Markdown and HTML must stay paired on explicit save and revision restore. Existing
non-Markdown posts and missing assets retain native editing; incomplete submissions
for Markdown posts must fail without altering stored content. WordPress 6.4+ owns
revisioned metadata; do not reintroduce manual copying at the wrong save hook.
Do not claim server autosave recovery without testing both representations.

Use synthetic posts/media in a separate checkout/Compose project. Do not start,
stop, reset, import, copy or remove someone else's site, database or browser data.
Read scripts before running. Keep runtime data, logs and credentials out of Git.
Keep project documentation about the product and its actual limits.

## Quality gate

Run `npm run check` and `npm audit`; inspect warnings as well as exit status.
A behavior change needs a meaningful browser/visual regression and the full
`E2E_DISPOSABLE=1 npm run test:e2e` suite against a disposable loopback site.
Record commands, platform and uncovered paths. PHP syntax/integration checks run
in the declared WordPress container. Do not treat prepared CI as a remote pass.
Full browser/container workloads belong outside the quick pre-commit hook.

Preserve third-party notices, honest AI contribution and source version history.
Change only what solves an observed problem; avoid speculative frameworks/features.
