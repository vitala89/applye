# Commit Conventions

Applye uses Conventional Commits so history stays searchable, changelog-friendly, and easy to review. A commit should explain the user-facing or maintenance intent, not just list files.

## Format

```text
<type>(<scope>): <summary>
```

Use English, imperative style where possible, and keep the header under 90 characters. Do not mention AI-generated code in commit messages.

## Allowed Types

- `feat`: user-visible capability.
- `fix`: bug fix.
- `refactor`: behavior-preserving code restructuring.
- `test`: tests or test fixtures.
- `docs`: documentation only.
- `style`: formatting or visual style with no behavior change.
- `chore`: maintenance.
- `build`: build system or dependency plumbing.
- `ci`: CI configuration.
- `perf`: performance improvement.
- `revert`: revert a previous commit.

## Recommended Scopes

- `jobs`
- `applications`
- `profile`
- `notifications`
- `storage`
- `sync`
- `plugins`
- `mcp`
- `ai`
- `ui`
- `auth`
- `docs`
- `repo`
- `tauri`
- `angular`

## Good Examples

- `feat(jobs): add saved jobs empty state`
- `fix(storage): preserve application notes during migration`
- `docs(ai): add commit workflow`
- `refactor(ui): simplify status badge variants`
- `test(applications): cover status transition history`

## Bad Examples

- `update files`
- `changes`
- `fix stuff`
- `misc`
- `wip`
- `ai changes`

## Commit Bodies

Use a body when the header cannot explain the reason, behavior, or risk clearly enough. The body should explain what changed and why.

If a change touches privacy, storage, sync, auth, notifications, plugins, MCP, external sources, or user data, mention the behavior or risk in the body. Keep the note concrete.

Example:

```text
fix(storage): preserve application notes during migration

The migration now copies existing notes into application comments before
clearing the legacy field. This avoids losing user-entered application history.
```

## When To Split Commits

Split commits when staged changes are unrelated, cross multiple independent features, mix refactors with behavior changes, or combine risky data/security changes with routine cleanup.

Prefer one coherent reason per commit. If the staged diff is too broad to describe with one specific header, write multiple smaller commits.

## Local Commit Template

Enable the template locally with:

```sh
git config commit.template .gitmessage
```

This only updates local Git configuration. It does not install dependencies or configure hooks.

## Not Enforced Yet

Commitlint is intentionally not added yet. Git hooks are intentionally not configured yet. This workflow is documentation and agent guidance only.
