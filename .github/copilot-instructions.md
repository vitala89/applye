# Applye Copilot Instructions

**Score the task first.** Before any other step, score it on five axes from `docs/ai/model-policy.md` -
blast radius, ambiguity, risk, verification, unknowns, 0-2 each - and print the verdict with the
per-axis digits, the model role, the effort and the token budget. Escalate context before escalating
the model: a cheap model with the right three files beats a frontier model with none. Ambiguity scored
2 goes to the grilling gate before any edit. Copilot has no per-prompt enforcement mechanism here, so
this rule is **advisory** - it holds only while it is being followed deliberately.

Start every non-trivial task at `docs/internal/AGENT_START_HERE.md` and follow `AGENTS.md`.

Before writing or reviewing code:

- Read `docs/governance/CODE_QUALITY.md` and the relevant Angular or Rust skill.
- Check the responsibility and current non-empty line count of every file you plan to grow.
- New TypeScript/JavaScript source files must stay within 400 non-empty lines, **application-layer
  stores within 250**, Angular templates within 300, stylesheets within 400, and Rust source modules
  within 500 with inline tests counted separately at 600. Existing oversized files may not grow.
- **A component renders and delegates.** It does not hold the state of its own screen and does not
  inject `DbService` - that state belongs in a signal store in `libs/application` (`ADR-0005`), and lint
  fails on a `*.component.ts` that injects the gateway unless it is on the shrinking allowlist in
  `eslint.config.mjs`.
- Extract cohesive responsibilities instead of creating monolithic components, services, commands,
  or modules.
- Apply SOLID pragmatically, keep domain logic pure where practical, keep I/O at explicit boundaries,
  and use typed contracts across Angular, Tauri IPC, Rust, and SQLite.
- Identify the test seam first. Bug fixes require regression tests.
- Use configured documentation MCP tools only for minimal versioned API questions. Never send source
  code, secrets, personal data, CV/job content, credentials, or private prompts.

Before handoff, run the relevant validation matrix checks plus `npm run quality:file-size`,
`npm run quality:attribution`, `npm run format:check`, and `git diff --check`.

Never include `Co-authored-by`, `Signed-off-by`, generated-by text, model names, agent names, or
similar attribution in commits or pull requests. Commits are authored only by the configured
repository Git user.
