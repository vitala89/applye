import { Injectable, computed, inject, signal } from '@angular/core';
import { AiService, DbService } from '@applye/data';
import {
  CURRENCY_OPTIONS,
  normalizeCurrency,
  parseArchetypesSkillResponse,
  parseCompRange,
} from './onboarding-content.util';
import type { OnboardingAiDispatch } from './onboarding-resume.service';

/** The band the compensation slider draws against, in thousands. */
const COMP_BAND = { lo: 50, hi: 300 };

/**
 * Step 4 of the wizard: which roles the user is targeting, and for how much.
 *
 * Built like its siblings - the wizard provides it, the step component reads and
 * mutates it directly.
 *
 * **Three flags exist to tell "unauthored" apart from "chosen".** An empty role
 * selection is a real answer, and a re-suggest must not undo the user's own
 * edits: `selectionSeeded` distinguishes a blank nobody has touched from one the
 * user emptied, `rejectedRoles` remembers what they unchecked, and `compTouched`
 * stops a suggestion overwriting a range they typed. Without those three, every
 * "Suggest again" quietly reverted the user's work.
 */
@Injectable()
export class OnboardingTargetingService {
  private readonly db = inject(DbService);
  private readonly ai = inject(AiService);

  readonly suggestedRoles = signal<string[]>([]);
  readonly archetypes = signal<string[]>([]);
  readonly suggesting = signal(false);
  /** True once the selection has a deliberate author - the first AI suggestion,
   * or the roles seeded from an existing profile on a re-run. */
  readonly selectionSeeded = signal(false);
  /** Roles the user unchecked by hand - a re-suggest must not bring them back. */
  readonly rejectedRoles = signal<ReadonlySet<string>>(new Set());

  readonly currencyOptions = CURRENCY_OPTIONS;
  readonly compCurrency = signal<string>('USD');
  readonly compMin = signal(80);
  readonly compMax = signal(120);
  /** Set once the user edits the range by hand, so a re-suggest leaves it alone. */
  readonly compTouched = signal(false);

  /** Suggested roles first, then anything the user added, with no duplicates. */
  readonly displayRoles = computed(() => {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const r of [...this.suggestedRoles(), ...this.archetypes()]) {
      if (!seen.has(r)) {
        seen.add(r);
        out.push(r);
      }
    }
    return out;
  });

  readonly compLeft = computed(() => this.trackPct(this.compMin() - COMP_BAND.lo));
  readonly compRight = computed(() => this.trackPct(COMP_BAND.hi - this.compMax()));

  private trackPct(span: number): string {
    const pct = (span / (COMP_BAND.hi - COMP_BAND.lo)) * 100;
    return `${Math.max(0, Math.min(100, pct)).toFixed(1)}%`;
  }

  isRoleOn(role: string): boolean {
    return this.archetypes().includes(role);
  }

  toggleRole(role: string): void {
    const removing = this.archetypes().includes(role);
    this.archetypes.update((a) => (removing ? a.filter((r) => r !== role) : [...a, role]));
    this.rejectedRoles.update((rejected) => {
      const next = new Set(rejected);
      if (removing) next.add(role);
      else next.delete(role);
      return next;
    });
  }

  addArchetype(v: string): void {
    const t = v.trim();
    if (t) this.toggleRole(t);
  }

  setCompMin(v: string): void {
    this.compMin.set(this.toAmount(v));
    this.compTouched.set(true);
  }

  setCompMax(v: string): void {
    this.compMax.set(this.toAmount(v));
    this.compTouched.set(true);
  }

  setCompCurrency(v: string): void {
    this.compCurrency.set(v);
    this.compTouched.set(true);
  }

  private toAmount(v: string): number {
    const n = parseInt(v.replace(/[^0-9]/g, ''), 10);
    return isNaN(n) ? 0 : n;
  }

  /** Seeds the selection from an existing profile on a re-run, and marks it
   * authored so the resume-driven suggestion that follows adds to these roles
   * rather than replacing them. */
  seedRoles(roles: string[]): void {
    this.archetypes.set(roles);
    this.suggestedRoles.set(roles);
    this.selectionSeeded.set(true);
  }

  /**
   * Asks the model for roles and a pay range, from the resume text the wizard
   * hands over.
   *
   * **Suggestion is an enhancement, not a requirement**: a failure is swallowed
   * on purpose, because the user can confirm or add roles by hand and blocking
   * the step over an optional call would be the worse answer. It also never
   * advances the wizard - the Targeting step offers this same action as "Suggest
   * again", and advancing there would throw the user off the step they are on.
   */
  async suggest(resumeText: string, dispatch: OnboardingAiDispatch): Promise<void> {
    const text = resumeText.trim();
    if (!text || this.suggesting()) return;
    this.suggesting.set(true);
    try {
      const settings = await this.db.getSettings();
      const language = settings.uiLanguage ?? 'en';
      const rendered = await this.ai.renderSkill('onboarding-archetypes', {
        cv_text: text,
        language,
      });
      const res = await this.ai.run({
        ...dispatch,
        systemPrompt: rendered.systemPrompt,
        userPrompt: rendered.userPrompt,
        language,
      });
      this.adopt(parseArchetypesSkillResponse(res.text));
    } catch {
      // Fail soft - see the note above.
    } finally {
      this.suggesting.set(false);
    }
  }

  /**
   * The first suggestion seeds the selection; every later one only offers its
   * roles as chips. Union-ing on a re-suggest would re-check roles the user had
   * just unchecked, and an empty selection is a real choice - not the same state
   * as "never suggested", which is why this needs `selectionSeeded` rather than
   * an `archetypes().length` test.
   */
  private adopt(parsed: { archetypes: string[]; compRange: string | null }): void {
    this.suggestedRoles.set(parsed.archetypes);
    if (this.selectionSeeded()) {
      this.archetypes.update((current) => [
        ...current,
        ...parsed.archetypes.filter((r) => !current.includes(r) && !this.rejectedRoles().has(r)),
      ]);
    } else {
      this.archetypes.set(parsed.archetypes);
    }
    this.selectionSeeded.set(true);
    // Comp is a single range with no user-authored parts to preserve, and it is
    // only ever seeded before the user reaches the step - but once they have
    // edited it, a re-suggest must not overwrite their number.
    if (!this.compTouched()) {
      const range = parseCompRange(parsed.compRange);
      this.compCurrency.set(normalizeCurrency(range.currency));
      this.compMin.set(range.min);
      this.compMax.set(range.max);
    }
  }
}
