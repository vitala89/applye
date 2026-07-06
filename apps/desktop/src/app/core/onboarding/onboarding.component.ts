import { Component, computed, inject, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { AiProvider, CvParsedContent } from '@applye/core';
import { AiService, DbService, KeysService } from '@applye/data';
import { TranslateService } from '@applye/i18n';
import { ButtonDirective } from '@applye/ui';
import { openUrl } from '@tauri-apps/plugin-opener';
import { parseCvSkillResponse } from '../../pages/documents/cv-content.util';
import { cvToProfileMarkdown, parseArchetypesSkillResponse } from './onboarding-content.util';
import { guideForProvider } from './provider-guides';

/** Full-screen onboarding wizard overlay. Auto-opened once after the
 * health-check (see app.ts + onboarding-gate.util.ts); steps are placeholders
 * here and get filled in by later tasks. */
@Component({
  selector: 'app-onboarding',
  standalone: true,
  imports: [ButtonDirective, FormsModule],
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
          @case (1) {
            <section class="onboarding__ai">
              <h2>{{ t()('onboarding.ai.title') }}</h2>
              <p>{{ t()('onboarding.ai.intro') }}</p>
              <label
                >{{ t()('onboarding.ai.provider') }}
                <select
                  [value]="selectedProvider()"
                  (change)="selectedProvider.set($any($event.target).value)"
                >
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
                <input
                  type="password"
                  [value]="keyInput()"
                  (input)="keyInput.set($any($event.target).value)"
                />
              </label>
              <button appButton variant="primary" size="md" (click)="saveKey()">
                {{ t()('onboarding.ai.save_check') }}
              </button>
              @if (keySaved()) {
                <p class="ok">{{ t()('onboarding.ai.saved') }}</p>
              }
              @if (guide().helpVideoUrl) {
                <button appButton variant="ghost" size="sm" (click)="openVideo()">
                  {{ t()('onboarding.ai.watch_video') }}
                </button>
              }
              <p class="muted">{{ t()('onboarding.ai.keyring_note') }}</p>
            </section>
          }
          @case (2) {
            <section class="onboarding__resume">
              <h2>{{ t()('onboarding.resume.title') }}</h2>
              <button appButton variant="secondary" size="md" (click)="pickResumeFile()">
                {{ t()('onboarding.resume.upload') }}
              </button>
              <label
                >{{ t()('onboarding.resume.paste_label') }}
                <textarea
                  rows="8"
                  [ngModel]="resumeText()"
                  (ngModelChange)="resumeText.set($event)"
                ></textarea>
              </label>
              <p class="muted">{{ t()('onboarding.resume.privacy_note') }}</p>
              <button
                appButton
                variant="primary"
                size="md"
                [disabled]="parsing() || !resumeText().trim()"
                (click)="parseResume()"
              >
                {{ parsing() ? t()('onboarding.resume.parsing') : t()('onboarding.resume.parse') }}
              </button>
            </section>
          }
          @case (3) {
            <section class="onboarding__preview">
              <h2>{{ t()('onboarding.preview.title') }}</h2>
              <p class="muted">{{ t()('onboarding.preview.help') }}</p>
              <textarea
                rows="16"
                [ngModel]="profileMd()"
                (ngModelChange)="profileMd.set($event)"
              ></textarea>
              @if (parsedCv()?.lowConfidenceNotes?.length) {
                <ul class="onboarding__notes">
                  @for (note of parsedCv()?.lowConfidenceNotes; track note) {
                    <li>{{ note }}</li>
                  }
                </ul>
              }
            </section>
          }
          @case (4) {
            <section class="onboarding__archetypes">
              <h2>{{ t()('onboarding.archetypes.title') }}</h2>
              <p class="muted">{{ t()('onboarding.archetypes.help') }}</p>
              <ul class="onboarding__chips">
                @for (a of archetypes(); track a; let i = $index) {
                  <li class="onboarding__chip">
                    {{ a }}
                    <button
                      type="button"
                      appButton
                      variant="ghost"
                      size="sm"
                      (click)="removeArchetype(i)"
                    >
                      ×
                    </button>
                  </li>
                }
              </ul>
              <input
                type="text"
                [placeholder]="t()('onboarding.archetypes.add_placeholder')"
                #archetypeInput
                (keydown.enter)="addArchetype(archetypeInput.value); archetypeInput.value = ''"
              />
              <label>
                {{ t()('onboarding.archetypes.comp_label') }}
                <input
                  type="text"
                  [ngModel]="compRange()"
                  (ngModelChange)="compRange.set($event)"
                />
              </label>
              <button
                appButton
                variant="secondary"
                size="md"
                [disabled]="suggesting()"
                (click)="suggestArchetypes()"
              >
                {{ t()('onboarding.archetypes.suggest') }}
              </button>
              <p class="muted">{{ t()('onboarding.archetypes.no_fabrication') }}</p>
            </section>
          }
          @case (5) {
            <section class="onboarding__done">
              <h2>{{ t()('onboarding.done.title') }}</h2>
              <p>{{ t()('onboarding.done.body') }}</p>
              <div class="onboarding__done-actions">
                <button appButton variant="secondary" size="md" (click)="finishTo('/jobs/new')">
                  {{ t()('onboarding.done.cta_job') }}
                </button>
                <button appButton variant="secondary" size="md" (click)="finishTo('/documents')">
                  {{ t()('onboarding.done.cta_docs') }}
                </button>
              </div>
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
          <button appButton variant="primary" size="md" (click)="goNext()">
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
      .onboarding__chips {
        display: flex;
        flex-wrap: wrap;
        gap: 0.5rem;
        list-style: none;
        padding: 0;
      }
      .onboarding__chip {
        display: flex;
        align-items: center;
        gap: 0.25rem;
        padding: 0.25rem 0.5rem;
        border-radius: 999px;
        background: var(--surface-2, #eee);
      }
      .onboarding__done-actions {
        display: flex;
        gap: 0.5rem;
      }
    `,
  ],
})
export class OnboardingComponent {
  private readonly db = inject(DbService);
  private readonly ai = inject(AiService);
  private readonly keys = inject(KeysService);
  private readonly i18n = inject(TranslateService);
  private readonly router = inject(Router);
  protected readonly t = this.i18n.t;

  readonly completed = output<void>();
  readonly step = signal(0);
  readonly totalSteps = 6; // 0 welcome, 1 ai-setup, 2 resume, 3 preview, 4 archetypes, 5 done

  readonly selectedProvider = signal<AiProvider>('claude');
  readonly guide = computed(() => guideForProvider(this.selectedProvider()));
  readonly keyInput = signal('');
  readonly keySaved = signal(false);
  readonly v1Providers: AiProvider[] = ['claude', 'openai', 'deepseek'];

  readonly resumeText = signal('');
  readonly parsedCv = signal<CvParsedContent | null>(null);
  readonly parsing = signal(false);
  private readonly parsedMd = computed(() => {
    const cv = this.parsedCv();
    return cv ? cvToProfileMarkdown(cv) : '';
  });
  readonly profileMd = signal('');

  readonly archetypes = signal<string[]>([]);
  readonly compRange = signal<string>('');
  readonly suggesting = signal(false);

  guideNameKey(p: AiProvider): string {
    return guideForProvider(p).nameKey;
  }

  async pickResumeFile(): Promise<void> {
    const { open } = await import('@tauri-apps/plugin-dialog');
    const path = await open({
      multiple: false,
      filters: [{ name: 'Resume', extensions: ['pdf', 'docx'] }],
    });
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
      // Match the Documents cv-import pipeline: the skill's `language` drives
      // label text and follows the UI language, not the document output language.
      const language = settings.uiLanguage ?? 'en';
      const rendered = await this.ai.renderSkill('cv-import', { cv_text: text, language });
      const res = await this.ai.run({
        mode: settings.aiMode,
        provider: settings.provider,
        model: settings.economyModel,
        systemPrompt: rendered.systemPrompt,
        userPrompt: rendered.userPrompt,
        language,
      });
      this.parsedCv.set(parseCvSkillResponse(res.text));
      this.profileMd.set(this.parsedMd());
      this.next(); // advance to preview
    } finally {
      this.parsing.set(false);
    }
  }

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
    await this.keys.setProviderKey(this.selectedProvider(), key);
    this.keySaved.set(await this.keys.hasProviderKey(this.selectedProvider()));
  }

  next(): void {
    this.step.update((s) => Math.min(s + 1, this.totalSteps - 1));
  }

  back(): void {
    this.step.update((s) => Math.max(s - 1, 0));
  }

  /** Footer "Next" handler: triggers archetype suggestion when leaving the
   * profile-preview step (3) so step 4 arrives pre-populated. */
  async goNext(): Promise<void> {
    if (this.step() === 3) {
      await this.suggestArchetypes();
      return;
    }
    this.next();
  }

  async suggestArchetypes(): Promise<void> {
    const text = this.resumeText().trim();
    if (!text) {
      this.next();
      return;
    }
    this.suggesting.set(true);
    try {
      const settings = await this.db.getSettings();
      // Match the Documents cv-import pipeline: the skill's `language` drives
      // label text and follows the UI language, not the document output language.
      const language = settings.uiLanguage ?? 'en';
      const rendered = await this.ai.renderSkill('onboarding-archetypes', {
        cv_text: text,
        language,
      });
      const res = await this.ai.run({
        mode: settings.aiMode,
        provider: settings.provider,
        model: settings.economyModel,
        systemPrompt: rendered.systemPrompt,
        userPrompt: rendered.userPrompt,
        language,
      });
      const parsed = parseArchetypesSkillResponse(res.text);
      this.archetypes.set(parsed.archetypes);
      this.compRange.set(parsed.compRange ?? '');
      this.next();
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

  async skip(): Promise<void> {
    await this.markSeen();
    this.completed.emit();
  }

  async finish(): Promise<void> {
    await this.saveProfile();
    await this.markSeen();
    this.completed.emit();
  }

  async finishTo(path: string): Promise<void> {
    await this.saveProfile();
    await this.markSeen();
    await this.router.navigateByUrl(path);
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
