# Architecture Decision Record: AI Access Monetization - BYOK / Bridge / Managed Proxy

- **Status**: `draft`
- **Date**: 2026-07-07

---

## Context

Applye is a privacy-first, MIT-licensed Tauri 2 + Angular desktop app. Today the
only way to use AI is **BYOK** (Bring Your Own Key): the user enters a provider
API key, which is stored in the OS keychain and never leaves the Rust backend.

This excludes two user segments:

1. Users who have an AI subscription (Claude/ChatGPT) but no raw API key.
2. Non-technical users with **no** AI account at all, who want AI to "just work"
   without managing keys or billing with a third party.

We want to monetize the app without breaking its free/open/privacy-first
positioning. The proposed model: keep BYOK free forever; add a paid **managed**
tier where AI requests are proxied through Applye-operated infrastructure under
our API accounts, gated by a subscription token.

### Current architecture (the seam)

- Keys stored in OS keychain via `keyring` crate - `apps/desktop/src-tauri/src/keys.rs`,
  frontend wrapper `libs/data/src/lib/services/keys.service.ts`. Keys never
  reach JS.
- Single AI entry point: `AiService.run()` → Tauri `ai_run` →
  `apps/desktop/src-tauri/src/ai/mod.rs` (`ai_run`, retrieves key from keychain).
- Provider dispatch + key injection isolated in
  `apps/desktop/src-tauri/src/ai/api.rs`:
  - `ANTHROPIC_URL`, `DEEPSEEK_URL` hardcoded constants.
  - `anthropic_run()` injects `x-api-key`; `openai_compatible_run()` injects
    `Authorization: Bearer`.

**One dispatch function (`ai::api::run()`) controls every outbound AI request.**
That is the single seam a managed tier plugs into. Frontend and `AiRequest`
shape need no changes.

## Decision

Adopt a **three-tier** AI access model, shipped in order:

| Tier         | Segment                       | Mechanism                                            | Status  |
| ------------ | ----------------------------- | ---------------------------------------------------- | ------- |
| Free BYOK    | technical / max-privacy       | user key in keychain, direct to provider             | shipped |
| Bridge login | has own AI subscription       | login with provider account, use their quota         | next    |
| Managed sub  | non-technical / no AI account | our proxy URL + subscription token, our API accounts | last    |

Managed tier is implemented by **parameterizing the existing dispatch seam**, not
by rewriting request logic:

1. Extend Settings model with `aiTier: 'direct' | 'managed'`.
2. Replace hardcoded base-URL constants with values resolved from tier +
   settings/env (managed → `https://proxy.applye.dev/v1/{provider}`).
3. Branch in `ai::api::run()`: managed → proxy URL + subscription token from
   keychain; direct → provider URL + user key (current behavior).
4. New keychain entry + Tauri command for the subscription token, separate from
   provider keys.
5. Settings UI section for managed signup / token entry.

The proxy itself is a **stateless, zero-retention** forwarder - this is a
first-class privacy feature, not an afterthought.

## Options Considered

- **Option 1: Three-tier (BYOK + Bridge + Managed proxy)** - chosen.
  - Pros: widest market (covers no-key and no-account users); code = commodity,
    managed service = the moat a fork can't copy; BYOK stays free/private;
    single-seam integration, low blast radius.
  - Cons: managed tier adds backend we don't currently run (auth, billing,
    metering, proxy, abuse monitoring); we become a data processor for managed
    traffic; ongoing ops + support load.
  - Costs: Stripe + proxy service + on-call; provider ToS review is a hard gate.

- **Option 2: BYOK only (status quo)** - rejected.
  - Pros: zero backend, zero ops, purest privacy story.
  - Cons: no revenue; excludes all non-technical users; leaves the widest market
    segment unserved.

- **Option 3: Managed only (drop BYOK, SaaS-style)** - rejected.
  - Pros: simplest billing, one path to support.
  - Cons: destroys privacy-first positioning and the open/local value prop;
    alienates the current technical user base; a fork would immediately
    out-compete us on trust.

---

## Implications & Consequences

### Consequences

- **Positive**: monetization without paywalling the app; addresses no-key and
  no-account segments; integration confined to one Rust dispatch function +
  Settings; both tiers can run behind a settings flag (A/B).
- **Negative**: new operational surface (auth server, billing, usage metering,
  key rotation, proxy, abuse monitoring); thin margin if reselling tokens near
  cost - price for support + ops, not just token markup; managed users raise
  support expectations ("AI doesn't work") that BYOK users self-serve.

### Privacy / Security Impact

**Significant - this is the crux.** BYOK sends zero user data through Applye.
The managed tier routes prompts (resume text, job data) through our
infrastructure, making us a **data processor**.

Mitigations (non-negotiable for shipping managed):

- Stateless, **no-log / zero-retention** proxy; document it publicly and make it
  a selling point ("we forward, never store").
- Subscription token stored in OS keychain, same isolation as provider keys;
  never exposed to JS.
- Per-user quota, hard spend cap, and model-tier restriction (cheap model on
  base tier) to bound our API bill and prevent abuse.
- Clear in-UI disclosure of what leaves the device per tier (mirror the existing
  DeepSeek data-location disclosure pattern).

### Reversibility

- **High.** Managed tier is additive behind `aiTier`. Reverting = default to
  `direct`, hide managed UI, decommission proxy. BYOK path is untouched, so no
  data migration. The keychain subscription-token entry can be left dormant or
  cleared.

---

## References

- **Follow-up decision**: [ADR-0002](ADR-0002-pro-entitlements.md) - how a paid
  Pro feature tier is gated on top of the managed token without breaking MIT
  (server-anchored entitlements; no client-side unlock).
- **ToS pre-condition (RESOLVED 2026-07-07)**: Anthropic / OpenAI / DeepSeek all
  **PERMIT** the managed proxy model (verdict PERMITTED-WITH-CONDITIONS each),
  because the key stays server-side and users authenticate to our app, not the
  provider. Conditions: key never client-side; sell _our app/subscription_ not
  "API access" (esp. OpenAI); flow provider AUP down to end users; have our own
  end-user Terms; we bear full liability. OpenAI §3.1-vs-§3.2 is the one
  ambiguous point - get a short legal read before OpenAI managed traffic is
  material. See [managed-tier-implementation-plan.md](../managed-tier-implementation-plan.md) Gate 0.
- **Key files**: `apps/desktop/src-tauri/src/ai/api.rs` (seam),
  `apps/desktop/src-tauri/src/ai/mod.rs` (`ai_run`),
  `apps/desktop/src-tauri/src/keys.rs`,
  `libs/core/src/lib/models/settings.model.ts`,
  `apps/desktop/src/app/pages/settings/settings.component.ts`.
- **Follow-up Tasks**:
  - [ ] Legal: confirm provider ToS allow proxied resale (blocking gate)
  - [ ] Ship Bridge login tier; validate demand before building managed
  - [ ] Decide pricing model: token markup vs flat subscription + quota
  - [ ] Design stateless zero-retention proxy service + abuse/rate limits
  - [ ] Add `aiTier` to Settings model + subscription-token keychain command
  - [ ] Privacy review of managed data flow (aif-privacy-review)
