# Architecture Decision Record: Pro Entitlements - Server-Anchored, MIT-Compatible

- **Status**: `draft`
- **Date**: 2026-07-07
- **Related**: [ADR-0001](ADR-0001-ai-key-monetization.md), [managed-tier-implementation-plan.md](../managed-tier-implementation-plan.md)

---

## Context

ADR-0001 established the three-tier AI access model (Free BYOK → Bridge →
Managed proxy). A separate question remained: can Applye sell a **Pro
feature tier** on top of the managed subscription - the way peers like
Natively do (Lifetime/Yearly license unlocking power-user features)?

Natively can do client-side Pro unlocks because they ship under a
**source-available "personal/non-commercial" license** - removing the Pro
gate is a license violation. **Applye is MIT.** Under MIT, any client-side
`isPro` boolean can be legally flipped by a fork. A pure client-unlocked
Pro feature has **no enforcement** - the gate is theatre.

This ADR decides how Pro features are gated without breaking the MIT license
or the open/local/privacy-first positioning.

## Decision

**Pro is a set of server-anchored capabilities, not client-unlocked local
features.** Enforcement lives where a fork cannot reach - the Applye backend.
No new client-authoritative entitlement state.

### Enforceability rule (the crux)

| Feature type                                    | Enforceable under MIT?               | Verdict          |
| ----------------------------------------------- | ------------------------------------ | ---------------- |
| Server-backed (needs a round-trip to our infra) | ✅ fork lacks token → server refuses | **Pro-eligible** |
| Local-only, gated by client flag                | ❌ fork strips the check             | **Never gate**   |

A Pro feature MUST require our backend to do its work. If it runs fully
offline, it is either free or it is not a Pro feature. This is the same moat
as ADR-0001: **code is commodity, the managed service is the moat a fork
can't copy.**

### Mechanism - rides the managed-tier seam, zero new architecture

Pro reuses the ADR-0001 subscription token (OS keychain, never exposed to
JS) as the **entitlement bearer**. The managed dispatch branch in
`apps/desktop/src-tauri/src/ai/api.rs` (`ai::api::run()`) already carries
`Authorization: Bearer <sub-token>`. Pro gating rides that same token:

```
proxy validates token → account → plan
  ├─ base plan requests premium model → 403 {code:"upgrade_required"}
  ├─ quota exhausted                  → 402 {code:"quota"}
  └─ entitled                          → forward
```

1. **No `proTier` boolean on the client.** Settings gains only
   `aiTier: 'direct' | 'managed'` (ADR-0001 A1). Any Pro state the client
   holds is a **non-authoritative UI hint**, never the enforcement point.
2. **Enforcement = proxy 402/403.** The client maps these to an upsell toast
   (managed-tier plan A6 already covers proxy error surfacing). Pro gating
   adds no new client authority.
3. **Optional `/entitlements` endpoint** - `token → {tier, features[], exp}`,
   cached in Settings purely to gray out UI the plan can't use. Forging the
   cache only yields an active button that fails server-side. Enforcement is
   never the cache.
4. **Model-tier restriction** (managed-tier plan B3) is exactly where the
   first Pro gate sits - cheap model on base plan, premium models Pro-only.

### Pro feature candidates (all server-backed)

- Managed AI with no BYOK required (base managed sub).
- Premium model access (Opus-tier) - base plan restricted to economy model.
- Hosted bundle: web-search / job enrichment via proxy (the "1 key = all"
  pitch borrowed from Natively).
- Cross-device profile sync (server-stored, opt-in).
- Higher quota / spend cap.

Each dies without a valid token. All MIT-safe.

## Options Considered

- **Option 1: Server-anchored Pro on the managed token** - chosen.
  - Pros: enforceable under MIT; zero new architecture (rides ADR-0001 seam);
    keeps open-source positioning and OSI badge; single seam covers managed +
    Pro; matches ADR-0001 moat logic.
  - Cons: Pro features are constrained to server-backed capabilities - no
    local-only unlocks; requires the managed backend to exist first.

- **Option 2: Client-side Pro license (Natively-style)** - rejected.
  - Pros: can gate local-only features; second revenue stream independent of
    managed infra.
  - Cons: **incompatible with MIT** - a fork strips the check legally; the
    gate is unenforceable theatre. Would only work under relicensing.

- **Option 3: Relicense to source-available, then client Pro** - rejected
  for now (see below).

## Licensing analysis - why we stay MIT

Relicensing to source-available (Natively's model) was evaluated and
**rejected unless a concrete local-only Pro feature demands it.**

**Would gain**: right to gate any feature incl. local-only; right to forbid
commercial use / forked resale.

**Would lose**:

- **OSI "open source" status** - the "free open-source alternative" pitch
  (our positioning vs closed competitors) breaks at its foundation.
- **Privacy narrative erodes** - "fork and verify / run it yourself freely"
  is part of the trust story; source-available keeps _readable_ but drops
  _freely runnable/modifiable_.
- **Distribution channels** - Homebrew core, Linux distros, F-Droid reject
  non-OSS licenses.
- **Contributor friction** - external contributors need a CLA or walk away;
  community momentum slows.

**Gotchas**:

- Relicensing binds **future commits only**. Already-MIT code stays MIT
  forever - a fork of the last MIT commit continues fully open. We control
  only new code.
- Requires consent of **all** copyright holders. Solo author now → trivial.
  Once external contributors merge without a CLA → their code must be removed
  or re-signed. **The window closes over time.**

For a privacy-first app whose pitch _is_ "open + local", relicensing hits the
core differentiator. Not worth it absent a hard local-Pro requirement.

## Implications & Consequences

### Consequences

- **Positive**: Pro monetization with zero incremental client architecture;
  MIT and open-source positioning fully intact; one seam (managed token)
  serves both managed AI and Pro entitlements.
- **Negative**: Pro roadmap is bounded to server-backed features - a
  local-only "unlock" idea is out of scope by construction; Pro cannot ship
  before the managed backend (ADR-0001 Workstream B) exists.

### Privacy / Security Impact

- Entitlement checks add **no content** to any request - plan/account lookup
  only, consistent with the zero-log proxy (managed-tier plan D4). The
  `/entitlements` response carries no user career data.
- Subscription/entitlement token keeps the same keychain isolation as
  provider keys - never exposed to JS.

### Reversibility

- **High.** Pro gating is additive on the proxy (plan-check branch) plus toast
  mapping on the client. Disable = proxy stops returning 402/403 for feature
  gates; client Pro hints go dormant. No client data migration.

---

## References

- **Depends on**: ADR-0001 managed tier + [managed-tier-implementation-plan.md](../managed-tier-implementation-plan.md)
  Workstreams A (client seam), B (proxy), C (billing).
- **Key files**: `apps/desktop/src-tauri/src/ai/api.rs` (`ai::api::run()`
  managed branch - Pro gate rides the sub-token here),
  `libs/core/src/lib/models/settings.model.ts` (`aiTier` only; no `proTier`),
  `apps/desktop/src/app/pages/settings/settings.component.ts` (upsell toast +
  optional non-authoritative entitlement hints).
- **Follow-up Tasks**:
  - [ ] Define base-vs-Pro plan matrix (models, quota, bundle features)
  - [ ] Proxy: plan-check branch returning 402/403 structured codes (managed-tier plan B3)
  - [ ] Optional `/entitlements` endpoint + non-authoritative client cache
  - [ ] Client: map upgrade_required/quota codes to upsell toast (plan A6)
  - [ ] Revisit source-available ONLY if a concrete local-only Pro feature is proposed
