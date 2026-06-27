# Reference screens — Applye Design System

Source of truth: **Applye Design System** on claude.ai/design
`https://claude.ai/design/p/e4e99cf3-f8fd-4c5d-828b-3a1530fcf0f5`

The reference screenshots and the live UI-kit specimens live in that project
under `uploads/` and `ui_kits/dashboard/`. They exceed the design MCP's 256 KiB
per-file transfer cap, so they are not vendored here as binaries (a truncated
PNG is worse than a pointer). Pull them manually from the project when needed:

- `uploads/applye-design.png`            — full design reference board
- `uploads/Screenshot … 16.16.48.png`    — key screen
- `uploads/Screenshot … 16.16.55.png`    — key screen
- `ui_kits/dashboard/index.html`         — dashboard UI kit (HTML specimen)

What WAS extracted into the repo: the complete token system →
`libs/ui/tokens.css` (colors, type scale, spacing, radii, shadows, motion,
dark + light themes). That is the part the app consumes.
