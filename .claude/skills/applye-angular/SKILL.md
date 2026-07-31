---
description: Angular conventions for Applye - layers, signals, components, styles, i18n, tests, lint, maintainability, and file-size budgets. Use whenever writing or reviewing TypeScript, HTML, or SCSS in apps/desktop, apps/web, or libs.
---

# Applye Angular Conventions

Angular 21, standalone, zoneless, Nx monorepo. These rules apply to every change in
`apps/desktop/src`, `apps/web/src`, and `libs/`. Architecture context lives in
[`docs/architecture.md`](../../../docs/architecture.md). The cross-stack quality contract is
[`docs/governance/CODE_QUALITY.md`](../../../docs/governance/CODE_QUALITY.md) and must be read before editing.

## Before editing

- Use the Angular CLI MCP `get_best_practices` and `search_documentation` tools when the task depends
  on version-specific Angular behavior. The server is configured read-only.
- Check the current line count and responsibilities of every file you plan to grow.
- Identify the test seam before implementation.
- Existing files above budget may not grow. Extract first.

## Layers - check before you import

The dependency stack points one way only:

| Project | Tags | May depend on |
| --- | --- | --- |
| `core` | `type:domain scope:shared` | nothing |
| `ui` | `type:ui scope:shared` | `core` |
| `i18n` | `type:util scope:shared` | `core` |
| `data` | `type:data scope:desktop` | `core` |
| `desktop` | `type:app scope:desktop` | `core` `ui` `i18n` `data` |
| `web` | `type:app scope:web` | `core` `ui` `i18n` (not `data`) |

- `@nx/enforce-module-boundaries` fails lint on a wrong-way edge. If it fires, move the code rather
  than loosening the rule.
- `data` wraps Tauri IPC and is `scope:desktop`. The web app has no Tauri runtime and must never
  import it.
- Import from the entry point, for example `@applye/core`, never an internal library path.
- A new library needs `tags` in `project.json` and an entry in `tsconfig.base.json` paths.

## Components

- **Standalone**, always. No NgModules.
- **`changeDetection: ChangeDetectionStrategy.OnPush`** on every new component.
- **Use `templateUrl` and `styleUrl`**, not large inline templates or styles.
- **Hard budgets:** 400 non-empty lines for TypeScript/JavaScript source, 300 for templates, and 400
  for stylesheets. Tests have a 600-line budget. The ratchet is enforced by
  `npm run quality:file-size`.
- A component approaching 400 lines or holding roughly 15 signals needs a responsibility review.
  Extract a child component, facade/store, domain helper, or focused service before it exceeds the
  limit.
- Do not split by arbitrary line ranges. Extract a cohesive responsibility with an explicit API.
- Use `inject()` over constructor parameters and declare dependencies `private readonly`.
- Selector prefixes: `app-` in apps, `lib-` in libraries; elements kebab-case, attributes camelCase.
- Inputs and outputs use signal APIs (`input()`, `input.required()`, `output()`), not decorators.

## State and responsibilities

- Component-local view state uses `signal()` and `computed()`.
- State that outlives a component, or that two features share, belongs in a focused service/store.
- Long workflows belong in services, not in the page that happens to start them.
- Never call `invoke()` from a component. Every Tauri call goes through `libs/data`.
- Parsing, scoring, validation, mapping, and other reusable business rules belong in `libs/core` as
  pure functions where practical.
- Keep services cohesive. A service should not become a second monolithic component.
- Prefer typed request objects when a method would otherwise need more than four parameters.

## Templates

- Use built-in control flow (`@if`, `@for`, `@switch`), not `*ngIf` or `*ngFor`.
- `@for` requires a stable `track` expression, not `$index`, for reorderable items.
- Keep logic out of templates. A template method that computes should normally be a `computed`.
- Use `@defer` for content below the fold or behind an interaction when it improves the real flow.
- Extract child components around meaningful UI responsibilities before the template reaches 300
  non-empty lines.

## Styles

- **Tokens only.** Use the shared Applye variables instead of raw values when a canonical token
  exists.
- Component styles stay scoped to the component. Extract a shared partial only for genuinely shared
  behavior.
- Both light and dark themes must work.
- Use `@use`, never deprecated `@import`.
- Split styles by component/responsibility before 400 non-empty lines.

## i18n

- No user-facing string in a template or TypeScript file. Everything goes through `libs/i18n`.
- Add every new key to all six locales (`en`, `de`, `ru`, `es`, `fr`, `uk`).

## Tests

- Jest tests are colocated as `*.spec.ts` next to the unit under test.
- Test pure functions instead of components when a pure seam exists.
- A bug fix ships with the regression test that would have caught it.
- Extracted logic keeps equivalent or improved coverage before the old implementation is removed.
- Split test files by behavior or unit before 600 non-empty lines.
- Run the narrowest useful command first, then widen when the change is shared or cross-cutting.

## Before handoff

```bash
npm run quality:file-size
npx nx run-many --target=lint
npx nx run-many --target=type-check
npx nx run-many --target=test
npm run format:check
git diff --check
```

- Formatting is Prettier via `nx format:write`.
- Lint errors block. Do not add new warnings casually.
- Report before/after line counts for touched files near or above budget.
- Never claim a command passed unless it was run and observed.

## Documentation sources

Prefer the first-party Angular CLI MCP for Angular workspace analysis, best practices, and official
Angular documentation. Use Context7 only for minimal versioned documentation queries for Angular,
Nx, TypeScript, Jest, and related libraries. Never send source code, secrets, personal data, CV/job
content, credentials, or private prompts to a documentation MCP. Verify security-sensitive claims
against official docs and the installed versions.
