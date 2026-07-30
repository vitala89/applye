import { Injectable, inject, signal } from '@angular/core';
import { AiService, DbService } from '@applye/data';
import { Job, Profile, Settings, SupportedLanguage } from '@applye/core';
import { TranslateService } from '@applye/i18n';
import { ToastService } from '../core/toast/toast.service';

export interface PortalAnswerDraft {
  question: string;
  answer: string;
}

/**
 * Draft-portal-answers state and AI calls, hoisted out of the jobs page
 * component. Job-scoped and short-lived by design: the caller provides it, so
 * one instance lives exactly as long as one page component, which is the
 * lifetime the signals had while they were component fields.
 *
 * `job` / `profile` / `settings` stay owned by the caller and are passed in per
 * call rather than mirrored here, so there is one source of truth for them and
 * no synchronisation to get wrong.
 */
@Injectable()
export class PortalAnswersService {
  private readonly db = inject(DbService);
  private readonly ai = inject(AiService);
  private readonly i18n = inject(TranslateService);
  private readonly toast = inject(ToastService);

  private readonly t = this.i18n.t;

  static readonly DEFAULT_QUESTIONS = [
    'Why this role?',
    'Why this company?',
    'Tell us about a relevant project',
    'What excites you about this?',
  ];

  readonly questions = signal<string[]>([...PortalAnswersService.DEFAULT_QUESTIONS]);
  readonly language = signal<SupportedLanguage>('en');
  readonly answers = signal<PortalAnswerDraft[]>([]);
  readonly drafting = signal(false);
  readonly redrafting = signal<number | null>(null);
  readonly fromCache = signal(false);
  readonly status = signal('');
  readonly error = signal(false);
  readonly copiedIndex = signal<number | null>(null);

  /** Back to the default question set for a newly opened job. */
  reset(language: SupportedLanguage): void {
    this.questions.set([...PortalAnswersService.DEFAULT_QUESTIONS]);
    this.answers.set([]);
    this.fromCache.set(false);
    this.status.set('');
    this.error.set(false);
    this.redrafting.set(null);
    this.copiedIndex.set(null);
    this.language.set(language);
  }

  /** Best-effort cache read for the current default question set. Never calls AI. */
  async loadFromCache(
    job: Job | null,
    profile: Profile | null,
    settings: Settings | null,
  ): Promise<void> {
    const questions = this.trimmedQuestions();
    if (!job || !profile?.scoringHash || !settings || !questions.length) return;
    try {
      const inputHash = await this.inputHash(questions, settings.defaultModel);
      const cached = await this.db.portalAnswersGet(job.id, profile.scoringHash, inputHash);
      if (cached) {
        this.answers.set(JSON.parse(cached.answersJson ?? '[]'));
        this.fromCache.set(true);
      }
    } catch {
      // non-fatal - user can still click "Draft answers"
    }
  }

  addQuestion(): void {
    this.questions.set([...this.questions(), '']);
  }

  updateQuestion(index: number, value: string): void {
    const qs = this.questions().slice();
    qs[index] = value;
    this.questions.set(qs);
  }

  removeQuestion(index: number): void {
    const qs = this.questions().slice();
    qs.splice(index, 1);
    this.questions.set(qs);
  }

  editAnswer(index: number, value: string): void {
    const answers = this.answers().slice();
    if (!answers[index]) return;
    answers[index] = { ...answers[index], answer: value };
    this.answers.set(answers);
  }

  async copyAnswer(index: number): Promise<void> {
    const answer = this.answers()[index]?.answer;
    if (!answer) return;
    await navigator.clipboard.writeText(answer);
    this.copiedIndex.set(index);
    setTimeout(() => this.copiedIndex.set(null), 1500);
  }

  /** One AI call for the whole question set, cached by (job, profile, questions+language+model). */
  async draft(job: Job | null, profile: Profile | null, settings: Settings | null): Promise<void> {
    if (this.drafting()) return;
    const p = profile;
    const s = settings;
    const questions = this.trimmedQuestions();
    if (!job || !p?.scoringJson || !p.scoringHash || !s || !questions.length) return;

    this.drafting.set(true);
    this.error.set(false);
    this.status.set('');
    try {
      const inputHash = await this.inputHash(questions, s.defaultModel);
      const cached = await this.db.portalAnswersGet(job.id, p.scoringHash, inputHash);
      if (cached) {
        this.answers.set(JSON.parse(cached.answersJson ?? '[]'));
        this.fromCache.set(true);
        this.status.set(this.t()('jobs.portal_cached'));
        return;
      }

      const rendered = await this.ai.renderSkill('portal-answers', {
        profile_json: p.scoringJson,
        job_description: job.jdText ?? '',
        questions: JSON.stringify(questions),
        language: this.language(),
      });
      const res = await this.ai.run({
        mode: s.aiMode,
        provider: s.provider,
        model: s.defaultModel,
        systemPrompt: rendered.systemPrompt,
        userPrompt: rendered.userPrompt,
        language: this.language(),
      });
      const parsed = this.parseAnswers(res.text);
      this.answers.set(parsed);
      this.fromCache.set(false);
      await this.db.portalAnswersSave({
        jobId: job.id,
        profileHash: p.scoringHash,
        questionsJson: JSON.stringify(questions),
        answersJson: JSON.stringify(parsed),
        inputHash,
        modelUsed: s.defaultModel,
        tokensInput: res.tokensInput,
        tokensOutput: res.tokensOutput,
      });
      this.status.set(`${res.tokensInput + res.tokensOutput} tokens used.`);
    } catch (e) {
      this.error.set(true);
      this.status.set(String(e));
      this.toast.error(String(e));
    } finally {
      this.drafting.set(false);
    }
  }

  /** Re-drafts a single answer. Always a fresh AI call (a unique variant marker keeps the
   * cache key distinct from both the batch draft and any prior version), still cached. */
  async redraft(
    index: number,
    job: Job | null,
    profile: Profile | null,
    settings: Settings | null,
  ): Promise<void> {
    if (this.redrafting() !== null) return;
    const p = profile;
    const s = settings;
    const current = this.answers()[index];
    if (!job || !p?.scoringJson || !p.scoringHash || !s || !current) return;

    this.redrafting.set(index);
    this.error.set(false);
    try {
      const question = current.question;
      const inputHash = await this.db.hashText(
        `${question}::${this.language()}::${s.defaultModel}::${Date.now()}`,
      );
      const rendered = await this.ai.renderSkill('portal-answers', {
        profile_json: p.scoringJson,
        job_description: job.jdText ?? '',
        questions: JSON.stringify([question]),
        language: this.language(),
      });
      const res = await this.ai.run({
        mode: s.aiMode,
        provider: s.provider,
        model: s.defaultModel,
        systemPrompt: rendered.systemPrompt,
        userPrompt: rendered.userPrompt,
        language: this.language(),
      });
      const parsed = this.parseAnswers(res.text);
      const answer = parsed[0]?.answer ?? current.answer;
      await this.db.portalAnswersSave({
        jobId: job.id,
        profileHash: p.scoringHash,
        questionsJson: JSON.stringify([question]),
        answersJson: JSON.stringify([{ question, answer }]),
        inputHash,
        modelUsed: s.defaultModel,
        tokensInput: res.tokensInput,
        tokensOutput: res.tokensOutput,
      });
      const answers = this.answers().slice();
      answers[index] = { question, answer };
      this.answers.set(answers);
    } catch (e) {
      this.error.set(true);
      this.status.set(String(e));
      this.toast.error(String(e));
    } finally {
      this.redrafting.set(null);
    }
  }

  private trimmedQuestions(): string[] {
    return this.questions()
      .map((q) => q.trim())
      .filter(Boolean);
  }

  private inputHash(questions: string[], model: string): Promise<string> {
    return this.db.hashText(JSON.stringify({ q: questions, lang: this.language(), model }));
  }

  private parseAnswers(text: string): PortalAnswerDraft[] {
    const raw = text
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/\s*```\s*$/i, '')
      .trim();
    let parsed: { answers: PortalAnswerDraft[] };
    try {
      parsed = JSON.parse(raw);
    } catch {
      throw new Error(`AI returned invalid JSON: ${text.slice(0, 200)}`);
    }
    return parsed.answers ?? [];
  }
}
