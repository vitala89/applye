# Managed AI Tier - Implementation Plan

Status: `draft` · Date: 2026-07-07 · Related: [ADR-0001](decisions/ADR-0001-ai-key-monetization.md), [ADR-0002](decisions/ADR-0002-pro-entitlements.md)

Goal: paid **managed** tier where end-user AI requests are proxied through
Applye-operated infrastructure under our provider accounts, gated by a
subscription token. BYOK stays free and untouched. Privacy = **stateless,
zero-log proxy, sold as a feature**.

---

## Gate 0 - Provider ToS (PASSED, with conditions)

Researched 2026-07-07 against current live terms. **All three permit the managed
proxy model.** Verdict: PERMITTED-WITH-CONDITIONS for each. The pattern works
because in managed tier the **key stays server-side and users authenticate to
our app, not to the provider** - none of the three prohibits that; all three
prohibit only handing the raw key/account to third parties (which we never do).

| Provider  | Verdict                   | Governing doc                                      | Note                                                                                                                                                                                                                                                                |
| --------- | ------------------------- | -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Anthropic | PERMITTED-WITH-CONDITIONS | Commercial Terms §A.1, §D.2-D.3; AUP               | Explicitly blesses "power products for your Users" + "authorized resellers or passthrough access". Lowest risk.                                                                                                                                                     |
| OpenAI    | PERMITTED-WITH-CONDITIONS | Services Agreement (eff. 2026-01-01) §3.1-3.3      | **Watch item.** OK via "Customer Application" (§3.2), but §3.1 forbids reselling _account access_ + §3.3(g) forbids transferring keys. Frame product as _our app/subscription_, never "API access". Short legal read of §3.1 vs §3.2 warranted if revenue material. |
| DeepSeek  | PERMITTED-WITH-CONDITIONS | Open Platform ToS (eff. 2026-04-29) §2.2, §3.1-3.3 | Explicitly contemplates "provide services to the public". Requires our own end-user agreement + privacy disclosure (China-based processing - already disclosed in-app).                                                                                             |

**Conditions that gate design (all providers converge):**

1. Key stays **server-side**, never to client/end-user (OpenAI §3.3(g), DeepSeek §2.2 explicit).
2. Sell **our app/subscription**, not "API access" - critical for OpenAI framing.
3. **Flow provider Usage/AUP policies down** to our end users and enforce them.
4. Have **our own end-user Terms** (DeepSeek §3.2 explicit; good practice all).
5. We are **100% liable for all end-user activity + fees** under our account.
6. Be able to **identify/attribute** end-user activity (Anthropic §D.2 identity verification).
7. **Don't architect to dodge** provider rate/usage limits (OpenAI §3.3(h)/(i)).
8. DeepSeek: privacy disclosure to users + no partnership/brand implication.

Our existing direct-API client already aligns (key in OS keychain, server-side,
never logged). Conditions 3-6 become new **product/legal follow-ups** below, not
architecture blockers.

**Residual risk**: OpenAI §3.1-vs-§3.2 is the only genuinely ambiguous point.
Get a short legal read before OpenAI managed traffic is material. Anthropic +
DeepSeek are clear - safe to build first.

---

## Architecture

```
Desktop app                 Applye backend                Provider
-----------                 --------------                --------
AiService.run()             /v1/{provider}
  → Tauri ai_run            proxy (stateless)
  → ai::api::run()   ──────► auth (sub token)  ──────►    api.anthropic.com
     tier=managed            quota/rate check              api.deepseek.com
     proxy URL + sub token   forward, NO log               ...
                             meter (count only)
```

Client change is confined to **one Rust dispatch function**. Backend is new.

---

## Workstream A - Client (desktop, Tauri + Angular)

Small, low-risk. This is the seam identified in ADR-0001.

- **A1. Settings model** - add `aiTier: 'direct' | 'managed'` to
  `libs/core/src/lib/models/settings.model.ts`. Default `'direct'`. Migrate
  existing settings (absent → `'direct'`).
- **A2. Subscription token storage** - new keychain entry, separate from
  provider keys, in `apps/desktop/src-tauri/src/keys.rs`. New Tauri commands
  `keys_set_subscription_token` / `keys_has_subscription_token` /
  `keys_delete_subscription_token`. Frontend wrapper in `keys.service.ts`.
  Token never returned to JS (same isolation as provider keys).
- **A3. Dispatch branch** - in `apps/desktop/src-tauri/src/ai/api.rs`,
  parameterize base URL. In `ai::api::run()`:
  - `managed` → proxy base URL + `Authorization: Bearer <sub-token>`; provider
    passed as path/param, no provider key needed.
  - `direct` → current behavior (provider URL + user key).
  - Managed base URL from build config/env, not hardcoded per-user.
- **A4. Key retrieval branch** - in `ai::mod.rs` `ai_run`: for managed mode pull
  subscription token instead of provider key; clear error if missing
  ("Subscribe or add your own key in Settings").
- **A5. Settings UI** - new section in `settings.component.ts`: tier toggle,
  managed signup/login entry, token status, per-tier data-flow disclosure
  (mirror existing DeepSeek disclosure). Reuse password-input + status-signal
  pattern already there.
- **A6. Error surfacing** - map proxy errors (401 expired sub, 429 quota, 402
  payment) to existing toast system + inline settings errors.

## Workstream B - Proxy service (new backend)

The privacy-critical piece. **Stateless, zero-retention by design.**

- **B1. Proxy core** - forward `/v1/{provider}` → provider API. Inject OUR
  provider key server-side. Stream response back. **Log nothing about request
  or response bodies** - no prompts, no completions, no user text. Only emit
  anonymous counters (see B4).
- **B2. Auth** - validate subscription token per request. Token → account
  mapping. Reject expired/revoked. No prompt content in auth logs.
- **B3. Quota + abuse control** - per-account: token/request quota, hard spend
  cap, rate limit, model-tier restriction (cheap model on base tier). Protects
  our provider bill. Return structured 429/402.
- **B4. Metering** - count tokens/requests per account for billing. Counts only,
  **never content**. This is the line that keeps "zero-log" honest.
- **B5. Provider key management** - our provider keys in server secret store
  (not in repo, not in client). Rotation path.
- **B6. Deploy** - stateless service, horizontally scalable (Cloudflare
  Workers / small container). No persistent request store.

## Workstream C - Billing & accounts

- **C1. Subscription** - Stripe (or equiv): plan(s), checkout, webhook →
  activate/deactivate account + token.
- **C2. Token lifecycle** - issue on subscribe, revoke on cancel/chargeback,
  rotation.
- **C3. Pricing decision** - flat sub + quota (simpler for non-tech, the target
  segment) vs token markup. Decide before C1. Price for support + ops, not just
  token cost.
- **C4. End-user Terms + AUP flow-down** (from Gate 0 conditions) - our own
  end-user agreement (DeepSeek §3.2 requires it); flow Anthropic/OpenAI/DeepSeek
  usage policies down to users and enforce (suspend on abuse). Product framing:
  "subscription to Applye", never "API access" (OpenAI §3.1).
- **C5. Abuse attribution** - per-account activity attribution for identity/abuse
  requests (Anthropic §D.2) and to enforce downstream AUP. Counts + account id
  only, no prompt content (keeps zero-log intact).
- **C6. OpenAI legal read** - short counsel review of §3.1 (no reselling account
  access) vs §3.2 (Customer Application) before OpenAI managed traffic is
  material. Anthropic + DeepSeek clear - build those first.

## Workstream D - Privacy as a feature (cross-cutting)

Zero-log is not internal hygiene - it's the pitch that keeps privacy-first
positioning intact while monetizing.

- **D1. Guarantee** - publish an explicit statement: proxy forwards, never
  stores prompts/completions; only anonymous counts for billing. Put it in-app
  (managed tier disclosure) and in public docs.
- **D2. Provable, not just claimed** - no-log enforced in code (B1/B4 review
  gate), infra config shows no body logging, and - MIT license - the proxy
  source can be published so users verify. Consider this a differentiator vs
  closed SaaS competitors.
- **D3. Per-tier disclosure in UI** - clear "what leaves your device" per tier:
  BYOK direct-to-provider; managed → Applye proxy (zero-log) → provider.
- **D4. Privacy review** - `aif-privacy-review` completed 2026-07-07. Verdict:
  **shippable IF zero-log enforced in code + opt-in explicit.** MIT-published
  stateless proxy converts the top risk into a verifiable feature. Details below.

### D4 - Privacy review findings (2026-07-07)

Personal/career data in scope: resume/profile markdown, scoring JSON, job
descriptions, default pitch - carried in AI `systemPrompt`/`userPrompt`. Managed
tier newly routes these through Applye infra.

**Risks**

| ID  | Sev     | Risk                                                                                                                                                  |
| --- | ------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| R1  | HIGH    | Applye becomes data processor - prompts (resume, employment, job data) transit our proxy. New legal + trust posture.                                  |
| R2  | HIGH    | Prompt content in logs - default HTTP/proxy stacks log bodies/error payloads; accidental body log = career data at rest.                              |
| R3  | MED     | Metering leaks content - usage records that store snippets break zero-log.                                                                            |
| R4  | MED     | Subscription token links request → paying account → real identity (Stripe). BYOK is pseudonymous; managed correlates career data to billing identity. |
| R5  | MED     | DeepSeek jurisdiction - managed DeepSeek = two hops (our proxy → China provider) under our name.                                                      |
| R6  | MED     | Proxy host jurisdiction - where stateless proxy runs sets transit jurisdiction for all managed career data. Undecided.                                |
| R7  | LOW-MED | Subprocessor chain (Stripe, proxy host, provider) - GDPR disclosure if EU users.                                                                      |
| R8  | MED     | Abuse handling re-introduces content - "attribute abuse" tempts storing offending prompts.                                                            |

**Required controls**

1. Zero-log enforced **in code, not policy** - no request/response body logging
   at any layer (proxy, error handler, metering). Review gate on B1/B4 + a test
   asserting no body field reaches any sink.
2. Metering = counts only - schema physically has no content column.
3. Stateless proxy - no persistent request store; memory only for in-flight.
4. Publish proxy source (MIT) - user-verifiable zero-log. Converts R1/R2 from
   "trust us" to "check the code". The control that keeps privacy-first intact.
5. Explicit opt-in per tier - default stays `direct`; no silent off-device routing.
6. Per-tier data-flow disclosure in UI - what leaves device, to whom, retention
   (= none). Managed-DeepSeek gets its own two-hop disclosure.
7. Separate billing identity from usage counters - not joinable into per-prompt
   profile (minimizes R4).
8. Decide + document proxy host jurisdiction; prefer privacy-favorable region.
9. Public subprocessor list (GDPR + trust).
10. Data-deletion path - cancel → token revoked → account + counters purged;
    proxy stateless so nothing to delete there (state that).

**Unresolved (gate launch)**

- **Q1** - Proxy host + jurisdiction? (gates R6 + disclosure text)
- **Q2** - EU users in scope at launch? → GDPR DPA / subprocessor obligations now vs later.
- **Q3** - Billing-counter retention + are they truly content-free?
- **Q4** - Can abuse/AUP enforcement stay content-free on account-level signals
  alone? If any case needs content → it breaks zero-log; resolve before building.
- **Q5** - Separate Privacy Policy for managed vs app's local-first stance?

Biggest open blockers: **Q1 + Q4**.

---

## Sequencing

1. **Gate 0** - ToS verdicts (in progress). ← blocks everything.
2. **Bridge login tier first** - validate demand for "no raw key" before
   building managed infra (ADR-0001 sequencing). Cheaper signal.
3. **B + C in parallel** - proxy + billing are the real cost; build once demand
   validated.
4. **A** - client changes are small; land after proxy contract is stable.
5. **D** - runs across all; gate launch on D4 privacy review.

## Risks

- ToS kills a provider → managed limited to permitted providers only.
- Thin margin → pricing must cover ops/support, not just tokens.
- Support load → managed users expect "AI works"; budget for it.
- Zero-log is a promise with legal weight → enforce in code + review, don't just
  claim it.

## Definition of done (managed MVP)

- [ ] Gate 0 passed for ≥1 provider
- [ ] Proxy: stateless, zero body-logging, quota + spend cap, metering counts only
- [ ] Client: `aiTier` toggle, sub-token in keychain, managed dispatch branch
- [ ] Billing: subscribe → token issued → managed requests work → cancel → revoked
- [ ] Privacy: public zero-log guarantee + in-app per-tier disclosure + passed review
