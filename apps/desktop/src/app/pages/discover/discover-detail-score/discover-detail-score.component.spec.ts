import { ComponentFixture, TestBed } from '@angular/core/testing';
import { CompensationVerdict } from '@applye/core';
import { TranslateService } from '@applye/i18n';
import { DetailVerdict, DiscoverDetailScoreComponent } from './discover-detail-score.component';

interface Inputs {
  score?: number | null;
  verdict?: DetailVerdict;
  tip?: string;
  hasCompTarget?: boolean;
  compVerdict?: CompensationVerdict;
  sourceLabel?: string;
  location?: string | null;
  posted?: string;
  skills?: string[];
}

function createFixture(over: Inputs = {}): ComponentFixture<DiscoverDetailScoreComponent> {
  TestBed.configureTestingModule({
    imports: [DiscoverDetailScoreComponent],
    providers: [TranslateService],
  });
  const fixture = TestBed.createComponent(DiscoverDetailScoreComponent);
  const set = {
    score: 72,
    verdict: 'good' as DetailVerdict,
    tip: 'Mentions TYPESCRIPT',
    hasCompTarget: false,
    compVerdict: 'unknown' as CompensationVerdict,
    sourceLabel: 'Remote OK',
    location: 'Berlin, Germany',
    posted: '2 days ago',
    skills: [] as string[],
    ...over,
  };
  for (const [k, v] of Object.entries(set)) fixture.componentRef.setInput(k, v);
  fixture.detectChanges();
  return fixture;
}

function q(fixture: ComponentFixture<DiscoverDetailScoreComponent>, sel: string): Element | null {
  return fixture.nativeElement.querySelector(sel);
}

function inst(fixture: ComponentFixture<DiscoverDetailScoreComponent>) {
  return fixture.componentInstance as unknown as {
    ringDash: (score: number) => string;
    compBadgeLabel: () => string;
    t: () => (key: string) => string;
  };
}

describe('DiscoverDetailScoreComponent', () => {
  afterEach(() => TestBed.resetTestingModule());

  describe('the score card', () => {
    /** Queried by the ring rather than by `.dv-detail__card`, which all three
     * cards in this sidebar share. */
    it('is absent until the job has been scored', () => {
      const fixture = createFixture({ score: null });
      expect(q(fixture, '.dv-detail__scorehead')).toBeNull();
      expect(q(fixture, '.dv-detail__ringwrap')).toBeNull();
    });

    it('shows the raw score and keeps the ring on the verdict', () => {
      const fixture = createFixture({ score: 72, verdict: 'good' });
      expect(q(fixture, '.dv-detail__ringnum b')?.textContent?.trim()).toBe('72');
      expect(q(fixture, '.dv-detail__ringfill')?.getAttribute('class')).toContain(
        'dv-detail__ringfill--good',
      );
    });

    /** r=40, so the full circle is 2*pi*40. The filled arc is that times the
     * score; the gap is the whole circumference, not the remainder. */
    it('draws the ring arc in proportion to the score', () => {
      const c = 2 * Math.PI * 40;
      const ringDash = inst(createFixture()).ringDash;
      expect(ringDash(0)).toBe(`0 ${c}`);
      expect(ringDash(100)).toBe(`${c} ${c}`);
      expect(ringDash(50)).toBe(`${c / 2} ${c}`);
    });

    it('renders the tip it was given rather than deriving one', () => {
      const fixture = createFixture({ tip: 'Mentions RUST' });
      expect(q(fixture, '.dv-detail__tipbody p')?.textContent?.trim()).toBe('Mentions RUST');
    });
  });

  describe('rescoring', () => {
    /** A strong match has nothing to gain from a rescore, so the button is
     * replaced by the reason rather than left to spend tokens. */
    it('offers no rescore on a strong match', () => {
      const fixture = createFixture({ verdict: 'strong' });
      expect(q(fixture, '.dv-detail__rescore')).toBeNull();
      expect(q(fixture, '.dv-detail__norescore')).not.toBeNull();
    });

    it('offers a rescore on anything weaker, and asks the page to run it', () => {
      const fixture = createFixture({ verdict: 'partial' });
      const seen: MouseEvent[] = [];
      fixture.componentInstance.rescoreRequested.subscribe((e) => seen.push(e));

      const button = q(fixture, '.dv-detail__rescore') as HTMLButtonElement;
      expect(q(fixture, '.dv-detail__norescore')).toBeNull();
      button.click();

      expect(seen.length).toBe(1);
    });
  });

  describe('the compensation card', () => {
    it('is absent when the profile states no target', () => {
      expect(q(createFixture({ hasCompTarget: false }), '.dv-comp-card')).toBeNull();
    });

    it('says "not stated" when the job does not name a salary', () => {
      const fixture = createFixture({ hasCompTarget: true, compVerdict: 'unknown' });
      expect(q(fixture, '.dv-comp-badge--muted')).not.toBeNull();
    });

    /** Only "below" is a warning; at or above the target both read as good. */
    it('warns only when the job pays below the target', () => {
      for (const v of ['above', 'within'] as CompensationVerdict[]) {
        const fixture = createFixture({ hasCompTarget: true, compVerdict: v });
        expect(q(fixture, '.dv-comp-badge')?.classList.contains('dv-comp-badge--good')).toBe(true);
        expect(q(fixture, '.dv-comp-badge')?.classList.contains('dv-comp-badge--warn')).toBe(false);
        TestBed.resetTestingModule();
      }
      const below = createFixture({ hasCompTarget: true, compVerdict: 'below' });
      expect(q(below, '.dv-comp-badge')?.classList.contains('dv-comp-badge--warn')).toBe(true);
      expect(q(below, '.dv-comp-badge')?.classList.contains('dv-comp-badge--good')).toBe(false);
    });

    /** Each verdict must map to its own label, not merely to a different one:
     * swapping "above" and "within" keeps all four distinct while telling the
     * user their target is beaten when it is only met. */
    it('gives each verdict its own label', () => {
      const expected: Record<string, string> = {
        above: 'comp.badge_above',
        within: 'comp.badge_within',
        below: 'comp.badge_below',
        unknown: 'comp.not_stated',
      };
      for (const [verdict, key] of Object.entries(expected)) {
        const fixture = createFixture({
          hasCompTarget: true,
          compVerdict: verdict as CompensationVerdict,
        });
        const component = inst(fixture);
        expect(component.compBadgeLabel()).toBe(component.t()(key));
        TestBed.resetTestingModule();
      }
    });
  });

  describe('the facts card', () => {
    it('shows source and posted date, and omits location when the job has none', () => {
      const fixture = createFixture({ location: null, sourceLabel: 'Remote OK', posted: '3d ago' });
      const facts = [...fixture.nativeElement.querySelectorAll('.dv-detail__fact b')].map(
        (b: Element) => b.textContent?.trim(),
      );
      expect(facts).toEqual(['Remote OK', '3d ago']);
    });

    it('shows location when the job has one', () => {
      const fixture = createFixture({ location: 'Berlin, Germany' });
      const facts = [...fixture.nativeElement.querySelectorAll('.dv-detail__fact b')].map(
        (b: Element) => b.textContent?.trim(),
      );
      expect(facts).toContain('Berlin, Germany');
    });

    it('hides the skills block entirely when none were detected', () => {
      const fixture = createFixture({ skills: [] });
      expect(q(fixture, '.dv-detail__skills')).toBeNull();
      // The divider only earns its place above a list that exists.
      expect(q(fixture, '.dv-detail__divider')).toBeNull();
    });

    it('lists every detected skill', () => {
      const fixture = createFixture({ skills: ['TypeScript', 'Rust', 'SQL'] });
      const skills = [...fixture.nativeElement.querySelectorAll('.dv-detail__skill')].map(
        (s: Element) => s.textContent?.trim(),
      );
      expect(skills).toEqual(['TypeScript', 'Rust', 'SQL']);
    });
  });
});
