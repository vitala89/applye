# Architecture Decision Record: Web Backend Platform - Cloudflare Workers + TypeScript + Hono

- **Status**: `accepted`
- **Date**: 2026-10-04
- **Related**: [ADR-0006](ADR-0006-career-company-network-interview-intelligence.md)

---

## Context

Applye now has two product surfaces with deliberately different infrastructure boundaries:

- **Desktop**: Angular + Tauri + Rust + local SQLite, privacy-first and local-first.
- **Web**: currently a static Angular site on Cloudflare Pages, planned to evolve into an
  account-backed product with server-side persistence, hosted intelligence, managed integrations,
  and optional paid services.

ADR-0006 already establishes the architectural principle: **shared domain, separate infrastructure**.
The remaining decision is what runtime and backend framework should power the web product.

The main candidates are:

1. TypeScript on Cloudflare Workers with a Workers-native HTTP framework.
2. TypeScript with NestJS.
3. Go.
4. Reuse/extend the existing Rust/Tauri backend.

The decision must optimize for the actual deployment target, not for framework familiarity alone.

## Decision

Use **Cloudflare Workers + TypeScript + Hono** for the Applye web backend.

Do not reuse the Tauri/Rust backend as the web server. Rust remains the desktop infrastructure
backend.

Do not adopt NestJS for the Cloudflare Worker backend. NestJS remains a valid future option only if
Applye later chooses a conventional long-running Node.js server runtime where its module/DI and
Express/Fastify adapter model provides enough value to justify the additional framework weight.

Do not choose Go for the primary web backend while Cloudflare Workers remains the target platform.

### Runtime

The backend runtime is **Cloudflare Workers**.

Reasons:

- the public site is already on Cloudflare;
- Workers provides first-class TypeScript support;
- D1, R2, Queues, Workflows, KV, Durable Objects and other platform services are available through
  native bindings;
- the Angular web application can later be served with Workers Static Assets, allowing one deployment
  boundary for frontend and API;
- it avoids introducing a second hosting platform before product needs justify one.

The existing Cloudflare Pages deployment remains in place until the first account-backed backend
slice is implemented. A documentation decision does not justify migrating a working static site by
itself.

### Language

Use **TypeScript**.

Reasons:

- TypeScript is first-class on Workers.
- Applye is already an Nx/Angular/TypeScript monorepo.
- Framework-agnostic domain types, validation rules and selected application contracts can be shared
  where doing so preserves clean boundaries.
- Cloudflare bindings and tooling have direct TypeScript support.
- The team avoids translating every web domain contract into a second backend language without a
  demonstrated benefit.

This does **not** mean web infrastructure code belongs in `libs/core`. Cloudflare-specific bindings,
HTTP handlers, auth, persistence and billing stay behind web infrastructure adapters.

### HTTP framework

Use **Hono** as the thin HTTP/router layer.

Hono is chosen because it is designed for Fetch-style runtimes and has direct Cloudflare Workers
support. It should remain a boundary framework, not the place where business rules accumulate.

Expected flow:

```text
HTTP Request
    |
Hono route / middleware
    |
application use case
    |
domain rules / contracts
    |
port
    |
Cloudflare adapter
    |
D1 / R2 / external service
```

Controllers/routes validate transport input, establish request/account context, call application
use cases, and map results to HTTP responses. They do not own domain policy.

### Why not NestJS

NestJS is a strong choice for conventional Node.js services, especially when a team benefits from
its modules, dependency injection, decorators, guards, interceptors and established Express/Fastify
adapter model.

It is not the default choice here because Applye is deliberately targeting Workers:

- NestJS' normal HTTP model is built around server adapters such as Express or Fastify.
- Workers use a Fetch-style request lifecycle and platform bindings rather than a conventional
  long-running Node HTTP server.
- Modern Workers provide broad Node.js compatibility, but compatibility is not the same as a native
  architectural fit.
- Pulling NestJS into the Worker would add framework/adapter weight without solving a product problem
  that Hono plus explicit application/domain boundaries cannot solve more directly.
- Applye already gets its architecture from DDD/Clean Architecture boundaries; it does not need a
  large framework to manufacture those boundaries.

Revisit NestJS if the deployment target changes to a normal Node.js server, or if later complexity
demonstrates a concrete need that cannot be met cleanly by the chosen structure.

### Why not Go

Go is an excellent backend language, but it is not the best default for this deployment target.

Cloudflare Workers supports JavaScript/TypeScript, Python and Rust as first-class languages. Go is
used through WebAssembly rather than as a first-class Workers language.

Choosing Go now would:

- add a second web-backend language to a TypeScript-heavy monorepo;
- duplicate or translate domain contracts;
- reduce direct reuse of TypeScript validation/types where sharing is appropriate;
- add a Wasm toolchain/interop boundary;
- provide no demonstrated product or operational advantage for Applye's current scale.

Go remains reasonable for a future isolated service if a concrete workload, library ecosystem, or
operational requirement makes it the better tool.

### Why not reuse the Tauri Rust backend

The Rust code under `apps/desktop/src-tauri` is desktop infrastructure. It owns concerns such as
Tauri commands, local SQLite access, OS keychain integration, filesystem access and local AI
dispatch.

The web backend owns different concerns:

- HTTP;
- accounts and sessions;
- authorization;
- server-side persistence;
- billing/entitlements;
- hosted AI;
- rate limits and abuse controls;
- community moderation;
- queues/background work.

Trying to make one backend serve both runtimes would couple infrastructure assumptions that should
remain separate.

The shared part is the domain language and pure rules, not the runtime.

## Planned physical shape

Do **not** create empty scaffolding as part of this ADR.

When the first backend slice starts, the preferred monorepo shape is:

```text
apps/
  desktop/       Angular + Tauri
  web/           Angular web product
  api/           Cloudflare Worker, TypeScript + Hono

libs/
  core/          framework-agnostic domain model / pure rules
  application/   shareable use cases where genuinely runtime-neutral
  ...
```

Web-only ports/adapters should receive web-specific scope/tags so desktop code cannot accidentally
depend on Cloudflare bindings.

## API topology

Prefer one public origin initially:

```text
https://applye.dev/
https://applye.dev/companies
https://applye.dev/career
https://applye.dev/applications

https://applye.dev/api/*
```

Benefits:

- simpler cookie/session policy;
- less CORS configuration;
- clearer CSP;
- simpler local/dev mental model;
- fewer public deployment surfaces.

A dedicated API or service hostname can be introduced later when an operational reason exists.
Internal Workers may also be split behind Service Bindings without exposing additional public
origins.

## Persistence

### D1: initial relational store

Use **Cloudflare D1** for the first account-backed product slices where its limits and semantics fit.

Keep persistence behind explicit ports/repositories/gateways. Domain/application code must not depend
directly on D1 APIs.

This makes the initial choice reversible.

### PostgreSQL: scale/complexity escape hatch

If relational scale, query complexity, operational tooling, or ecosystem needs outgrow D1, move the
affected persistence adapter to PostgreSQL, accessed from Workers through **Hyperdrive** when
appropriate.

This is a planned escape hatch, not a reason to introduce PostgreSQL before it is needed.

### R2: object storage

Use **R2** for object/blob workloads such as uploaded or generated CV/PDF/DOCX files, attachments and
other large binary content. Store metadata and ownership references in the relational database
rather than putting large files in relational rows.

### Queues and Workflows

Use **Queues** or **Workflows** only for operations that genuinely need asynchronous/retryable
execution, for example:

- large cross-opportunity analysis;
- document processing;
- hosted enrichment;
- moderation pipelines;
- multi-step AI jobs.

Ordinary CRUD and short AI requests stay synchronous until product behavior proves otherwise.

### Durable Objects / KV

Do not adopt these by default.

Use them only when a concrete requirement appears, such as coordinated realtime state, rate-limit
state, or a cache/configuration workload that matches their semantics.

## Authentication and authorization

This ADR chooses the backend platform, not the identity provider.

Before account-backed user data ships, create a dedicated auth/security decision covering:

- identity provider or first-party auth;
- session/cookie model;
- CSRF strategy;
- authorization boundaries;
- account recovery;
- deletion/export;
- admin/moderation access;
- secret storage;
- audit requirements.

Authorization is enforced server-side. Client state is never an authority for ownership or paid
entitlements.

## Desktop and web data boundary

This decision does not introduce desktop-to-web sync.

Desktop remains useful without an Applye account. Any future sync needs its own ADR covering
identity, encryption, source of truth, conflicts, deletion and offline behavior.

No desktop-local career data is uploaded merely because a user signs in to the web product.

## Deployment transition

### Now

```text
Angular static build
    -> Cloudflare Pages
    -> applye.dev
```

Keep this while the web surface is static.

### First backend milestone

Migrate intentionally to:

```text
Angular static assets
        +
Cloudflare Worker API
        |
Workers Static Assets
        |
applye.dev + /api/*
```

Do this as its own implementation PR with rollback/deployment checks. Do not mix the hosting
migration with unrelated product features.

## Options considered

### Option A: TypeScript + Hono on Workers - chosen

**Pros**

- native fit for Cloudflare/Fetch runtime;
- first-class language support;
- smallest technology delta from the existing monorepo;
- straightforward D1/R2/Queues bindings;
- easy sharing of pure TS contracts/rules where appropriate;
- low framework ceremony.

**Cons**

- less batteries-included than NestJS;
- architecture discipline must come from repository boundaries and tests rather than framework
  conventions;
- Cloudflare-specific infrastructure remains a platform dependency.

### Option B: TypeScript + NestJS - rejected for the Workers backend

**Pros**

- mature DI/module ecosystem;
- familiar enterprise patterns;
- strong conventional Node.js ecosystem.

**Cons**

- server-adapter model is not the natural Workers execution model;
- unnecessary framework weight for the first product slices;
- increased risk of designing around Nest abstractions instead of Cloudflare/runtime boundaries.

### Option C: Go - rejected as primary web backend

**Pros**

- excellent server performance;
- simple concurrency model;
- strong conventional backend ecosystem.

**Cons**

- not a first-class Workers language;
- WebAssembly boundary/tooling;
- less direct monorepo/type sharing;
- no current workload requires the trade-off.

### Option D: Rust Workers / reuse desktop Rust - rejected for primary web backend

**Pros**

- Rust already exists in the repository;
- Workers has first-class Rust support.

**Cons**

- existing Rust code is tightly aligned with Tauri/desktop infrastructure;
- Wasm dependency constraints add friction;
- domain/contracts would still need a deliberate cross-language boundary;
- reuse would be mostly superficial while coupling unrelated runtime concerns.

## Consequences

### Positive

- web backend matches the hosting platform;
- desktop and web infrastructure stay cleanly separated;
- TypeScript skills and Nx tooling carry forward;
- D1/R2 provide a low-operations starting point;
- PostgreSQL remains available without rewriting domain logic;
- NestJS/Go are not banned globally, only rejected as unjustified defaults.

### Negative

- a new `apps/api` application will eventually be added to the monorepo;
- web persistence/auth introduce GDPR and operational responsibilities that the desktop app avoids;
- some application code may need separate desktop/web orchestration rather than forced sharing;
- Cloudflare becomes an intentional infrastructure dependency for the hosted web surface.

## Security and privacy impact

High enough to require follow-up review before implementation.

Non-negotiable implementation constraints:

- account-scoped authorization on every private resource;
- server-side secrets only;
- no secret values in Angular bundles;
- explicit local-vs-hosted data UX;
- rate limits/abuse controls on expensive endpoints;
- least-privilege Cloudflare bindings;
- deletion/export semantics before storing sensitive career data;
- no automatic desktop upload;
- audit/moderation controls before community publishing.

## Reversibility

High at the domain/application level if adapters remain honest boundaries.

The Worker/Hono layer is infrastructure. A future Node/NestJS, Go, or another deployment can replace
it without changing core business vocabulary if domain rules do not import Cloudflare/Hono types.

D1 is likewise an adapter choice. PostgreSQL is the planned relational escape hatch.

## References

- `ROADMAP.md`
- `PRODUCT.md`
- `docs/architecture.md`
- `docs/domain-architecture.md`
- [ADR-0006](ADR-0006-career-company-network-interview-intelligence.md)
- Cloudflare Workers languages: https://developers.cloudflare.com/workers/languages/
- Cloudflare TypeScript: https://developers.cloudflare.com/workers/languages/typescript/
- Cloudflare Hono guide: https://developers.cloudflare.com/workers/framework-guides/web-apps/more-web-frameworks/hono/
- Cloudflare Workers Static Assets: https://developers.cloudflare.com/workers/static-assets/
- Cloudflare D1: https://developers.cloudflare.com/d1/
- Cloudflare R2 bindings: https://developers.cloudflare.com/r2/api/workers/workers-api-reference/
- Cloudflare Hyperdrive: https://developers.cloudflare.com/hyperdrive/
- NestJS HTTP adapters: https://docs.nestjs.com/faq/http-adapter
