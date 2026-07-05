# Security Policy

Security review is required for changes involving:

- Authentication or authorization.
- Secrets, tokens, credentials, or environment variables.
- Shell commands or script execution.
- Dependencies or package manager changes.
- MCP, plugins, browser automation, or external tools.
- Network access, file system permissions, or sandbox boundaries.

## Rules

- Do not create real secrets.
- Do not weaken permission checks.
- Do not install dependencies in AIF foundation work.
- Prefer explicit allowlists over broad access.
- Document residual risk in the PR summary.
