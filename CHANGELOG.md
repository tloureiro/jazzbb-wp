# Changelog

## Unreleased

- Update the shared `markdown-it` parser to 14.3.3 for the inline-HTML and
  multiline-reference denial-of-service fixes; exercise both bundled parsers and
  clipboard/save integration in Chromium.
- Pin CI checkout and Node setup actions to reviewed release commit hashes.
- Replace broad autosave-backup deletion with explicit per-user/post Markdown
  recovery, including empty drafts and visible storage failures.
- Keep native editing for existing HTML/block posts and missing assets. Reject
  incomplete saves for existing Markdown posts to preserve paired content.
- Use core revisioned metadata, per-post permissions and slashing-safe persistence.
- Reject unsafe iframe URL schemes and report failed media uploads.
- Bound fixture readiness, propagate setup failures, retain existing installations,
  restrict demo networking and pin the tested WordPress version.
- Refresh compatible dependency security fixes and add typecheck/offline checks,
  recovery/revision/fallback browser regressions, contributor docs and opt-in hooks.
- Adopt GPL-2.0-or-later with third-party notices.

## 0.1.0 source prototype

Existing plugin, Tiptap Markdown editor, media integration, companion theme and
browser scenarios. No packaged release or support promise is implied by this version.
