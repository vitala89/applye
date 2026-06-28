# Applye

**A local-first desktop companion for the job hunt — it sharpens your applications, it never sends them for you.**

Applye helps job seekers track applications, sanity-check job descriptions, tailor a CV per role, and
prepare for interviews. It runs offline for everything that matters; AI is opt-in, brings its own keys,
and is frugal with tokens by design. Built for the German/EU market first.

> **Status:** private during active development. This repository goes **public after my next job change** —
> it doubles as a working portfolio piece and a tool I use on myself.

---

## Augmentation, not automation

This is the first principle, and everything else bends to it.

**AI assists. You decide.** Applye will never auto-apply, auto-send, or auto-submit anything on your
behalf. It scores, drafts, and suggests — then hands control back to you. Every AI output is a proposal
you read, edit, and accept or throw away. No background agent is quietly representing you to a recruiter.

Why this matters:

- A recruiter or hiring manager is a person, and the relationship is yours, not a bot's.
- Mass-automated applications are noise; a tool that helps you send _fewer, better_ ones is the point.
- You stay accountable for every word that goes out under your name.

If a feature ever requires giving up that control, it doesn't ship.

## Local-first & private

- **Offline by default.** Your profile, job list, notes, and generated documents live in a local
  SQLite database on your machine. Core workflows work with no network at all.
- **No accounts, no telemetry, no cloud sync.** Nothing about your search leaves the device unless
  _you_ trigger an AI call, and even then only the minimum needed for that one request is sent.
- **GDPR-friendly because there's nothing to leak** — there is no server holding your data.

## Bring your own AI

Applye doesn't bundle a model or resell tokens. You wire in the AI you already pay for:

- **API key** — point Applye at a provider API (e.g. Anthropic Claude) with your own key.
- **CLI bridge** — or route through a local AI CLI you already have (Claude Code, Codex, Gemini, …).

Either way the keys are yours, the billing is yours, and you can run the whole app with AI features
switched off.

## Token economy

AI is treated as a scarce, paid resource — not sprinkled everywhere:

- **Everything is cached.** Identical inputs never pay twice (`jd_hash → scoring`, `input_hash → output`).
- **Opt-in calls only.** Nothing hits a model until you ask it to.
- **Frugal prompts.** Features are scoped to the smallest useful request, so a real job search costs
  cents, not a subscription.

## On source legality

Applye is a tool you point at job descriptions **you** are already looking at. It does not scrape job
boards, bypass logins, or harvest postings at scale. You paste in the text of a role you found; Applye
helps you respond to it. Respect the terms of service of any site you use — the app is built to keep
you on the right side of them by never automating collection.

## The core loop

1. **Paste** a job description.
2. **Check** — a quick HR/fit read on the role (opt-in AI).
3. **Tailor** — a 3-pass CV pass that adapts your profile to the posting, exported to DOCX/PDF.
4. **Track** — drop the application into a Kanban pipeline that records status history automatically.
5. **Prep** — gather interview notes against the role.

> 📸 **Screenshots / a GIF of the core loop land here** once the UI stabilizes. Drop captures in
> `docs/assets/` and link them below; the current screen set lives in `design/screens/`.

<!-- ![Core loop — paste, check, tailor, track](docs/assets/core-loop.gif) -->

## Run locally

**Prerequisites:** Node 20+, Rust (stable, 2021 edition), and the
[Tauri 2 system dependencies](https://v2.tauri.app/start/prerequisites/) for your OS.

```bash
git clone <repo-url> applye
cd applye
npm install

npm run desktop:dev      # launch the Tauri + Angular app in dev mode
```

Other useful scripts:

```bash
npm run desktop:build    # production build of the desktop app
npm test                 # run the test suite
npm run lint             # lint all projects
npm run type-check       # type-check all projects
```

AI features are off until you add a key or CLI bridge in **Settings**. The app is fully usable without them.

## Tech stack

Tauri 2 · Rust 2021 · SQLite (sqlx) · Angular 21 · TypeScript · NgRx Signals · Angular CDK

It's an [Nx](https://nx.dev) monorepo: a Tauri desktop app, an Angular landing site, and shared
`core` / `data` / `ui` / `i18n` / `skills` libraries. See [`docs/architecture.md`](docs/architecture.md)
for the layout and the [decision filter](docs/decision-filter.md) every change is checked against.

## License

[MIT](LICENSE) © 2026 Vitalii
