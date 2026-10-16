# Contributing

Start with the README and [development notes](docs/DEVELOPMENT.md). Keep fixes
small and describe the affected writing/recovery flow, reproduction, expected
behavior, verification and remaining limits. Use synthetic content in bug reports.
Do not include real sites, accounts, tokens or unpublished writing.

Run `npm ci` and `npm run check`. Use a disposable local WordPress installation for
`E2E_DISPOSABLE=1 npm run test:e2e`; tests create posts and media. Add a browser
regression for a behavior change and rerun the full suite. PHP changes also need
container lint and the relevant save/revision/failure checks.

`npm run hook:install` opts into a quick typecheck/unit-test hook. It preserves an
existing custom hook or hooksPath by refusing to replace it. Installation never
stages, formats, installs dependencies or runs Docker/browser work automatically.

When changing dependencies, run `npm audit`, inspect installation/build/runtime
warnings and regenerate the third-party notices with `npm run notices`. Update
Unreleased notes. 0.1.0 has no automatic release, package or publication pipeline;
keep releases and any source-sharing decisions manual.
