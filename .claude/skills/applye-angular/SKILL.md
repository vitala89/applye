---
description: Angular conventions for Applye - layers, signals, components, styles, i18n, tests, lint. Use whenever writing or reviewing TypeScript, HTML, or SCSS in apps/desktop, apps/web, or libs.
---

# Applye Angular Conventions

Angular 21, standalone, zoneless, Nx monorepo. These are the rules that apply to every change in
`apps/desktop/src`, `apps/web/src`, and `libs/`. Architecture context lives in
[`docs/architecture.md`](../../../docs/architecture.md).

## Layers - check before you import

The dependency stack points one way only:

| Project   | Tags                       | May depend on                   |
| --------- | -------------------------- | ------------------------------- |
| `core`    | `type:domain scope:shared` | nothing                         |
| `ui`      | `type:ui scope:shared`     | `core`                          |
| `i18n`    | `type:util scope:shared`   | `core`                          |
| `data`    | `type:data scope:desktop`  | `core`                          |
| `desktop` | `type:app scope:desktop`   | `core` `ui` `i18n` `data`       |
| `web`     | `type:app scope:web`       | `core` `ui` `i18n` (not `data`) |

- `@nx/enforce-module-boundaries` fails lint on a wrong-way edge. If it fires, the fix is to move
  the code, not to loosen the rule.
- `data` wraps Tauri IPC and is `scope:desktop`. The web app has no Tauri runtime - never import it
  there.
- Import from the entry point: `@applye/core`, never `@applye/core/lib/models/job.model`.
- A new library needs `tags` in its `project.json` and an entry in `tsconfig.base.json` paths.

## Components

- **Standalone**, always. No NgModules.
- **`changeDetection: ChangeDetectionStrategy.OnPush`** on every new component. It is not the
  framework default in 21.2 (`onPush` is set only when you ask for it), but `Default` is already
  deprecated in favour of `Eager` and the default is flipping - write OnPush now.
- **`templateUrl` and `styleUrl`, not inline**, for anything longer than a few lines. Inline
  templates hide size: a component whose class starts on line 2331 is unreviewable, and that is
  exactly how `jobs.component.ts` reached 4975 lines.
- **Size budget: ~400 lines of class, ~300 of template.** Past that, extract a child component or a
  service. If a component holds more than roughly 15 signals it is doing more than one job.
- **`inject()` over constructor parameters.** Declare dependencies `private readonly`.
- Selector prefixes: `app-` in apps, `lib-` in libraries; elements kebab-case, attributes camelCase.
- Inputs and outputs use the signal APIs (`input()`, `input.required()`, `output()`), not the
  decorators.

## State

- Component-local state is `signal()` and `computed()`. Never a plain mutable field that the
  template reads - with OnPush it will not repaint.
- State that outlives a component, or that two features share, goes into an NgRx `SignalStore` in
  `libs/data/src/lib/stores/`.
- Orchestration that spans several screens (a wizard, a generation pipeline) belongs in a service,
  not in the component that happens to host the first step. `tailor-score.service`,
  `document-gen.service` and `wizard-progress.service` are the pattern to follow.
- Never call `invoke()` from a component. Every Tauri call goes through a service in `libs/data`.

## Templates

- Built-in control flow (`@if`, `@for`, `@switch`), not `*ngIf` / `*ngFor`.
- `@for` requires a `track` expression - use a stable id, not `$index`, for anything reorderable.
- No logic in templates beyond a signal read or a `computed`. If the template calls a method that
  computes something, that method should be a `computed`.
- `@defer` for anything below the fold or behind an interaction.

## Styles

- **Tokens only.** `var(--space-3)`, `var(--text-secondary)` - never a raw hex or px value that
  duplicates an existing token. Tokens live in `libs/ui/src/styles/` and both apps `@use` the same
  `global`.
- Component styles stay in the component's own `.scss` and are scoped by Angular. Reach for a
  shared partial only when two features genuinely need the same block.
- Both light and dark themes must work. A colour that only reads in one of them is a bug.
- `@use`, never `@import` (deprecated in Dart Sass, and the build already warns about the remaining
  ones).

## i18n

- No user-facing string in a template or a `.ts` file. Everything goes through `libs/i18n`.
- A new key must be added to **all six** locales (`en`, `de`, `ru`, `es`, `fr`, `uk`). A missing key
  renders as the key itself, which ships as a visible bug.

## Tests

- Jest, colocated as `*.spec.ts` next to the unit under test.
- Test the pure function, not the component, where a pure function exists - that is why
  `libs/core` holds the domain logic.
- A bug fix ships with the regression test that would have caught it.
- Run the narrowest useful command: `npx nx test desktop`, `npx nx test core`, or
  `npx nx affected --target=test`.

## Before you hand work back

```bash
npx nx run-many --target=lint
npx nx run-many --target=type-check
npx nx run-many --target=test
npm run format:check
```

- Formatting is Prettier via `nx format:write` - never hand-format, never fight it.
- Lint errors block. The pre-existing `no-non-null-assertion` warnings are tolerated; do not add
  more.
- `git diff --check` before committing.

## Reference

For current Angular APIs and idioms, prefer the Angular CLI MCP server (`ng mcp`, wired in
`.mcp.json`) or the Context7 docs tool over recall - this codebase is on a version newer than most
training data, and several defaults (zoneless, `Eager`, signal inputs) changed recently.
