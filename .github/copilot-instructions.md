# Applye Copilot Instructions

**Score the task first.** Before any other step, score it on five axes from `docs/ai/model-policy.md` -
blast radius, ambiguity, risk, verification, unknowns, 0-2 each - and print the verdict with the
per-axis digits, the model role, the effort and the token budget. Escalate context before escalating
the model: a cheap model with the right three files beats a frontier model with none. Ambiguity scored
2 goes to the grilling gate before any edit. Copilot has no per-prompt enforcement mechanism here, so
this rule is **advisory** - it holds only while it is being followed deliberately.

Start every non-trivial task at `docs/internal/AGENT_START_HERE.md` and follow `AGENTS.md`.

Before designing, writing, refactoring, or reviewing code:

- Read `docs/domain-architecture.md` for pragmatic DDD, bounded contexts, ubiquitous language, and canonical business naming.
- Read `docs/architecture.md` and the applicable ADRs for system, frontend, backend/Tauri, dependency, and state-ownership decisions.
- Read `docs/governance/CODE_QUALITY.md` for code style, maintainability, layer ownership, and the authoritative file-size budgets, plus the relevant Angular or Rust skill.
- Read `docs/governance/VALIDATION_MATRIX.md` before choosing verification.
- Check the responsibility and current non-empty line count of every file you plan to grow. Existing oversized files may not grow.
- A component renders and delegates. It does not hold the state of its own screen and does not inject a data gateway; screen state belongs in `libs/application` (`ADR-0005`).
- Extract cohesive responsibilities instead of creating monolithic components, services, commands, or modules.
- Apply SOLID pragmatically, keep domain logic pure where practical, keep I/O at explicit boundaries, and use typed contracts across Angular, Tauri IPC, Rust, and SQLite.
- Identify the test seam first. Bug fixes require regression tests.
- Do not invent business vocabulary, architectural conventions, layer boundaries, folder structures, or size limits when the repository already defines them. If documentation and code disagree, report and resolve the conflict deliberately.
- Use configured documentation MCP tools only for minimal versioned API questions. Never send source code, secrets, personal data, CV/job content, credentials, or private prompts.

`docs/internal/AGENT_START_HERE.md` is the canonical map for the concerns sometimes named `DDD_ARCHITECTURE.md`, `UBIQUITOUS_LANGUAGE.md`, `ARCHITECTURE_GUIDELINES.md`, `BACKEND_ARCHITECTURE.md`, `FRONTEND_ARCHITECTURE.md`, `CODE_STYLE.md`, and `AGENT_DEVELOPMENT_RULES.md`. Applye keeps one authoritative source per concern rather than duplicate files that can drift.

Before handoff, run the relevant validation matrix checks plus `npm run quality:file-size`,
`npm run quality:attribution`, `npm run format:check`, and `git diff --check`.

Never include `Co-authored-by`, `Signed-off-by`, generated-by text, model names, agent names, or
similar attribution in commits or pull requests. Commits are authored only by the configured
repository Git user.
