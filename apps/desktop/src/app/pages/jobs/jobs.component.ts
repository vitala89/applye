import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AiService, DbService } from '@applye/data';
import { Job, Profile, ScoreDimension, ScoringCache, Settings } from '@applye/core';

interface PassResult {
  pass: number;
  resultMd: string;
  changes: string[];
  gaps: string[];
  inputHash: string;
  fromCache: boolean;
  tokensIn: number;
  tokensOut: number;
}

@Component({
  selector: 'app-jobs',
  standalone: true,
  imports: [FormsModule],
  template: `
    <div class="jobs">
      <!-- Paste section -->
      <section class="section">
        <h3 class="eyebrow">Paste job description</h3>
        <textarea
          class="editor"
          [ngModel]="jdText()"
          (ngModelChange)="jdText.set($event)"
          placeholder="Paste the full job description here…"
          spellcheck="false"
        ></textarea>
        <div class="row">
          <button class="btn" [disabled]="parsing() || !jdText().trim()" (click)="parseAndFilter()">
            {{ parsing() ? 'Parsing…' : 'Parse & filter' }}
          </button>
          @if (parseStatus()) {
            <span class="status" [class.status--error]="parseError()">{{ parseStatus() }}</span>
          }
        </div>
      </section>

      <!-- Filter result -->
      @if (job(); as j) {
        <section class="section">
          @if (!j.hardFilterPassed) {
            <div class="card card--danger">
              <p class="card__title">Hard filter failed</p>
              <p class="muted">
                Disqualifying phrase detected (visa / location). No AI tokens used.
              </p>
            </div>
          } @else {
            <div class="card">
              <div class="job-meta">
                <div class="job-meta__info">
                  @if (j.company) {
                    <span class="job-meta__company">{{ j.company }}</span>
                  }
                  @if (j.title) {
                    <span class="job-meta__title">{{ j.title }}</span>
                  }
                  <span class="job-meta__hash">{{ (j.jdHash ?? '').slice(0, 12) }}</span>
                </div>
                <span class="badge badge--pass">Filter passed</span>
              </div>
              <div class="row row--mt">
                @if (!profile()?.scoringJson) {
                  <p class="status status--error">Generate a scoring profile in Profile first.</p>
                } @else {
                  <button class="btn" [disabled]="scoring()" (click)="scoreJob(false)">
                    {{ scoring() ? 'Scoring…' : cache() ? 'Rescore' : 'Score this job' }}
                  </button>
                  @if (scoreStatus()) {
                    <span class="status" [class.status--error]="scoreError()">{{
                      scoreStatus()
                    }}</span>
                  }
                }
              </div>
            </div>
          }
        </section>
      }

      <!-- Scoring result -->
      @if (cache(); as c) {
        <section class="section">
          <!-- Gauge -->
          <div class="card">
            <div class="gauge">
              <span class="gauge__number">{{ c.score }}</span>
              <span class="gauge__sep">/100</span>
              <span class="gauge__stars">{{ starRating(c.score) }} ★</span>
              @if (fromCache()) {
                <span class="badge badge--cache">cached · 0 tokens</span>
              } @else {
                <span class="token-info">{{ c.tokensInput }} in / {{ c.tokensOutput }} out</span>
              }
            </div>
            <div class="gauge__bar-wrap">
              <div class="gauge__bar" [style.width.%]="c.score"></div>
            </div>
            @if (c.summary) {
              <p class="summary">{{ c.summary }}</p>
            }
          </div>

          <!-- Dimensions -->
          @if (dimensions(c).length) {
            <div class="card">
              <h4 class="eyebrow">Dimensions</h4>
              <div class="dim-table">
                @for (d of dimensions(c); track d.name) {
                  <div class="dim-row">
                    <span class="dim-name">{{ d.name }}</span>
                    <span class="dim-score">{{ d.score }}/10</span>
                    <div class="dim-bar-wrap">
                      <div class="dim-bar" [style.width.%]="d.score * 10"></div>
                    </div>
                    @if (d.comment) {
                      <span class="dim-comment">{{ d.comment }}</span>
                    }
                  </div>
                }
              </div>
            </div>
          }

          <!-- Missing keywords -->
          @if (missingKeywords(c).length) {
            <div class="card">
              <h4 class="eyebrow">Missing keywords</h4>
              <div class="chips">
                @for (kw of missingKeywords(c); track kw) {
                  <span class="chip">{{ kw }}</span>
                }
              </div>
            </div>
          }

          <!-- Red flags -->
          @if (redFlags(c).length) {
            <div class="card">
              <h4 class="eyebrow">Red flags</h4>
              <ul class="red-flags">
                @for (flag of redFlags(c); track flag) {
                  <li class="red-flag">{{ flag }}</li>
                }
              </ul>
            </div>
          }

          <!-- ATS -->
          <div class="card">
            <h4 class="eyebrow">ATS check</h4>
            <div
              class="ats-pass"
              [class.ats-pass--ok]="c.atsPass"
              [class.ats-pass--warn]="!c.atsPass"
            >
              {{ c.atsPass ? '✓ Likely to pass ATS scan' : '✗ ATS issues detected' }}
            </div>
            @if (c.atsNotes) {
              <p class="muted" style="margin-top: var(--space-2)">{{ c.atsNotes }}</p>
            }
          </div>

          <!-- Tailoring wizard -->
          @if (tailorResults().length === 0 && !tailoring()) {
            <div class="cta">
              <button
                class="btn btn--primary"
                [disabled]="!profile()?.fullMd"
                (click)="startTailoring()"
              >
                Tailor CV for this job →
              </button>
              @if (!profile()?.fullMd) {
                <span class="status status--error">Add your full profile first.</span>
              }
            </div>
          }

          @if (tailorResults().length > 0 || tailoring()) {
            <div class="wizard">
              <!-- Step indicators -->
              <div class="wizard-steps">
                @for (n of [1, 2, 3]; track n) {
                  <div
                    class="wizard-step"
                    [class.wizard-step--done]="tailorResults().length >= n"
                    [class.wizard-step--active]="tailoring() && tailorResults().length === n - 1"
                  >
                    <span class="wizard-step__num">{{ n }}</span>
                    <span class="wizard-step__label">{{
                      ['XYZ rewrite', 'Critique', 'Final build'][n - 1]
                    }}</span>
                  </div>
                  @if (n < 3) {
                    <span class="wizard-step__sep">→</span>
                  }
                }
              </div>

              <!-- Completed pass results -->
              @for (r of tailorResults(); track r.pass) {
                <div class="card wizard-card">
                  <div class="wizard-pass-header">
                    <h4 class="eyebrow">
                      Pass {{ r.pass }} —
                      {{ ['XYZ Rewrite', 'Dual Critique', 'Final Build'][r.pass - 1] }}
                    </h4>
                    @if (r.fromCache) {
                      <span class="badge badge--cache">cached · 0 tokens</span>
                    } @else {
                      <span class="token-info">{{ r.tokensIn }} in / {{ r.tokensOut }} out</span>
                    }
                  </div>

                  <pre class="wizard-result">{{ r.resultMd }}</pre>

                  @if (r.changes.length) {
                    <details class="wizard-changes">
                      <summary class="eyebrow">Changes ({{ r.changes.length }})</summary>
                      <ul class="change-list">
                        @for (c of r.changes; track c) {
                          <li>{{ c }}</li>
                        }
                      </ul>
                    </details>
                  }

                  @if (r.gaps.length) {
                    <div class="wizard-gaps">
                      <h4 class="eyebrow">Gaps — not addressable from profile</h4>
                      <ul class="gap-list">
                        @for (g of r.gaps; track g) {
                          <li>{{ g }}</li>
                        }
                      </ul>
                    </div>
                  }
                </div>
              }

              <!-- Running -->
              @if (tailoring()) {
                <div class="card card--running">
                  <p class="muted">
                    Running Pass {{ tailorResults().length + 1 }}:
                    {{ ['XYZ Rewrite', 'Dual Critique', 'Final Build'][tailorResults().length] }}…
                  </p>
                </div>
              }

              <!-- Pass CTAs -->
              @if (!tailoring() && tailorResults().length > 0 && tailorResults().length < 3) {
                <div class="row row--mt">
                  <button class="btn btn--primary" (click)="runNextPass()">
                    Continue to Pass {{ tailorResults().length + 1 }}:
                    {{ ['Critique', 'Final Build'][tailorResults().length - 1] }} →
                  </button>
                  <button class="btn" (click)="resetWizard()">Start over</button>
                  @if (tailorStatus()) {
                    <span class="status" [class.status--error]="tailorError()">{{
                      tailorStatus()
                    }}</span>
                  }
                </div>
              }

              <!-- Export (pass 3 done) -->
              @if (!tailoring() && tailorResults().length === 3) {
                <div class="card wizard-export">
                  <h4 class="eyebrow">Export tailored CV</h4>
                  <div class="row">
                    <button
                      class="btn btn--primary"
                      [disabled]="!!exporting()"
                      (click)="doExport('docx')"
                    >
                      {{ exporting() === 'docx' ? 'Exporting…' : 'Export DOCX' }}
                    </button>
                    <button class="btn" [disabled]="!!exporting()" (click)="doExport('pdf')">
                      {{ exporting() === 'pdf' ? 'Exporting…' : 'Export PDF' }}
                    </button>
                    <button class="btn" (click)="resetWizard()">Start over</button>
                  </div>
                  @if (exportStatus()) {
                    <p class="export-path" [class.status--error]="exportError()">
                      {{ exportStatus() }}
                    </p>
                  }
                </div>
              }
            </div>
          }
        </section>
      }
    </div>
  `,
  styles: [
    `
      .jobs {
        display: flex;
        flex-direction: column;
        gap: var(--space-6);
        max-width: 880px;
      }

      .section {
        display: flex;
        flex-direction: column;
        gap: var(--space-3);
      }
      .eyebrow {
        font-family: var(--font-mono);
        font-size: var(--text-2xs);
        font-weight: var(--weight-medium);
        letter-spacing: var(--tracking-wider);
        text-transform: uppercase;
        color: var(--text-tertiary);
        margin: 0;
      }

      .editor {
        width: 100%;
        min-height: 200px;
        padding: var(--space-3);
        font-family: var(--font-mono);
        font-size: var(--text-sm);
        line-height: 1.6;
        color: var(--text-primary);
        background: var(--surface-2);
        border: 1px solid var(--border);
        border-radius: var(--radius-md);
        resize: vertical;
      }
      .editor:focus {
        outline: none;
        border-color: var(--indigo-500, #6366f1);
      }

      .row {
        display: flex;
        align-items: center;
        gap: var(--space-3);
      }
      .row--mt {
        margin-top: var(--space-2);
      }

      .card {
        display: flex;
        flex-direction: column;
        gap: var(--space-3);
        background: var(--surface-1);
        border: 1px solid var(--border);
        border-radius: var(--radius-lg);
        padding: var(--space-4);
      }
      .card--danger {
        border-color: var(--danger);
      }
      .card__title {
        font-weight: var(--weight-medium);
        color: var(--danger);
        margin: 0;
        font-size: var(--text-sm);
      }

      .job-meta {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: var(--space-3);
      }
      .job-meta__info {
        display: flex;
        flex-direction: column;
        gap: var(--space-1);
      }
      .job-meta__company {
        font-size: var(--text-xs);
        color: var(--text-tertiary);
        font-family: var(--font-mono);
      }
      .job-meta__title {
        font-size: var(--text-sm);
        font-weight: var(--weight-medium);
        color: var(--text-primary);
      }
      .job-meta__hash {
        font-size: var(--text-2xs);
        font-family: var(--font-mono);
        color: var(--text-quaternary, var(--text-tertiary));
      }

      /* Gauge */
      .gauge {
        display: flex;
        align-items: baseline;
        gap: var(--space-3);
        flex-wrap: wrap;
      }
      .gauge__number {
        font-size: 3rem;
        font-weight: 700;
        color: var(--indigo-500, #6366f1);
        font-family: var(--font-mono);
        line-height: 1;
      }
      .gauge__sep {
        font-size: var(--text-lg);
        color: var(--text-tertiary);
        font-family: var(--font-mono);
      }
      .gauge__stars {
        font-size: var(--text-xl);
        color: var(--indigo-500, #6366f1);
        font-family: var(--font-mono);
      }
      .gauge__bar-wrap {
        height: 8px;
        background: var(--surface-3);
        border-radius: 4px;
        overflow: hidden;
      }
      .gauge__bar {
        height: 100%;
        background: var(--indigo-500, #6366f1);
        border-radius: 4px;
        transition: width 0.6s ease;
      }

      /* Dimensions */
      .dim-table {
        display: flex;
        flex-direction: column;
        gap: var(--space-2);
      }
      .dim-row {
        display: grid;
        grid-template-columns: 160px 64px 1fr;
        gap: var(--space-3);
        align-items: center;
      }
      .dim-name {
        font-size: var(--text-sm);
        color: var(--text-secondary);
      }
      .dim-score {
        font-family: var(--font-mono);
        font-size: var(--text-xs);
        color: var(--text-primary);
      }
      .dim-bar-wrap {
        height: 4px;
        background: var(--surface-3);
        border-radius: 2px;
      }
      .dim-bar {
        height: 100%;
        background: var(--indigo-500, #6366f1);
        border-radius: 2px;
      }
      .dim-comment {
        font-size: var(--text-xs);
        color: var(--text-secondary);
        grid-column: 2 / -1;
      }

      /* Keywords */
      .chips {
        display: flex;
        flex-wrap: wrap;
        gap: var(--space-2);
      }
      .chip {
        padding: 2px var(--space-2);
        background: var(--surface-3);
        border: 1px solid var(--border);
        border-radius: 999px;
        font-size: var(--text-xs);
        font-family: var(--font-mono);
        color: var(--text-secondary);
      }

      /* Red flags */
      .red-flags {
        list-style: none;
        padding: 0;
        margin: 0;
        display: flex;
        flex-direction: column;
        gap: var(--space-2);
      }
      .red-flag {
        display: flex;
        align-items: flex-start;
        gap: var(--space-2);
        font-size: var(--text-sm);
        color: var(--text-secondary);
      }
      .red-flag::before {
        content: '•';
        color: var(--danger);
        flex-shrink: 0;
      }

      /* ATS */
      .ats-pass {
        font-size: var(--text-sm);
        font-weight: var(--weight-medium);
      }
      .ats-pass--ok {
        color: var(--success, #4ade80);
      }
      .ats-pass--warn {
        color: var(--danger);
      }

      /* Summary */
      .summary {
        font-size: var(--text-sm);
        line-height: 1.7;
        color: var(--text-secondary);
        font-style: italic;
        border-left: 2px solid var(--indigo-500, #6366f1);
        padding-left: var(--space-3);
        margin: 0;
      }

      /* Badges */
      .badge {
        padding: 2px var(--space-2);
        border-radius: 999px;
        font-size: var(--text-xs);
        font-weight: var(--weight-medium);
        font-family: var(--font-mono);
      }
      .badge--pass {
        background: color-mix(in srgb, var(--success, #4ade80) 15%, transparent);
        color: var(--success, #4ade80);
      }
      .badge--cache {
        background: color-mix(in srgb, var(--indigo-500, #6366f1) 15%, transparent);
        color: var(--indigo-500, #6366f1);
      }

      /* CTA / wizard entry */
      .cta {
        display: flex;
        align-items: center;
        gap: var(--space-3);
      }

      /* Wizard */
      .wizard {
        display: flex;
        flex-direction: column;
        gap: var(--space-4);
        margin-top: var(--space-2);
      }
      .wizard-steps {
        display: flex;
        align-items: center;
        gap: var(--space-2);
        padding: var(--space-3) 0;
      }
      .wizard-step {
        display: flex;
        align-items: center;
        gap: var(--space-2);
        padding: var(--space-1) var(--space-3);
        border: 1px solid var(--border);
        border-radius: var(--radius-md);
        opacity: 0.45;
      }
      .wizard-step--done {
        opacity: 1;
        border-color: color-mix(in srgb, var(--indigo-500, #6366f1) 60%, transparent);
      }
      .wizard-step--active {
        opacity: 1;
        border-color: var(--indigo-500, #6366f1);
        background: color-mix(in srgb, var(--indigo-500, #6366f1) 10%, transparent);
      }
      .wizard-step__num {
        font-family: var(--font-mono);
        font-size: var(--text-xs);
        font-weight: var(--weight-medium);
        color: var(--indigo-500, #6366f1);
      }
      .wizard-step__label {
        font-size: var(--text-xs);
        color: var(--text-secondary);
      }
      .wizard-step__sep {
        color: var(--text-quaternary, var(--text-tertiary));
        font-size: var(--text-xs);
      }
      .wizard-card {
        gap: var(--space-3);
      }
      .wizard-pass-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: var(--space-3);
      }
      .wizard-result {
        font-family: var(--font-mono);
        font-size: var(--text-xs);
        line-height: 1.7;
        color: var(--text-secondary);
        background: var(--surface-2);
        border: 1px solid var(--border);
        border-radius: var(--radius-md);
        padding: var(--space-3);
        max-height: 320px;
        overflow-y: auto;
        white-space: pre-wrap;
        word-break: break-word;
        margin: 0;
      }
      .wizard-changes summary {
        cursor: pointer;
        user-select: none;
        padding: var(--space-1) 0;
      }
      .change-list,
      .gap-list {
        list-style: none;
        padding: 0;
        margin: var(--space-2) 0 0;
        display: flex;
        flex-direction: column;
        gap: var(--space-1);
      }
      .change-list li::before {
        content: '✓ ';
        color: var(--success, #4ade80);
      }
      .gap-list li::before {
        content: '⚠ ';
        color: var(--warning, #fb923c);
      }
      .change-list li,
      .gap-list li {
        font-size: var(--text-sm);
        color: var(--text-secondary);
      }
      .wizard-gaps {
        display: flex;
        flex-direction: column;
        gap: var(--space-2);
      }
      .wizard-export {
        gap: var(--space-3);
      }
      .export-path {
        font-family: var(--font-mono);
        font-size: var(--text-xs);
        color: var(--text-secondary);
        word-break: break-all;
        margin: 0;
      }
      .card--running {
        border-style: dashed;
        opacity: 0.8;
      }

      /* Shared */
      .muted {
        font-size: var(--text-sm);
        color: var(--text-secondary);
        margin: 0;
      }
      .status {
        font-size: var(--text-sm);
        color: var(--text-secondary);
      }
      .status--error {
        color: var(--danger);
      }
      .token-info {
        font-family: var(--font-mono);
        font-size: var(--text-xs);
        color: var(--text-tertiary);
      }

      .btn {
        padding: var(--space-2) var(--space-4);
        font-family: var(--font-mono);
        font-size: var(--text-sm);
        font-weight: var(--weight-medium);
        color: var(--text-primary);
        background: var(--surface-3);
        border: 1px solid var(--border);
        border-radius: var(--radius-input);
        cursor: pointer;
        white-space: nowrap;
      }
      .btn:hover:not(:disabled) {
        filter: brightness(1.15);
      }
      .btn:disabled {
        opacity: 0.45;
        cursor: not-allowed;
      }
      .btn--primary {
        background: var(--indigo-500, #6366f1);
        color: #fff;
        border-color: var(--indigo-500, #6366f1);
      }
    `,
  ],
})
export class JobsComponent implements OnInit {
  private readonly db = inject(DbService);
  private readonly ai = inject(AiService);

  readonly jdText = signal('');
  readonly job = signal<Job | null>(null);
  readonly profile = signal<Profile | null>(null);
  readonly settings = signal<Settings | null>(null);
  readonly cache = signal<ScoringCache | null>(null);
  readonly fromCache = signal(false);

  // Tailoring wizard
  readonly tailorResults = signal<PassResult[]>([]);
  readonly tailoring = signal(false);
  readonly tailorStatus = signal('');
  readonly tailorError = signal(false);
  readonly exporting = signal<'docx' | 'pdf' | false>(false);
  readonly exportStatus = signal('');
  readonly exportError = signal(false);

  readonly parsing = signal(false);
  readonly scoring = signal(false);

  readonly parseStatus = signal('');
  readonly parseError = signal(false);
  readonly scoreStatus = signal('');
  readonly scoreError = signal(false);

  async ngOnInit(): Promise<void> {
    try {
      const [p, s] = await Promise.all([this.db.getProfile(), this.db.getSettings()]);
      this.profile.set(p);
      this.settings.set(s);
    } catch {
      // non-fatal — user can still paste
    }
  }

  async parseAndFilter(): Promise<void> {
    this.parsing.set(true);
    this.parseStatus.set('');
    this.parseError.set(false);
    this.job.set(null);
    this.cache.set(null);
    try {
      const j = await this.db.jobPaste(this.jdText());
      this.job.set(j);
      if (!j.hardFilterPassed) {
        this.parseStatus.set('Hard filter failed — job blocked.');
      } else {
        this.parseStatus.set('');
        // Check cache immediately if profile available
        const p = this.profile();
        if (p?.scoringHash && j.id) {
          const cached = await this.db.scoreCacheGet(j.id, p.scoringHash);
          if (cached) {
            this.cache.set(cached);
            this.fromCache.set(true);
            this.scoreStatus.set('Loaded from cache — 0 tokens used.');
          }
        }
      }
    } catch (e) {
      this.parseStatus.set(`Failed: ${String(e)}`);
      this.parseError.set(true);
    } finally {
      this.parsing.set(false);
    }
  }

  async scoreJob(forceRefresh = false): Promise<void> {
    const j = this.job();
    const p = this.profile();
    const s = this.settings();
    if (!j || !p?.scoringJson || !p.scoringHash || !s) return;

    // Cache check (skip on force refresh)
    if (!forceRefresh) {
      const cached = await this.db.scoreCacheGet(j.id!, p.scoringHash);
      if (cached) {
        this.cache.set(cached);
        this.fromCache.set(true);
        this.scoreStatus.set('Loaded from cache — 0 tokens used.');
        return;
      }
    }

    this.scoring.set(true);
    this.scoreStatus.set('');
    this.scoreError.set(false);
    this.fromCache.set(false);
    try {
      const lang = s.defaultDocLanguage ?? 'en';
      const rendered = await this.ai.renderSkill('job-scoring', {
        profile_json: p.scoringJson,
        job_description: this.jdText(),
        language: lang,
      });
      const res = await this.ai.run({
        mode: s.aiMode,
        provider: s.provider,
        model: s.economyModel,
        systemPrompt: rendered.systemPrompt,
        userPrompt: rendered.userPrompt,
        language: lang,
      });

      // Parse AI JSON response
      let parsed: {
        score: number;
        dimensions: ScoreDimension[];
        missing_keywords: string[];
        red_flags: string[];
        ats_pass: boolean;
        ats_notes: string;
        summary: string;
      };
      try {
        const raw = res.text
          .replace(/^```(?:json)?\s*/i, '')
          .replace(/\s*```\s*$/i, '')
          .trim();
        parsed = JSON.parse(raw);
      } catch {
        throw new Error(`AI returned invalid JSON: ${res.text.slice(0, 200)}`);
      }

      const saved = await this.db.scoreCacheSave({
        jobId: j.id!,
        profileHash: p.scoringHash,
        language: lang,
        score: parsed.score,
        dimensionsJson: JSON.stringify(parsed.dimensions),
        missingKeywordsJson: JSON.stringify(parsed.missing_keywords),
        redFlagsJson: JSON.stringify(parsed.red_flags),
        atsPass: parsed.ats_pass,
        atsNotes: parsed.ats_notes,
        summary: parsed.summary,
        modelUsed: s.economyModel,
        tokensInput: res.tokensInput,
        tokensOutput: res.tokensOutput,
      });
      this.cache.set(saved);
      this.scoreStatus.set(`Scored — ${res.tokensInput} in / ${res.tokensOutput} out`);
    } catch (e) {
      this.scoreStatus.set(`Scoring failed: ${String(e)}`);
      this.scoreError.set(true);
    } finally {
      this.scoring.set(false);
    }
  }

  dimensions(c: ScoringCache): ScoreDimension[] {
    try {
      return JSON.parse(c.dimensionsJson ?? '[]');
    } catch {
      return [];
    }
  }

  missingKeywords(c: ScoringCache): string[] {
    try {
      return JSON.parse(c.missingKeywordsJson ?? '[]');
    } catch {
      return [];
    }
  }

  redFlags(c: ScoringCache): string[] {
    try {
      return JSON.parse(c.redFlagsJson ?? '[]');
    } catch {
      return [];
    }
  }

  starRating(score: number): string {
    return ((score / 100) * 4 + 1).toFixed(1);
  }

  // ── Tailoring wizard ────────────────────────────────────────────────────────

  async startTailoring(): Promise<void> {
    this.tailorResults.set([]);
    this.tailorStatus.set('');
    this.tailorError.set(false);
    this.exportStatus.set('');
    await this.runPass(1);
  }

  async runNextPass(): Promise<void> {
    const next = (this.tailorResults().length + 1) as 2 | 3;
    await this.runPass(next);
  }

  resetWizard(): void {
    this.tailorResults.set([]);
    this.tailorStatus.set('');
    this.tailorError.set(false);
    this.exportStatus.set('');
    this.exportError.set(false);
  }

  async doExport(format: 'docx' | 'pdf'): Promise<void> {
    const j = this.job();
    const pass3 = this.tailorResults().find((r) => r.pass === 3);
    if (!j?.id || !pass3) return;

    this.exporting.set(format);
    this.exportStatus.set('');
    this.exportError.set(false);
    try {
      const doc =
        format === 'docx'
          ? await this.db.exportDocx(j.id, pass3.resultMd, j.company ?? '', pass3.inputHash)
          : await this.db.exportPdf(j.id, pass3.resultMd, j.company ?? '', pass3.inputHash);
      this.exportStatus.set(`Saved: ${doc.filePath}`);
    } catch (e) {
      this.exportStatus.set(`Export failed: ${String(e)}`);
      this.exportError.set(true);
    } finally {
      this.exporting.set(false);
    }
  }

  private async runPass(pass: 1 | 2 | 3): Promise<void> {
    this.tailoring.set(true);
    this.tailorStatus.set('');
    this.tailorError.set(false);
    try {
      await this.runTailorPass(pass);
    } catch (e) {
      this.tailorStatus.set(`Pass ${pass} failed: ${String(e)}`);
      this.tailorError.set(true);
    } finally {
      this.tailoring.set(false);
    }
  }

  private async runTailorPass(passNum: 1 | 2 | 3): Promise<void> {
    const j = this.job();
    const p = this.profile();
    const s = this.settings();
    if (!j?.id || !p?.fullMd || !s) return;

    const lang = s.defaultDocLanguage ?? 'en';
    const pass1Md = this.tailorResults().find((r) => r.pass === 1)?.resultMd ?? '';
    const pass2Md = this.tailorResults().find((r) => r.pass === 2)?.resultMd ?? '';

    // Input hash includes all inputs for this pass → correct cache invalidation
    const hashInput = [p.fullMd, this.jdText(), String(passNum), lang, pass1Md, pass2Md].join(
      '\x00',
    );
    const inputHash = await this.db.hashText(hashInput);

    const cached = await this.db.tailoringCacheGet(j.id, passNum, inputHash);
    if (cached) {
      this.appendPassResult(
        passNum,
        cached.resultMd,
        cached.changesJson,
        cached.gapsJson,
        inputHash,
        true,
        0,
        0,
      );
      this.tailorStatus.set(`Pass ${passNum} loaded from cache — 0 tokens.`);
      return;
    }

    const scoringJson = this.cache() ? JSON.stringify(this.cache()) : '{}';
    const rendered = await this.ai.renderSkill('resume-tailoring', {
      profile_md: p.fullMd,
      job_description: this.jdText(),
      scoring_json: scoringJson,
      pass: String(passNum),
      language: lang,
      pass1_result: pass1Md,
      pass2_result: pass2Md,
    });

    const res = await this.ai.run({
      mode: s.aiMode,
      provider: s.provider,
      model: s.defaultModel,
      systemPrompt: rendered.systemPrompt,
      userPrompt: rendered.userPrompt,
      language: lang,
    });

    const parsed = this.parsePassResult(res.text, passNum);

    await this.db.tailoringCacheSave({
      jobId: j.id,
      pass: passNum,
      inputHash,
      resultMd: parsed.result_md,
      changesJson: JSON.stringify(parsed.changes),
      gapsJson: JSON.stringify(parsed.gaps),
      modelUsed: s.defaultModel,
      tokensInput: res.tokensInput,
      tokensOutput: res.tokensOutput,
    });

    this.appendPassResult(
      passNum,
      parsed.result_md,
      JSON.stringify(parsed.changes),
      JSON.stringify(parsed.gaps),
      inputHash,
      false,
      res.tokensInput,
      res.tokensOutput,
    );
    this.tailorStatus.set(`Pass ${passNum} done — ${res.tokensInput} in / ${res.tokensOutput} out`);
  }

  private appendPassResult(
    pass: number,
    resultMd: string,
    changesJson: string | undefined,
    gapsJson: string | undefined,
    inputHash: string,
    fromCache: boolean,
    tokensIn: number,
    tokensOut: number,
  ): void {
    this.tailorResults.update((r) => [
      ...r,
      {
        pass,
        resultMd,
        inputHash,
        fromCache,
        tokensIn,
        tokensOut,
        changes: this.parseJsonArray(changesJson),
        gaps: this.parseJsonArray(gapsJson),
      },
    ]);
  }

  private parsePassResult(
    text: string,
    pass: number,
  ): { result_md: string; changes: string[]; gaps: string[] } {
    try {
      const raw = text
        .replace(/^```(?:json)?\s*/i, '')
        .replace(/\s*```\s*$/i, '')
        .trim();
      const parsed = JSON.parse(raw);
      return {
        result_md: String(parsed.result_md ?? ''),
        changes: Array.isArray(parsed.changes) ? parsed.changes : [],
        gaps: Array.isArray(parsed.gaps) ? parsed.gaps : [],
      };
    } catch {
      throw new Error(`Pass ${pass} returned invalid JSON: ${text.slice(0, 200)}`);
    }
  }

  private parseJsonArray(json: string | undefined): string[] {
    try {
      return JSON.parse(json ?? '[]');
    } catch {
      return [];
    }
  }
}
