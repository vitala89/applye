# Applye Copilot Instructions

Start every non-trivial task at `docs/internal/AGENT_START_HERE.md` and follow `AGENTS.md`.

Before writing or reviewing code:

- Read `docs/governance/CODE_QUALITY.md` and the relevant Angular or Rust skill.
- Check the responsibility and current non-empty line count of every file you plan to grow.
- New TypeScript/JavaScript source files must stay within 400 lines, Angular templates within 300,
  stylesheets within 400, and Rust modules within 800. Existing oversized files may not grow.
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
