import { Injectable, computed, inject, signal } from '@angular/core';
import { AiService, DbService, DraftsGateway } from '@applye/data';
import { PipelineCard, SupportedLanguage } from '@applye/core';
import { openUrl } from '@tauri-apps/plugin-opener';

export const FOLLOWUP_LANGUAGES: SupportedLanguage[] = ['en', 'de', 'ru', 'es', 'fr', 'uk'];

// Spelled out for the prompt: a bare 2-letter code (esp. "uk") is ambiguous
// enough that weaker/economy models sometimes ignore it and default to
// English. The cache key still stores the short code.
const FOLLOWUP_LANGUAGE_NAMES: Record<SupportedLanguage, string> = {
  en: 'English',
  de: 'German',
  ru: 'Russian',
  es: 'Spanish',
  fr: 'French',
  uk: 'Ukrainian',
};

const MS_PER_DAY = 1000 * 60 * 60 * 24;

/**
 * Some models double-escape newlines inside the JSON string value (e.g. emit
 * `\\n` instead of `\n`), which JSON.parse then turns into a literal
 * two-character "\n" in the output instead of a real line break. Normalize that
 * away; a correctly-escaped response is untouched by this regex since it no
 * longer contains a literal backslash at that point.
 *
 * Pure, so the quirk is testable without an AI call.
 */
export function parseFollowupDraft(text: string): { subject: string; body: string } {
  const parsed = JSON.parse(text) as { subject?: string; body?: string };
  const clean = (s?: string) => (s ?? '').replace(/\\n/g, '\n').trim();
  return { subject: clean(parsed.subject), body: clean(parsed.body) };
}

/**
 * Drafting a follow-up email for one pipeline card, hoisted out of the
 * quick-view modal.
 *
 * One cached AI call per (application, language, model). Applye never sends
 * anything: `openInMail` hands a pre-filled `mailto:` link to the user's own
 * mail client, which is the only thing that can transmit it. There is no other
 * code path here that sends mail.
 */
@Injectable()
export class FollowupDraftService {
  private readonly db = inject(DbService);
  /** Follow-up drafts moved to their own gateway; `db` stays for `hashText`
   * and `getSettings`. */
  private readonly drafts = inject(DraftsGateway);
  private readonly ai = inject(AiService);

  readonly language = signal<SupportedLanguage>('en');
  readonly subject = signal('');
  readonly body = signal('');
  readonly drafting = signal(false);
  readonly fromCache = signal(false);
  readonly error = signal('');
  readonly copied = signal(false);
  readonly to = signal('');
  readonly cc = signal('');

  readonly hasDraft = computed(() => !!this.subject() || !!this.body());

  langName(language: SupportedLanguage): string {
    return FOLLOWUP_LANGUAGE_NAMES[language];
  }

  /** Clears the draft for a newly shown card, seeding the language from it. */
  resetFor(card: PipelineCard): void {
    this.language.set(card.docLanguage ?? 'en');
    this.clearDraft();
    this.error.set('');
    this.copied.set(false);
    this.to.set('');
    this.cc.set('');
  }

  /** A different language is a different draft, so the current one goes. */
  changeLanguage(language: SupportedLanguage): void {
    this.language.set(language);
    this.clearDraft();
  }

  private clearDraft(): void {
    this.subject.set('');
    this.body.set('');
    this.fromCache.set(false);
  }

  private daysSinceApplied(card: PipelineCard, now: number): number {
    if (!card.appliedAt) return 0;
    return Math.max(0, Math.round((now - new Date(card.appliedAt).getTime()) / MS_PER_DAY));
  }

  private inputHash(card: PipelineCard, model: string): Promise<string> {
    return this.db.hashText(
      JSON.stringify({
        company: card.company ?? '',
        role: card.title ?? '',
        appliedAt: card.appliedAt ?? '',
        lang: this.language(),
        model,
      }),
    );
  }

  /** Serves the cached draft when one exists for this exact input, otherwise
   * spends tokens on a fresh one. Errors surface in `error` and are rethrown so
   * the caller can also toast them. */
  async draft(card: PipelineCard): Promise<void> {
    if (this.drafting()) return;
    // Claim the flag before the first await, not after it. Reading settings is
    // asynchronous, so a second click landing during that read used to pass the
    // guard above and start a second billed draft that also wrote the cache.
    this.drafting.set(true);
    this.error.set('');
    try {
      const settings = await this.db.getSettings();
      const inputHash = await this.inputHash(card, settings.economyModel);
      const cached = await this.drafts.followupDraftGet(card.id, inputHash);
      if (cached) {
        this.subject.set(cached.subject);
        this.body.set(cached.body);
        this.fromCache.set(true);
        return;
      }

      const rendered = await this.ai.renderSkill('followup', {
        company: card.company ?? '',
        role: card.title ?? '',
        days_overdue: String(this.daysSinceApplied(card, Date.now())),
        language: FOLLOWUP_LANGUAGE_NAMES[this.language()],
      });
      const res = await this.ai.run({
        mode: settings.aiMode,
        provider: settings.provider,
        model: settings.economyModel,
        systemPrompt: rendered.systemPrompt,
        userPrompt: rendered.userPrompt,
        language: this.language(),
      });
      const parsed = parseFollowupDraft(res.text);
      this.subject.set(parsed.subject);
      this.body.set(parsed.body);
      this.fromCache.set(false);
      await this.drafts.followupDraftSave({
        applicationId: card.id,
        inputHash,
        language: this.language(),
        subject: parsed.subject,
        body: parsed.body,
        modelUsed: settings.economyModel,
        tokensInput: res.tokensInput,
        tokensOutput: res.tokensOutput,
      });
    } catch (e) {
      this.error.set(String(e));
      throw e;
    } finally {
      this.drafting.set(false);
    }
  }

  async copy(): Promise<void> {
    await navigator.clipboard.writeText(`${this.subject()}\n\n${this.body()}`);
    this.copied.set(true);
    setTimeout(() => this.copied.set(false), 1500);
  }

  /**
   * Opens the user's own mail client via `mailto:`. Built by hand (not
   * URLSearchParams) because mailto: query values use RFC 3986
   * percent-encoding, where a space is `%20` - URLSearchParams encodes spaces
   * as `+`, which most mail clients show literally instead of decoding.
   */
  async openInMail(): Promise<void> {
    const to = encodeURIComponent(this.to().trim());
    const params = [
      ['subject', this.subject()],
      ['cc', this.cc().trim()],
      ['body', this.body()],
    ]
      .filter(([, value]) => value)
      .map(([key, value]) => `${key}=${encodeURIComponent(value)}`)
      .join('&');
    await openUrl(`mailto:${to}?${params}`);
  }
}
