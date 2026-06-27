// Smart, fast pre-commit checks (runs only on staged files).
// Philosophy: auto-fix formatting, block ONLY on real errors (warnings pass).
// No test suite / no Tauri build here — kept fast and low-friction.
export default {
  // JS/TS: auto-format, then lint errors-only (--quiet hides warnings).
  '*.{ts,tsx,js,jsx,mjs,cjs}': [
    'prettier --write --ignore-unknown',
    'eslint --quiet --no-warn-ignored',
  ],

  // Markup / styles / data: auto-format only.
  '*.{html,scss,css,json,md,yml,yaml}': 'prettier --write --ignore-unknown',

  // Rust: auto-format staged files (rustfmt re-stages them), then clippy on the
  // crate. No `-D warnings`, so clippy blocks on errors but lets warnings pass.
  '*.rs': [
    'rustfmt --edition 2021',
    () => 'cargo clippy --manifest-path apps/desktop/src-tauri/Cargo.toml',
  ],
};
