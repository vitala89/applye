import { ComponentFixture, TestBed } from '@angular/core/testing';
import { TranslateService } from '@applye/i18n';
import { type FeedRow } from '../discover-feed';
import { DetailVerdict } from '../discover-detail-score/discover-detail-score.component';
import { DiscoverDetailHeroComponent, HeroArchetype } from './discover-detail-hero.component';

function row(over: Partial<FeedRow> = {}): FeedRow {
  return {
    id: 1,
    title: 'Senior Frontend Engineer',
    company: 'Northwind Labs',
    location: 'Berlin, Germany',
    source: 'remoteok',
    createdAt: '2026-08-01',
    isNew: false,
    saved: false,
    ...over,
  } as unknown as FeedRow;
}

interface Inputs {
  row?: FeedRow;
  sourceLabel?: string;
  posted?: string;
  score?: number | null;
  verdict?: DetailVerdict;
  archetype?: HeroArchetype | null;
  matchedKeywords?: string[];
}

function createFixture(over: Inputs = {}): ComponentFixture<DiscoverDetailHeroComponent> {
  TestBed.configureTestingModule({
    imports: [DiscoverDetailHeroComponent],
    providers: [TranslateService],
  });
  const fixture = TestBed.createComponent(DiscoverDetailHeroComponent);
  const set: Required<Inputs> = {
    row: row(),
    sourceLabel: 'Remote OK',
    posted: '4 days ago',
    score: 72,
    verdict: 'good',
    archetype: null,
    matchedKeywords: [],
    ...over,
  };
  for (const [k, v] of Object.entries(set)) fixture.componentRef.setInput(k, v);
  fixture.detectChanges();
  return fixture;
}

function q(f: ComponentFixture<DiscoverDetailHeroComponent>, s: string): Element | null {
  return f.nativeElement.querySelector(s);
}

function inst(f: ComponentFixture<DiscoverDetailHeroComponent>) {
  return f.componentInstance as unknown as { initials: (c: string | null) => string };
}

describe('DiscoverDetailHeroComponent', () => {
  afterEach(() => TestBed.resetTestingModule());

  describe('the company mark', () => {
    it('takes the first letter of the first two words', () => {
      const initials = inst(createFixture()).initials;
      expect(initials('Northwind Labs')).toBe('NL');
      expect(initials('Acme')).toBe('A');
      // Third word and beyond are dropped rather than crammed in.
      expect(initials('Bundesanstalt für Arbeit GmbH')).toBe('BF');
    });

    it('falls back to a question mark rather than rendering an empty box', () => {
      const initials = inst(createFixture()).initials;
      expect(initials(null)).toBe('?');
      expect(initials('   ')).toBe('?');
    });

    it('renders the mark for the row it was given', () => {
      const fixture = createFixture({ row: row({ company: 'Northwind Labs' }) });
      expect(q(fixture, '.dv-detail__logo')?.textContent?.trim()).toBe('NL');
    });
  });

  describe('the meta row', () => {
    it('shows the source label and age it was given rather than deriving them', () => {
      const fixture = createFixture({ sourceLabel: 'Hacker News', posted: 'yesterday' });
      expect(q(fixture, '.dv-detail__srcitem')?.textContent).toContain('Hacker News');
      expect(fixture.nativeElement.textContent).toContain('yesterday');
    });

    /** The marker is for unsaved discoveries: once saved it has done its job. */
    it('marks a new row as new only while it is unsaved', () => {
      expect(
        q(createFixture({ row: row({ isNew: true, saved: false }) }), '.dv-row__new'),
      ).not.toBeNull();
      TestBed.resetTestingModule();
      expect(
        q(createFixture({ row: row({ isNew: true, saved: true }) }), '.dv-row__new'),
      ).toBeNull();
      TestBed.resetTestingModule();
      expect(
        q(createFixture({ row: row({ isNew: false, saved: false }) }), '.dv-row__new'),
      ).toBeNull();
    });

    it('shows no match chip before the row has been scored', () => {
      expect(q(createFixture({ score: null }), '.dv-detail__matchchip')).toBeNull();
    });

    /** Every verdict, not just the strong one: a chip pinned to a single tier
     * still reads correctly on that tier while tinting every other score as a
     * strong match. */
    it('keys the match chip on the verdict it was given', () => {
      for (const verdict of ['strong', 'good', 'partial'] as DetailVerdict[]) {
        const fixture = createFixture({ score: 84, verdict });
        expect(q(fixture, '.dv-detail__matchchip')?.getAttribute('class')).toContain(
          `dv-detail__matchchip--${verdict}`,
        );
        TestBed.resetTestingModule();
      }
    });

    it('shows the score inside the chip', () => {
      const fixture = createFixture({ score: 84, verdict: 'strong' });
      expect(q(fixture, '.dv-detail__matchchip')?.textContent).toContain('84');
    });
  });

  describe('the archetype badge', () => {
    it('is absent when the row matches no archetype', () => {
      expect(q(createFixture({ archetype: null }), '.dv-arch-badge')).toBeNull();
    });

    /** The tier drives the modifier class, so a mismatch would tint the badge
     * for the wrong tier while still reading correctly. */
    it('renders the label and keys the tier class on the fit', () => {
      const fixture = createFixture({ archetype: { fit: 'primary', label: 'Primary match' } });
      const badge = q(fixture, '.dv-arch-badge');
      expect(badge?.textContent?.trim()).toBe('Primary match');
      expect(badge?.classList.contains('dv-arch-badge--primary')).toBe(true);
    });
  });

  describe('company, location and keywords', () => {
    it('omits the location row when the job has none', () => {
      expect(q(createFixture({ row: row({ location: null }) }), '.dv-detail__loc')).toBeNull();
    });

    it('shows the location when the job has one', () => {
      const fixture = createFixture({ row: row({ location: 'Hamburg' }) });
      expect(q(fixture, '.dv-detail__loc')?.textContent).toContain('Hamburg');
    });

    it('hides the keyword strip entirely when nothing matched', () => {
      expect(q(createFixture({ matchedKeywords: [] }), '.dv-row__keywords')).toBeNull();
    });

    it('lists every matched keyword', () => {
      const fixture = createFixture({ matchedKeywords: ['TYPESCRIPT', 'ANGULAR'] });
      const kws = [...fixture.nativeElement.querySelectorAll('.dv-row__kw')].map((e: Element) =>
        e.textContent?.trim(),
      );
      expect(kws).toEqual(['TYPESCRIPT', 'ANGULAR']);
    });
  });

  describe('the actions', () => {
    it('asks the page to go back', () => {
      const fixture = createFixture();
      let backs = 0;
      fixture.componentInstance.backRequested.subscribe(() => backs++);
      (q(fixture, '.dv-detail__back') as HTMLButtonElement).click();
      expect(backs).toBe(1);
    });

    it('offers Save on an unsaved row and asks the page to run it', () => {
      const fixture = createFixture({ row: row({ saved: false }) });
      const seen: MouseEvent[] = [];
      fixture.componentInstance.saveRequested.subscribe((e) => seen.push(e));

      expect(q(fixture, '.dv-row__savedbadge')).toBeNull();
      (q(fixture, '.dv-btn') as HTMLButtonElement).click();

      expect(seen.length).toBe(1);
    });

    /** A saved row shows the badge instead: there is nothing left to do. */
    it('replaces Save with the saved badge once the row is saved', () => {
      const fixture = createFixture({ row: row({ saved: true }) });
      expect(q(fixture, '.dv-btn')).toBeNull();
      expect(q(fixture, '.dv-row__savedbadge')).not.toBeNull();
    });
  });
});
