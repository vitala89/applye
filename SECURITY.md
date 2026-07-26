# Security Policy

Applye is a local-first desktop app: your data lives in a local SQLite database, there is no
server, no account, and no telemetry. That design removes whole classes of risk, but the app still
handles sensitive material (your CV, application history, API keys), so security reports are taken
seriously.

## Supported versions

Only the latest release line receives security fixes.

| Version              | Supported          |
| -------------------- | ------------------ |
| latest `0.x` release | Yes                |
| older releases       | No - please update |

## Reporting a vulnerability

**Please do not open a public issue for security problems.**

Preferred channel: [GitHub private vulnerability reporting](https://github.com/vitala89/applye/security/advisories/new)
("Report a vulnerability" on the Security tab).

Alternative: email **security@applye.dev** with subject `[SECURITY] Applye`.

Include if you can:

- affected version and OS,
- steps to reproduce or a proof of concept,
- impact assessment (what an attacker gains).

## What to expect

- **Acknowledgement** within 72 hours.
- **Assessment and fix plan** within 14 days for confirmed issues.
- Credit in the release notes if you want it (or anonymity if you prefer).

Please give a reasonable window to ship a fix before public disclosure.

## Scope notes

Especially interested in:

- anything that makes user data leave the machine without an explicit user action,
- API key storage or transmission issues,
- Tauri IPC boundary problems (frontend invoking commands it should not),
- injection via pasted job descriptions or fetched Discover feeds (untrusted input paths),
- dependency vulnerabilities that are actually reachable in Applye.

Out of scope: issues requiring full local machine compromise, social engineering of the user, and
vulnerabilities in third-party AI providers or job boards themselves.
