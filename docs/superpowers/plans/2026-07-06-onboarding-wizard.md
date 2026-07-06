# First-run Onboarding Wizard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A skippable full-screen first-run wizard that configures an AI provider key and builds the user profile from a resume, gated after the health-check.

**Architecture:** A standalone `OnboardingComponent` overlay is gated in `app.ts` right after `first-launch`, driven by a new `settings.onboardingSeen` flag and a shared `OnboardingService` open-signal (so a dashboard banner and Settings/Profile buttons can re-open it). It reuses existing infrastructure: `first-launch.component.ts` (clone pattern), `renderSkill`/`ai.run` (AI), `cvImportReadFile` + `cv-import` skill (resume parse), keyring commands (key storage), and the i18n parity spec.

**Tech Stack:** Angular (standalone components, signals), Tauri 2 (Rust commands, sqlx migrations), TypeScript, Vitest/Jest-style `.spec.ts`.

## Global Constraints

- Augmentation, not automation: no auto-submit, no scraping; every value is user-confirmed before save.
- Privacy: resume parsed locally (Rust `pdf-extract`); only extracted text sent to AI, with an on-screen notice. API key → OS keyring only, never DB/logs.
- Token economy: `cv-import` and `onboarding-archetypes` are the only AI calls, each 1 call, `recommended_model: claude-haiku-4-5`; everything else 0 tokens.
- Data: additive migration only (`DATA_CONTRACT.md`). Writes existing `Profile` (`fullMd`, `targetArchetypes`) — no new profile schema.
- i18n: every `t()('...')` key MUST exist in both `en` and `de` in `libs/i18n/src/lib/translations/translations.ts` or `apps/desktop/src/i18n-keys.spec.ts` fails.
- Branch: `feat/onboarding-wizard`. Conventional Commits.
- AiProvider values: `'claude' | 'deepseek' | 'openai' | 'gemini' | 'codex'`. v1 provider guides: `claude`, `openai`, `deepseek`, plus a generic fallback.

---

## File Structure

**Create:**

- `apps/desktop/src-tauri/migrations/0012_onboarding_seen.sql` — flag column.
- `apps/desktop/src/app/core/onboarding/onboarding.service.ts` — shared open-signal + gating helpers wiring.
- `apps/desktop/src/app/core/onboarding/onboarding-gate.util.ts` — pure gating decisions (TDD).
- `apps/desktop/src/app/core/onboarding/onboarding-gate.util.spec.ts`
- `apps/desktop/src/app/core/onboarding/provider-guides.ts` — per-provider setup guide data + selector (TDD).
- `apps/desktop/src/app/core/onboarding/provider-guides.spec.ts`
- `apps/desktop/src/app/core/onboarding/onboarding-content.util.ts` — structured CV → profile markdown + archetype parse (TDD).
- `apps/desktop/src/app/core/onboarding/onboarding-content.util.spec.ts`
- `apps/desktop/src/app/core/onboarding/onboarding.component.ts` — the overlay + step state.
- `apps/desktop/src/app/core/onboarding/onboarding-banner.component.ts` — dashboard banner.
- `libs/skills/src/onboarding-archetypes/onboarding-archetypes.md` — AI skill.

**Modify:**

- `libs/core/src/lib/models/settings.model.ts` — add `onboardingSeen: boolean`.
- `apps/desktop/src-tauri/src/commands/settings.rs` — add `onboarding_seen` to struct + update bind.
- `apps/desktop/src-tauri/src/ai/skills.rs` — register `onboarding-archetypes`.
- `libs/data/src/lib/services/db.service.ts` — add `hasProviderKey` / `setProviderKey` wrappers.
- `apps/desktop/src/app/app.ts` — gate onboarding after first-launch.
- `apps/desktop/src/app/pages/dashboard/dashboard.component.ts` — mount banner + profile check.
- `apps/desktop/src/app/pages/settings/settings.component.ts` and `apps/desktop/src/app/pages/profile/profile.component.ts` — "Re-run onboarding" button.
- `libs/i18n/src/lib/translations/translations.ts` — `onboarding.*` keys (EN + DE).

---

## Task 1: Persistence — `onboarding_seen` flag

**Files:**

- Create: `apps/desktop/src-tauri/migrations/0012_onboarding_seen.sql`
- Modify: `apps/desktop/src-tauri/src/commands/settings.rs` (struct + `db_update_settings`)
- Modify: `libs/core/src/lib/models/settings.model.ts:24`

**Interfaces:**

- Produces: `Settings.onboardingSeen: boolean` (TS), `Settings.onboarding_seen: bool` (Rust), default `false`.

- [ ] **Step 1: Write the migration**

Create `apps/desktop/src-tauri/migrations/0012_onboarding_seen.sql`:

```sql
ALTER TABLE settings ADD COLUMN onboarding_seen INTEGER DEFAULT 0;
```

- [ ] **Step 2: Add the field to the Rust `Settings` struct**

In `apps/desktop/src-tauri/src/commands/settings.rs`, in the `Settings` struct (near line 23 where `health_check_seen: bool` is), add below it:

```rust
    pub onboarding_seen: bool,
```

- [ ] **Step 3: Bind it in `db_update_settings`**

In `db_update_settings` (COALESCE partial-update block, near the `health_check_seen` bind ~line 88), mirror the existing pattern. Add `onboarding_seen = COALESCE(?, onboarding_seen)` to the UPDATE SQL and bind `settings.onboarding_seen` in the same order. Copy the exact style used for `health_check_seen` two lines above.

- [ ] **Step 4: Add the field to the TS model**

In `libs/core/src/lib/models/settings.model.ts`, after `healthCheckSeen: boolean;` (line 24) add:

```typescript
onboardingSeen: boolean;
```

- [ ] **Step 5: Verify the backend compiles and migrates**

Run: `cd apps/desktop/src-tauri && cargo check`
Expected: compiles with no errors referencing `onboarding_seen`.

- [ ] **Step 6: Commit**

```bash
git add apps/desktop/src-tauri/migrations/0012_onboarding_seen.sql apps/desktop/src-tauri/src/commands/settings.rs libs/core/src/lib/models/settings.model.ts
git commit -m "feat(onboarding): add onboarding_seen settings flag + migration"
```

---

## Task 2: Gating helpers (pure, TDD)

**Files:**

- Create: `apps/desktop/src/app/core/onboarding/onboarding-gate.util.ts`
- Test: `apps/desktop/src/app/core/onboarding/onboarding-gate.util.spec.ts`

**Interfaces:**

- Consumes: `Settings` (has `onboardingSeen`), `Profile | null` (has `fullMd`).
- Produces: `shouldAutoOpenOnboarding(settings: Settings): boolean`, `shouldShowOnboardingBanner(settings: Settings, profile: Profile | null): boolean`.

- [ ] **Step 1: Write the failing test**

Create `onboarding-gate.util.spec.ts`:

```typescript
import { shouldAutoOpenOnboarding, shouldShowOnboardingBanner } from './onboarding-gate.util';
import type { Settings } from '@applye/core';
import type { Profile } from '@applye/core';

const settings = (over: Partial<Settings> = {}): Settings =>
  ({ id: 1, onboardingSeen: false, healthCheckSeen: true, ...over }) as Settings;
const profile = (fullMd: string): Profile => ({ id: 1, fullMd, updatedAt: '' }) as Profile;

describe('onboarding-gate.util', () => {
  it('auto-opens when onboarding not yet seen', () => {
    expect(shouldAutoOpenOnboarding(settings({ onboardingSeen: false }))).toBe(true);
  });
  it('does not auto-open once seen', () => {
    expect(shouldAutoOpenOnboarding(settings({ onboardingSeen: true }))).toBe(false);
  });
  it('shows banner when seen but profile empty', () => {
    expect(shouldShowOnboardingBanner(settings({ onboardingSeen: true }), profile('   '))).toBe(
      true,
    );
    expect(shouldShowOnboardingBanner(settings({ onboardingSeen: true }), null)).toBe(true);
  });
  it('hides banner when profile has content', () => {
    expect(shouldShowOnboardingBanner(settings({ onboardingSeen: true }), profile('# Jane'))).toBe(
      false,
    );
  });
  it('hides banner when onboarding not yet seen (overlay will handle it)', () => {
    expect(shouldShowOnboardingBanner(settings({ onboardingSeen: false }), null)).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx nx test desktop --testFile=onboarding-gate.util.spec.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation**

Create `onboarding-gate.util.ts`:

```typescript
import type { Settings, Profile } from '@applye/core';

/** Auto-open the wizard once, on first launch (after health-check). */
export function shouldAutoOpenOnboarding(settings: Settings): boolean {
  return !settings.onboardingSeen;
}

/** After the user skipped, nudge from the dashboard while the profile is empty. */
export function shouldShowOnboardingBanner(settings: Settings, profile: Profile | null): boolean {
  return settings.onboardingSeen && !profile?.fullMd?.trim();
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx nx test desktop --testFile=onboarding-gate.util.spec.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/src/app/core/onboarding/onboarding-gate.util.ts apps/desktop/src/app/core/onboarding/onboarding-gate.util.spec.ts
git commit -m "feat(onboarding): add pure gating helpers"
```

---

## Task 3: OnboardingService + overlay shell + app.ts gate

**Files:**

- Create: `apps/desktop/src/app/core/onboarding/onboarding.service.ts`
- Create: `apps/desktop/src/app/core/onboarding/onboarding.component.ts`
- Modify: `apps/desktop/src/app/app.ts`
- Modify: `libs/i18n/src/lib/translations/translations.ts`

**Interfaces:**

- Consumes: `shouldAutoOpenOnboarding` (Task 2), `DbService.getSettings/updateSettings`, `TranslateService.t()`.
- Produces:
  - `OnboardingService.open: Signal<boolean>`, `.requestOpen(): void`, `.close(): void`.
  - `OnboardingComponent` selector `app-onboarding`, output `completed = output<void>()`, internal `step = signal<number>()`.

- [ ] **Step 1: Create the shared service**

Create `onboarding.service.ts`:

```typescript
import { Injectable, signal } from '@angular/core';

/** Shared open-signal so the app gate, dashboard banner, and Settings/Profile
 *  buttons can all drive the same onboarding overlay. */
@Injectable({ providedIn: 'root' })
export class OnboardingService {
  private readonly _open = signal(false);
  readonly open = this._open.asReadonly();
  requestOpen(): void {
    this._open.set(true);
  }
  close(): void {
    this._open.set(false);
  }
}
```

- [ ] **Step 2: Create the overlay shell**

Create `onboarding.component.ts` (clone the structure of `first-launch.component.ts`; steps are placeholders now, filled by later tasks):

```typescript
import { Component, inject, output, signal, computed } from '@angular/core';
import { DbService } from '@applye/data';
import { TranslateService } from '@applye/i18n';
import { ButtonDirective } from '@applye/ui';

@Component({
  selector: 'app-onboarding',
  standalone: true,
  imports: [ButtonDirective],
  template: `
    <div class="onboarding">
      <header class="onboarding__head">
        <h1>{{ t()('onboarding.title') }}</h1>
        <button appButton variant="ghost" size="sm" (click)="skip()">
          {{ t()('onboarding.skip') }}
        </button>
      </header>

      <div class="onboarding__progress">
        {{ t()('onboarding.step') }} {{ step() + 1 }} / {{ totalSteps }}
      </div>

      <main class="onboarding__body">
        @switch (step()) {
          @case (0) {
            <section>
              <h2>{{ t()('onboarding.welcome_title') }}</h2>
              <p>{{ t()('onboarding.welcome_privacy') }}</p>
            </section>
          }
          @default {
            <section>
              <p>{{ t()('onboarding.step_todo') }}</p>
            </section>
          }
        }
      </main>

      <footer class="onboarding__nav">
        <button appButton variant="ghost" size="md" [disabled]="step() === 0" (click)="back()">
          {{ t()('onboarding.back') }}
        </button>
        @if (step() < totalSteps - 1) {
          <button appButton variant="primary" size="md" (click)="next()">
            {{ t()('onboarding.next') }}
          </button>
        } @else {
          <button appButton variant="primary" size="md" (click)="finish()">
            {{ t()('onboarding.done_cta') }}
          </button>
        }
      </footer>
    </div>
  `,
  styles: [
    `
      :host {
        display: block;
        height: 100%;
      }
      .onboarding {
        display: flex;
        flex-direction: column;
        height: 100%;
        max-width: 720px;
        margin: 0 auto;
        padding: 2rem;
      }
      .onboarding__head {
        display: flex;
        justify-content: space-between;
        align-items: center;
      }
      .onboarding__body {
        flex: 1;
      }
      .onboarding__nav {
        display: flex;
        justify-content: space-between;
      }
    `,
  ],
})
export class OnboardingComponent {
  private readonly db = inject(DbService);
  private readonly translate = inject(TranslateService);
  readonly t = computed(() => this.translate.t.bind(this.translate));

  readonly completed = output<void>();
  readonly step = signal(0);
  readonly totalSteps = 6; // 0 welcome, 1 ai-setup, 2 resume, 3 preview, 4 archetypes, 5 done

  next(): void {
    this.step.update((s) => Math.min(s + 1, this.totalSteps - 1));
  }
  back(): void {
    this.step.update((s) => Math.max(s - 1, 0));
  }
  async skip(): Promise<void> {
    await this.markSeen();
    this.completed.emit();
  }
  async finish(): Promise<void> {
    await this.markSeen();
    this.completed.emit();
  }
  private async markSeen(): Promise<void> {
    try {
      await this.db.updateSettings({ onboardingSeen: true });
    } catch {
      // fail open — never trap the user in onboarding
    }
  }
}
```

> Note: confirm the exact `t()` accessor by matching `first-launch.component.ts`. If it exposes `t` differently (e.g. `readonly t = ...` without `computed`), copy that exact shape instead of the `computed(...)` above.

- [ ] **Step 3: Gate it in `app.ts`**

Modify `apps/desktop/src/app/app.ts`:

```typescript
import { Component, OnInit, inject, signal, computed } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { ShellLayoutComponent } from './layout/shell-layout.component';
import { UpdaterService } from './core/updater.service';
import { FirstLaunchComponent } from './core/first-launch.component';
import { OnboardingComponent } from './core/onboarding/onboarding.component';
import { OnboardingService } from './core/onboarding/onboarding.service';
import { shouldAutoOpenOnboarding } from './core/onboarding/onboarding-gate.util';
import { DbService } from '@applye/data';

@Component({
  imports: [RouterOutlet, ShellLayoutComponent, FirstLaunchComponent, OnboardingComponent],
  selector: 'app-root',
  template: `
    @if (showFirstLaunch()) {
      <app-first-launch (dismissed)="onFirstLaunchDismissed()" />
    } @else if (showOnboarding()) {
      <app-onboarding (completed)="onboarding.close()" />
    } @else {
      <app-shell-layout><router-outlet /></app-shell-layout>
    }
  `,
  styles: [':host { display: block; height: 100%; }'],
})
export class App implements OnInit {
  private readonly updater = inject(UpdaterService);
  private readonly db = inject(DbService);
  readonly onboarding = inject(OnboardingService);

  readonly theme = signal<'dark' | 'light'>('dark');
  readonly showFirstLaunch = signal(false);
  readonly showOnboarding = computed(() => this.onboarding.open());

  async ngOnInit(): Promise<void> {
    void this.updater.checkForUpdates();
    try {
      const settings = await this.db.getSettings();
      this.showFirstLaunch.set(!settings.healthCheckSeen);
      if (settings.healthCheckSeen && shouldAutoOpenOnboarding(settings)) {
        this.onboarding.requestOpen();
      }
    } catch {
      // fail open
    }
  }

  async onFirstLaunchDismissed(): Promise<void> {
    this.showFirstLaunch.set(false);
    try {
      const settings = await this.db.getSettings();
      if (shouldAutoOpenOnboarding(settings)) this.onboarding.requestOpen();
    } catch {
      // fail open
    }
  }
}
```

- [ ] **Step 4: Add the i18n keys (EN + DE)**

In `libs/i18n/src/lib/translations/translations.ts`, add an `onboarding` namespace to BOTH `en` and `de`. English:

```typescript
  onboarding: {
    title: 'Set up Applye',
    step: 'Step',
    skip: 'Skip for now',
    back: 'Back',
    next: 'Next',
    done_cta: 'Finish',
    welcome_title: 'Welcome',
    welcome_privacy: 'Everything stays on your computer. Applye never uploads your data.',
    step_todo: '…',
  },
```

German (same keys, translated):

```typescript
  onboarding: {
    title: 'Applye einrichten',
    step: 'Schritt',
    skip: 'Später',
    back: 'Zurück',
    next: 'Weiter',
    done_cta: 'Fertig',
    welcome_title: 'Willkommen',
    welcome_privacy: 'Alles bleibt auf deinem Rechner. Applye lädt deine Daten nie hoch.',
    step_todo: '…',
  },
```

- [ ] **Step 5: Verify i18n + build**

Run: `npx nx test desktop --testFile=i18n-keys.spec.ts`
Expected: PASS (all used keys present, EN/DE parity).

- [ ] **Step 6: Live-verify the gate**

Start the app (`npx nx serve desktop` or the Tauri dev task). With a fresh DB: after the health-check, the onboarding overlay appears. Click "Skip" → app shell loads. Reload → onboarding does NOT reappear.

- [ ] **Step 7: Commit**

```bash
git add apps/desktop/src/app/core/onboarding/onboarding.service.ts apps/desktop/src/app/core/onboarding/onboarding.component.ts apps/desktop/src/app/app.ts libs/i18n/src/lib/translations/translations.ts
git commit -m "feat(onboarding): overlay shell + app gate + service + i18n"
```

---

## Task 4: Step 1 — AI setup (provider guide + keyring)

**Files:**

- Create: `apps/desktop/src/app/core/onboarding/provider-guides.ts`
- Test: `apps/desktop/src/app/core/onboarding/provider-guides.spec.ts`
- Modify: `libs/data/src/lib/services/db.service.ts` (keyring wrappers)
- Modify: `onboarding.component.ts` (render step 1)
- Modify: `translations.ts` (keys)

**Interfaces:**

- Consumes: `AiProvider` from `@applye/core`; `tauriInvoke` (already imported in db.service.ts).
- Produces:
  - `interface ProviderGuide { provider: AiProvider; nameKey: string; consoleUrl: string; stepKeys: string[]; helpVideoUrl?: string }`
  - `guideForProvider(provider: AiProvider): ProviderGuide`
  - `DbService.hasProviderKey(provider: string): Promise<boolean>`, `DbService.setProviderKey(provider: string, key: string): Promise<void>`.

- [ ] **Step 1: Write the failing test for the guide selector**

Create `provider-guides.spec.ts`:

```typescript
import { guideForProvider, PROVIDER_GUIDES } from './provider-guides';

describe('provider-guides', () => {
  it('returns a specific guide for claude with a console url and steps', () => {
    const g = guideForProvider('claude');
    expect(g.provider).toBe('claude');
    expect(g.consoleUrl).toMatch(/^https:\/\//);
    expect(g.stepKeys.length).toBeGreaterThan(0);
  });
  it('has guides for the v1 providers', () => {
    for (const p of ['claude', 'openai', 'deepseek'] as const) {
      expect(PROVIDER_GUIDES[p]).toBeDefined();
    }
  });
  it('falls back to a generic guide for a provider without a specific one', () => {
    const g = guideForProvider('gemini');
    expect(g.consoleUrl).toMatch(/^https:\/\//);
    expect(g.stepKeys.length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx nx test desktop --testFile=provider-guides.spec.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the guide data + selector**

Create `provider-guides.ts`:

```typescript
import type { AiProvider } from '@applye/core';

export interface ProviderGuide {
  provider: AiProvider;
  /** i18n key for the provider display name. */
  nameKey: string;
  /** Where the user creates a key; opened via openUrl(). */
  consoleUrl: string;
  /** Ordered i18n keys for the numbered setup steps. */
  stepKeys: string[];
  /** Optional external tutorial video; opened via openUrl(). */
  helpVideoUrl?: string;
}

const STEP_KEYS = (p: string): string[] => [
  `onboarding.ai.${p}.step1`,
  `onboarding.ai.${p}.step2`,
  `onboarding.ai.${p}.step3`,
  `onboarding.ai.${p}.step4`,
];

export const PROVIDER_GUIDES: Partial<Record<AiProvider, ProviderGuide>> = {
  claude: {
    provider: 'claude',
    nameKey: 'onboarding.ai.claude.name',
    consoleUrl: 'https://console.anthropic.com/settings/keys',
    stepKeys: STEP_KEYS('claude'),
  },
  openai: {
    provider: 'openai',
    nameKey: 'onboarding.ai.openai.name',
    consoleUrl: 'https://platform.openai.com/api-keys',
    stepKeys: STEP_KEYS('openai'),
  },
  deepseek: {
    provider: 'deepseek',
    nameKey: 'onboarding.ai.deepseek.name',
    consoleUrl: 'https://platform.deepseek.com/api_keys',
    stepKeys: STEP_KEYS('deepseek'),
  },
};

const GENERIC_GUIDE = (provider: AiProvider): ProviderGuide => ({
  provider,
  nameKey: 'onboarding.ai.generic.name',
  consoleUrl: 'https://applye.dev/docs/ai-setup',
  stepKeys: STEP_KEYS('generic'),
});

export function guideForProvider(provider: AiProvider): ProviderGuide {
  return PROVIDER_GUIDES[provider] ?? GENERIC_GUIDE(provider);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx nx test desktop --testFile=provider-guides.spec.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Add keyring wrappers to DbService**

In `libs/data/src/lib/services/db.service.ts`, add (near the other `tauriInvoke` methods):

```typescript
  async hasProviderKey(provider: string): Promise<boolean> {
    return tauriInvoke<boolean>('keys_has_provider_key', { provider });
  }
  async setProviderKey(provider: string, key: string): Promise<void> {
    return tauriInvoke<void>('keys_set_provider_key', { provider, key });
  }
```

- [ ] **Step 6: Render the AI-setup step in the overlay**

In `onboarding.component.ts`: import `openUrl` from `@tauri-apps/plugin-opener`, `guideForProvider` + `PROVIDER_GUIDES`, and `AiProvider`. Add state:

```typescript
  readonly selectedProvider = signal<AiProvider>('claude');
  readonly guide = computed(() => guideForProvider(this.selectedProvider()));
  readonly keyInput = signal('');
  readonly keySaved = signal(false);
  readonly v1Providers: AiProvider[] = ['claude', 'openai', 'deepseek'];

  async openConsole(): Promise<void> {
    await openUrl(this.guide().consoleUrl);
  }
  async openVideo(): Promise<void> {
    const url = this.guide().helpVideoUrl;
    if (url) await openUrl(url);
  }
  async saveKey(): Promise<void> {
    const key = this.keyInput().trim();
    if (!key) return;
    await this.db.setProviderKey(this.selectedProvider(), key);
    this.keySaved.set(await this.db.hasProviderKey(this.selectedProvider()));
  }
```

Add the `@case (1)` block to the template `@switch (step())`:

```html
@case (1) {
<section class="onboarding__ai">
  <h2>{{ t()('onboarding.ai.title') }}</h2>
  <p>{{ t()('onboarding.ai.intro') }}</p>
  <label
    >{{ t()('onboarding.ai.provider') }}
    <select [value]="selectedProvider()" (change)="selectedProvider.set($any($event.target).value)">
      @for (p of v1Providers; track p) {
      <option [value]="p">{{ t()(guideNameKey(p)) }}</option>
      }
    </select>
  </label>
  <button appButton variant="secondary" size="md" (click)="openConsole()">
    {{ t()('onboarding.ai.open_console') }}
  </button>
  <ol>
    @for (k of guide().stepKeys; track k) {
    <li>{{ t()(k) }}</li>
    }
  </ol>
  <label
    >{{ t()('onboarding.ai.key_label') }}
    <input type="password" [value]="keyInput()" (input)="keyInput.set($any($event.target).value)" />
  </label>
  <button appButton variant="primary" size="md" (click)="saveKey()">
    {{ t()('onboarding.ai.save_check') }}
  </button>
  @if (keySaved()) {
  <p class="ok">{{ t()('onboarding.ai.saved') }}</p>
  } @if (guide().helpVideoUrl) {
  <button appButton variant="ghost" size="sm" (click)="openVideo()">
    {{ t()('onboarding.ai.watch_video') }}
  </button>
  }
  <p class="muted">{{ t()('onboarding.ai.keyring_note') }}</p>
</section>
}
```

Add a helper for the option label:

```typescript
  guideNameKey(p: AiProvider): string {
    return guideForProvider(p).nameKey;
  }
```

- [ ] **Step 7: Add the i18n keys (EN + DE)**

Add to `onboarding` in BOTH `en` and `de`. Keys required (English values shown; provide German equivalents): `ai.title`, `ai.intro`, `ai.provider`, `ai.open_console`, `ai.key_label`, `ai.save_check`, `ai.saved`, `ai.watch_video`, `ai.keyring_note`, `ai.generic.name`, and per provider `ai.claude.name`, `ai.claude.step1..step4`, `ai.openai.name`, `ai.openai.step1..step4`, `ai.deepseek.name`, `ai.deepseek.step1..step4`, `ai.generic.step1..step4`. Example (EN, claude):

```typescript
    ai: {
      title: 'Connect an AI provider',
      intro: 'Applye uses AI to score jobs and tailor documents. You need one API key. Think of it as a password for the AI — it is stored only on your computer.',
      provider: 'Provider',
      open_console: 'Open console & create key',
      key_label: 'Paste your API key',
      save_check: 'Save & check',
      saved: 'Key saved and detected.',
      watch_video: 'Watch the video guide',
      keyring_note: 'Your key is stored in your operating system keychain, never in a file or log.',
      generic: { name: 'Other provider', step1: 'Open the provider console.', step2: 'Create an API key.', step3: 'Copy it.', step4: 'Paste it below and save.' },
      claude: {
        name: 'Claude (Anthropic)',
        step1: 'Sign in at console.anthropic.com.',
        step2: 'Go to API Keys and click Create Key.',
        step3: 'Copy the key (it starts with sk-ant-).',
        step4: 'Paste it below and click Save & check.',
      },
      openai: { name: 'OpenAI (Codex)', step1: 'Sign in at platform.openai.com.', step2: 'Open API keys and Create new secret key.', step3: 'Copy the key.', step4: 'Paste it below and click Save & check.' },
      deepseek: { name: 'DeepSeek', step1: 'Sign in at platform.deepseek.com.', step2: 'Open API keys and create one.', step3: 'Copy the key.', step4: 'Paste it below and click Save & check.' },
    },
```

Provide the parallel `de` block with the same key paths.

> The `ai` object nests under `onboarding`, so used keys resolve as `onboarding.ai.claude.step1` etc. — matching `stepKeys`/`nameKey`.

- [ ] **Step 8: Verify + live-check**

Run: `npx nx test desktop --testFile=provider-guides.spec.ts` → PASS
Run: `npx nx test desktop --testFile=i18n-keys.spec.ts` → PASS
Live: onboarding step 2 (index 1) shows provider select, "Open console" opens the browser, pasting a key + Save shows "saved".

- [ ] **Step 9: Commit**

```bash
git add apps/desktop/src/app/core/onboarding/provider-guides.ts apps/desktop/src/app/core/onboarding/provider-guides.spec.ts libs/data/src/lib/services/db.service.ts apps/desktop/src/app/core/onboarding/onboarding.component.ts libs/i18n/src/lib/translations/translations.ts
git commit -m "feat(onboarding): AI-setup step with per-provider guide + keyring"
```

---

## Task 5: Steps 2–3 — Resume input + preview → profile markdown

**Files:**

- Create: `apps/desktop/src/app/core/onboarding/onboarding-content.util.ts`
- Test: `apps/desktop/src/app/core/onboarding/onboarding-content.util.spec.ts`
- Modify: `onboarding.component.ts` (steps 2 & 3)
- Modify: `translations.ts`

**Interfaces:**

- Consumes: `DbService.cvImportReadFile(path)` → `{ text, inputHash }`; `AiService.renderSkill('cv-import', { cv_text, language })`; `AiService.run(req)`; `parseCvSkillResponse(text)` (existing, imported from the Documents util that `cv-list.component.ts` uses — reuse the same import path).
- Produces: `interface ParsedCv { personalDetails?: { fullName?: string | null; email?: string | null; phone?: string | null }; summary?: string | null; experience?: { company: string; role: string; bullets: string[] }[]; skills?: string[] }`; `cvToProfileMarkdown(cv: ParsedCv): string`.

- [ ] **Step 1: Write the failing test**

Create `onboarding-content.util.spec.ts`:

```typescript
import { cvToProfileMarkdown } from './onboarding-content.util';

describe('cvToProfileMarkdown', () => {
  it('renders name, summary, experience and skills as markdown', () => {
    const md = cvToProfileMarkdown({
      personalDetails: { fullName: 'Jane Smith', email: 'jane@x.io' },
      summary: 'Senior engineer.',
      experience: [{ company: 'Acme', role: 'Lead', bullets: ['Shipped X', 'Cut latency 40%'] }],
      skills: ['TypeScript', 'Rust'],
    });
    expect(md).toContain('# Jane Smith');
    expect(md).toContain('Senior engineer.');
    expect(md).toContain('## Experience');
    expect(md).toContain('Lead — Acme');
    expect(md).toContain('- Shipped X');
    expect(md).toContain('TypeScript, Rust');
  });
  it('omits empty sections without throwing', () => {
    const md = cvToProfileMarkdown({});
    expect(typeof md).toBe('string');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx nx test desktop --testFile=onboarding-content.util.spec.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the util**

Create `onboarding-content.util.ts`:

```typescript
export interface ParsedCv {
  personalDetails?: {
    fullName?: string | null;
    email?: string | null;
    phone?: string | null;
  } | null;
  summary?: string | null;
  experience?: { company: string; role: string; bullets?: string[] }[] | null;
  skills?: string[] | null;
}

export function cvToProfileMarkdown(cv: ParsedCv): string {
  const out: string[] = [];
  const name = cv.personalDetails?.fullName?.trim();
  if (name) out.push(`# ${name}`);
  const contact = [cv.personalDetails?.email, cv.personalDetails?.phone]
    .filter(Boolean)
    .join(' · ');
  if (contact) out.push(contact);
  if (cv.summary?.trim()) out.push('', '## Summary', cv.summary.trim());
  if (cv.experience?.length) {
    out.push('', '## Experience');
    for (const e of cv.experience) {
      out.push('', `### ${e.role} — ${e.company}`);
      for (const b of e.bullets ?? []) out.push(`- ${b}`);
    }
  }
  if (cv.skills?.length) out.push('', '## Skills', cv.skills.join(', '));
  return out.join('\n').trim();
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx nx test desktop --testFile=onboarding-content.util.spec.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Wire resume input + preview into the overlay**

In `onboarding.component.ts`, inject `AiService`, import the file-open dialog used by the Documents module (match `cv-list.component.ts`'s import — the Tauri dialog `open` from `@tauri-apps/plugin-dialog`), `parseCvSkillResponse` from the same util path `cv-list.component.ts` imports it from, and `cvToProfileMarkdown` + `ParsedCv`. Add state + methods:

```typescript
  readonly resumeText = signal('');
  readonly parsedCv = signal<ParsedCv | null>(null);
  readonly parsing = signal(false);
  readonly profileMd = computed(() => (this.parsedCv() ? cvToProfileMarkdown(this.parsedCv()!) : ''));

  async pickResumeFile(): Promise<void> {
    const path = await open({ multiple: false, filters: [{ name: 'Resume', extensions: ['pdf', 'docx'] }] });
    if (typeof path !== 'string') return;
    const file = await this.db.cvImportReadFile(path);
    this.resumeText.set(file.text);
  }

  async parseResume(): Promise<void> {
    const text = this.resumeText().trim();
    if (!text) return;
    this.parsing.set(true);
    try {
      const settings = await this.db.getSettings();
      const language = settings.defaultDocLanguage ?? 'en';
      const rendered = await this.ai.renderSkill('cv-import', { cv_text: text, language });
      const res = await this.ai.run({
        mode: settings.aiMode,
        provider: settings.provider,
        model: settings.economyModel,
        systemPrompt: rendered.systemPrompt,
        userPrompt: rendered.userPrompt,
        language,
      });
      this.parsedCv.set(parseCvSkillResponse(res.text) as ParsedCv);
      this.next(); // advance to preview
    } finally {
      this.parsing.set(false);
    }
  }
```

Add `@case (2)` (input) and `@case (3)` (preview) template blocks: step 2 offers "Upload PDF/DOCX" (`pickResumeFile`), a paste `<textarea [value]="resumeText()">`, a privacy note `onboarding.resume.privacy_note`, and a "Parse" button (`parseResume`, disabled while `parsing()`); step 3 renders `profileMd()` in a read-only `<pre>`/editable `<textarea>` for correction, plus any `lowConfidenceNotes` if present. Keep the existing footer nav.

- [ ] **Step 6: Add i18n keys (EN + DE)**

Add under `onboarding` (both locales): `resume.title`, `resume.upload`, `resume.paste_label`, `resume.privacy_note`, `resume.parse`, `resume.parsing`, `preview.title`, `preview.help`.

- [ ] **Step 7: Verify + live-check**

Run: `npx nx test desktop --testFile=onboarding-content.util.spec.ts` → PASS
Run: `npx nx test desktop --testFile=i18n-keys.spec.ts` → PASS
Live: upload a sample PDF → parse → preview shows structured markdown, editable.

- [ ] **Step 8: Commit**

```bash
git add apps/desktop/src/app/core/onboarding/onboarding-content.util.ts apps/desktop/src/app/core/onboarding/onboarding-content.util.spec.ts apps/desktop/src/app/core/onboarding/onboarding.component.ts libs/i18n/src/lib/translations/translations.ts
git commit -m "feat(onboarding): resume input + preview → profile markdown"
```

---

## Task 6: Step 4 — Archetypes + comp (new skill) → save profile

**Files:**

- Create: `libs/skills/src/onboarding-archetypes/onboarding-archetypes.md`
- Modify: `apps/desktop/src-tauri/src/ai/skills.rs` (register)
- Modify: `onboarding-content.util.ts` (+ parse helper) & `.spec.ts`
- Modify: `onboarding.component.ts` (step 4 + save)
- Modify: `translations.ts`

**Interfaces:**

- Consumes: `AiService.renderSkill('onboarding-archetypes', { cv_text, language })`, `DbService.upsertProfile({ fullMd, targetArchetypes })`.
- Produces: `parseArchetypesSkillResponse(text: string): { archetypes: string[]; compRange: string | null }`.

- [ ] **Step 1: Write the failing parse test**

Append to `onboarding-content.util.spec.ts`:

````typescript
import { parseArchetypesSkillResponse } from './onboarding-content.util';

describe('parseArchetypesSkillResponse', () => {
  it('parses archetypes and comp range from JSON', () => {
    const r = parseArchetypesSkillResponse(
      '{"archetypes":["Senior FE Engineer","Staff FE"],"compRange":"EUR 90-120K"}',
    );
    expect(r.archetypes).toEqual(['Senior FE Engineer', 'Staff FE']);
    expect(r.compRange).toBe('EUR 90-120K');
  });
  it('tolerates code fences and missing comp', () => {
    const r = parseArchetypesSkillResponse('```json\n{"archetypes":["X"]}\n```');
    expect(r.archetypes).toEqual(['X']);
    expect(r.compRange).toBeNull();
  });
  it('returns empty on garbage', () => {
    const r = parseArchetypesSkillResponse('not json');
    expect(r.archetypes).toEqual([]);
    expect(r.compRange).toBeNull();
  });
});
````

- [ ] **Step 2: Run test to verify it fails**

Run: `npx nx test desktop --testFile=onboarding-content.util.spec.ts`
Expected: FAIL — `parseArchetypesSkillResponse` not exported.

- [ ] **Step 3: Implement the parse helper**

Append to `onboarding-content.util.ts`:

```typescript
export function parseArchetypesSkillResponse(text: string): {
  archetypes: string[];
  compRange: string | null;
} {
  const empty = { archetypes: [] as string[], compRange: null as string | null };
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) return empty;
  try {
    const obj = JSON.parse(match[0]) as { archetypes?: unknown; compRange?: unknown };
    const archetypes = Array.isArray(obj.archetypes)
      ? obj.archetypes.filter((x): x is string => typeof x === 'string')
      : [];
    const compRange = typeof obj.compRange === 'string' ? obj.compRange : null;
    return { archetypes, compRange };
  } catch {
    return empty;
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx nx test desktop --testFile=onboarding-content.util.spec.ts`
Expected: PASS (all, incl. 3 new).

- [ ] **Step 5: Create the skill markdown**

Create `libs/skills/src/onboarding-archetypes/onboarding-archetypes.md` (mirror `cv-import.md` frontmatter shape):

```markdown
---
version: 1
description: >
  Suggests 2-3 target-role archetypes and a compensation range from a
  candidate's resume text. Suggestion only — never invents experience.
  The user confirms or edits every value.
inputs:
  - name: cv_text
    description: The candidate's resume as plain text.
  - name: language
    description: Output language for the archetype labels (e.g. en, de).
output_format: valid JSON only — no markdown, no preamble
recommended_model: claude-haiku-4-5
---

[SYSTEM]
You read a resume and suggest target-role archetypes the candidate could credibly apply to, plus a realistic compensation range. You do not invent skills or experience — base every suggestion only on what the resume shows. Output ONLY valid JSON, no markdown fences, no commentary.

Rules:

- archetypes: 2-3 short role-shape strings in {{language}} (e.g. "Senior Frontend Engineer"), most-fitting first, grounded in the resume's real seniority and stack.
- compRange: a single realistic range string with currency if the resume implies a market/location (e.g. "EUR 90-120K"), else null. Never fabricate precision.

Output schema:
{ "archetypes": ["string"], "compRange": "string or null" }

[USER]
Resume:
{{cv_text}}

Output language: {{language}}
Return the JSON now.
```

- [ ] **Step 6: Register the skill in Rust**

In `apps/desktop/src-tauri/src/ai/skills.rs`, add a match arm to `skill_source` alongside the existing ones:

```rust
        "onboarding-archetypes" => Some(include_str!(
            "../../../../../libs/skills/src/onboarding-archetypes/onboarding-archetypes.md"
        )),
```

- [ ] **Step 7: Verify the skill resolves (backend)**

Run: `cd apps/desktop/src-tauri && cargo check`
Expected: compiles (the `include_str!` path resolves).

- [ ] **Step 8: Wire step 4 + save into the overlay**

In `onboarding.component.ts`, import `parseArchetypesSkillResponse`. Add state + methods:

```typescript
  readonly archetypes = signal<string[]>([]);
  readonly compRange = signal<string>('');
  readonly suggesting = signal(false);

  async suggestArchetypes(): Promise<void> {
    const text = this.resumeText().trim();
    if (!text) { this.next(); return; }
    this.suggesting.set(true);
    try {
      const settings = await this.db.getSettings();
      const language = settings.defaultDocLanguage ?? 'en';
      const rendered = await this.ai.renderSkill('onboarding-archetypes', { cv_text: text, language });
      const res = await this.ai.run({
        mode: settings.aiMode, provider: settings.provider, model: settings.economyModel,
        systemPrompt: rendered.systemPrompt, userPrompt: rendered.userPrompt, language,
      });
      const parsed = parseArchetypesSkillResponse(res.text);
      this.archetypes.set(parsed.archetypes);
      this.compRange.set(parsed.compRange ?? '');
    } finally {
      this.suggesting.set(false);
    }
  }

  addArchetype(v: string): void {
    const t = v.trim();
    if (t) this.archetypes.update((a) => [...a, t]);
  }
  removeArchetype(i: number): void {
    this.archetypes.update((a) => a.filter((_, idx) => idx !== i));
  }

  async saveProfile(): Promise<void> {
    const fullMd = this.profileMd();
    if (fullMd) {
      await this.db.upsertProfile({
        fullMd,
        targetArchetypes: JSON.stringify(this.archetypes()),
      });
    }
  }
```

Call `suggestArchetypes()` when entering step 4 (e.g. from the preview step's "Next" handler, or a `@case (4)` "Suggest" button). Add `@case (4)` template: editable archetype chips (`removeArchetype`, an input calling `addArchetype`), a comp-range text input bound to `compRange`, a "Suggest again" button, and a privacy/no-fabrication note. On the final step's `finish()`, call `await this.saveProfile()` before `markSeen()`.

- [ ] **Step 9: Update finish() to persist**

Modify `finish()`:

```typescript
  async finish(): Promise<void> {
    await this.saveProfile();
    await this.markSeen();
    this.completed.emit();
  }
```

- [ ] **Step 10: Add i18n keys (EN + DE)**

Under `onboarding` (both locales): `archetypes.title`, `archetypes.help`, `archetypes.suggest`, `archetypes.add_placeholder`, `archetypes.comp_label`, `archetypes.no_fabrication`, `done.title`, `done.body`, `done.cta_job`, `done.cta_docs`.

- [ ] **Step 11: Verify + live-check**

Run: `npx nx test desktop --testFile=onboarding-content.util.spec.ts` → PASS
Run: `npx nx test desktop --testFile=i18n-keys.spec.ts` → PASS
Live: after preview, step 4 shows suggested archetypes + comp, editable; Finish writes the profile (check `/profile` shows the content).

- [ ] **Step 12: Commit**

```bash
git add libs/skills/src/onboarding-archetypes/onboarding-archetypes.md apps/desktop/src-tauri/src/ai/skills.rs apps/desktop/src/app/core/onboarding/onboarding-content.util.ts apps/desktop/src/app/core/onboarding/onboarding-content.util.spec.ts apps/desktop/src/app/core/onboarding/onboarding.component.ts libs/i18n/src/lib/translations/translations.ts
git commit -m "feat(onboarding): archetype+comp suggestion skill and profile save"
```

---

## Task 7: Dashboard banner + re-run entry points

**Files:**

- Create: `apps/desktop/src/app/core/onboarding/onboarding-banner.component.ts`
- Modify: `apps/desktop/src/app/pages/dashboard/dashboard.component.ts`
- Modify: `apps/desktop/src/app/pages/settings/settings.component.ts`
- Modify: `apps/desktop/src/app/pages/profile/profile.component.ts`
- Modify: `translations.ts`

**Interfaces:**

- Consumes: `OnboardingService.requestOpen()`, `shouldShowOnboardingBanner` (Task 2), `DbService.getSettings/getProfile`.

- [ ] **Step 1: Create the banner component**

Create `onboarding-banner.component.ts`:

```typescript
import { Component, inject, signal, output } from '@angular/core';
import { DbService } from '@applye/data';
import { TranslateService } from '@applye/i18n';
import { ButtonDirective } from '@applye/ui';
import { OnboardingService } from './onboarding.service';
import { shouldShowOnboardingBanner } from './onboarding-gate.util';

@Component({
  selector: 'app-onboarding-banner',
  standalone: true,
  imports: [ButtonDirective],
  template: `
    @if (visible()) {
      <div class="ob-banner" role="status">
        <span>{{ t()('onboarding.banner.text') }}</span>
        <span class="ob-banner__actions">
          <button appButton variant="primary" size="sm" (click)="finishSetup()">
            {{ t()('onboarding.banner.cta') }}
          </button>
          <button appButton variant="ghost" size="sm" (click)="visible.set(false)">
            {{ t()('onboarding.banner.dismiss') }}
          </button>
        </span>
      </div>
    }
  `,
  styles: [
    `
      .ob-banner {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 0.75rem 1rem;
        border-radius: 8px;
        background: var(--surface-2, #1e1e24);
        margin-bottom: 1rem;
      }
      .ob-banner__actions {
        display: flex;
        gap: 0.5rem;
      }
    `,
  ],
})
export class OnboardingBannerComponent {
  private readonly db = inject(DbService);
  private readonly translate = inject(TranslateService);
  private readonly onboarding = inject(OnboardingService);
  readonly t = this.translate.t.bind(this.translate);
  readonly visible = signal(false);

  async ngOnInit(): Promise<void> {
    try {
      const [settings, profile] = await Promise.all([this.db.getSettings(), this.db.getProfile()]);
      this.visible.set(shouldShowOnboardingBanner(settings, profile));
    } catch {
      this.visible.set(false);
    }
  }

  finishSetup(): void {
    this.visible.set(false);
    this.onboarding.requestOpen();
  }
}
```

> Match the exact `t()` accessor shape used by `first-launch.component.ts`; if it uses `computed(() => this.translate.t.bind(...))`, mirror that.

- [ ] **Step 2: Mount the banner on the dashboard**

In `dashboard.component.ts`, add `OnboardingBannerComponent` to `imports` and place `<app-onboarding-banner />` at the top of the template, above the existing content.

- [ ] **Step 3: Add "Re-run onboarding" buttons**

In `settings.component.ts` and `profile.component.ts`, inject `OnboardingService` and add a button in a sensible spot:

```html
<button appButton variant="secondary" size="md" (click)="onboarding.requestOpen()">
  {{ t()('onboarding.rerun') }}
</button>
```

(Inject as `readonly onboarding = inject(OnboardingService);` and import it.)

- [ ] **Step 4: Add i18n keys (EN + DE)**

Under `onboarding` (both locales): `banner.text`, `banner.cta`, `banner.dismiss`, `rerun`.

- [ ] **Step 5: Verify + live-check**

Run: `npx nx test desktop --testFile=i18n-keys.spec.ts` → PASS
Live: skip onboarding with an empty profile → dashboard shows the banner → "Finish setup" reopens the overlay. Fill profile → banner gone. Settings/Profile "Re-run onboarding" reopens it.

- [ ] **Step 6: Commit**

```bash
git add apps/desktop/src/app/core/onboarding/onboarding-banner.component.ts apps/desktop/src/app/pages/dashboard/dashboard.component.ts apps/desktop/src/app/pages/settings/settings.component.ts apps/desktop/src/app/pages/profile/profile.component.ts libs/i18n/src/lib/translations/translations.ts
git commit -m "feat(onboarding): dashboard banner + re-run entry points"
```

---

## Task 8: Full verification, lint, docs sync

**Files:**

- Modify: `docs/product/CURRENT_STATE.md`, `docs/product/FEATURE_INDEX.md`, `CHANGELOG.md`

- [ ] **Step 1: Run the full affected test + lint suite**

Run: `npx nx test desktop` and `npx nx lint desktop`
Expected: all green (util specs + i18n-keys parity). Fix any failures inline.

- [ ] **Step 2: End-to-end live verification**

Fresh DB → launch → health-check → onboarding → set key + validate → upload sample PDF → parse → preview/edit → suggest+confirm archetypes/comp → Finish → `/profile` populated → flag set → reload shows no onboarding. Skip path → dashboard banner → reopen. Re-run from Settings.

- [ ] **Step 3: Sync docs**

- `docs/product/CURRENT_STATE.md`: add the onboarding wizard to "Recently completed" / "Currently working on".
- `docs/product/FEATURE_INDEX.md`: set **First-run Onboarding Wizard** status `In-Progress` (or `Shipped` after merge).
- `CHANGELOG.md` `[Unreleased]`: add the entry from the brief's Changelog Draft.

- [ ] **Step 4: Commit**

```bash
git add docs/product/CURRENT_STATE.md docs/product/FEATURE_INDEX.md CHANGELOG.md
git commit -m "docs(onboarding): sync product state + changelog"
```

- [ ] **Step 5: Open the PR**

Use `aif-branch-finisher` (diff review, Conventional Commit check, PR summary). Open a single PR `feat/onboarding-wizard → main`.

---

## Self-Review (completed during authoring)

- **Spec coverage:** trigger/gating (Task 1–3), 6 steps incl. AI-setup (Task 4), resume input+preview (Task 5), archetypes+comp skill (Task 6), skip + dashboard banner + re-run (Task 7), migration/flag (Task 1), i18n EN+DE (every task), tests + docs (Task 8). CLI-bridge / dual-track / conversational input are out of scope per the brief.
- **Type consistency:** `onboardingSeen` (TS) / `onboarding_seen` (Rust) consistent; `guideForProvider`/`PROVIDER_GUIDES`, `cvToProfileMarkdown`/`ParsedCv`, `parseArchetypesSkillResponse` names match across tasks; `OnboardingService.requestOpen/close/open` consistent between app.ts, banner, and buttons.
- **Open confirmations for the implementer:** (a) match the exact `t()` accessor shape from `first-launch.component.ts`; (b) confirm the Tauri file-dialog import (`open` from `@tauri-apps/plugin-dialog`) and `parseCvSkillResponse` import path from how `cv-list.component.ts` uses them; (c) confirm `db_update_settings` COALESCE column list includes the new bind in the correct positional order.
