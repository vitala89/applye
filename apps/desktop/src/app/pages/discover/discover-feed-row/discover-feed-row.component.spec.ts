import { ComponentFixture, TestBed } from '@angular/core/testing';
import { TranslateService } from '@applye/i18n';
import { type FeedRow, type RowArchetype } from '../discover-feed';
import { DiscoverFeedRowComponent } from './discover-feed-row.component';

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
  archetype?: RowArchetype | null;
  matchedKeywords?: string[];
}

/**
 * Resets first, so a test may build more than one row. `configureTestingModule`
 * throws once the module has been instantiated, and several of these cases read
 * the same element across two or three input combinations.
 */
function createFixture(over: Inputs = {}): ComponentFixture<DiscoverFeedRowComponent> {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    imports: [DiscoverFeedRowComponent],
    providers: [TranslateService],
  });
  const fixture = TestBed.createComponent(DiscoverFeedRowComponent);
  const set: Required<Inputs> = {
    row: row(),
    sourceLabel: 'REMOTEOK',
    posted: '4 days ago',
    archetype: null,
    matchedKeywords: [],
    ...over,
  };
  for (const [k, v] of Object.entries(set)) fixture.componentRef.setInput(k, v);
  fixture.detectChanges();
  return fixture;
}

function q(f: ComponentFixture<DiscoverFeedRowComponent>, s: string): Element | null {
  return f.nativeElement.querySelector(s);
}

function texts(f: ComponentFixture<DiscoverFeedRowComponent>, s: string): string[] {
  return [...f.nativeElement.querySelectorAll(s)].map((e: Element) => e.textContent?.trim() ?? '');
}

describe('DiscoverFeedRowComponent', () => {
  afterEach(() => TestBed.resetTestingModule());

  describe('the title line', () => {
    it('renders the title and company of the row it was given', () => {
      const fixture = createFixture({ row: row({ title: 'Rust Engineer', company: 'Acme' }) });
      expect(q(fixture, '.dv-row__title')?.textContent?.trim()).toBe('Rust Engineer');
      expect(q(fixture, '.dv-row__company')?.textContent?.trim()).toBe('Acme');
    });

    /** The marker is for unsaved discoveries: once saved it has done its job. */
    it('marks a new row as new only while it is unsaved', () => {
      expect(
        q(createFixture({ row: row({ isNew: true, saved: false }) }), '.dv-row__new'),
      ).not.toBeNull();
      expect(
        q(createFixture({ row: row({ isNew: true, saved: true }) }), '.dv-row__new'),
      ).toBeNull();
      expect(
        q(createFixture({ row: row({ isNew: false, saved: false }) }), '.dv-row__new'),
      ).toBeNull();
    });

    it('shows the saved badge only for a saved row', () => {
      expect(q(createFixture({ row: row({ saved: false }) }), '.dv-row__savedbadge')).toBeNull();
      expect(q(createFixture({ row: row({ saved: true }) }), '.dv-row__savedbadge')).not.toBeNull();
    });
  });

  describe('the archetype badge', () => {
    it('is absent when the page resolved no archetype', () => {
      expect(q(createFixture({ archetype: null }), '.dv-arch-badge')).toBeNull();
    });

    /**
     * `label` is the badge text and `fit` is its tint. Asserting only one tier
     * would let a badge pinned to that tier pass while mis-tinting every other,
     * and asserting only the class would let the tier key render as the label.
     */
    it('renders the label as text and the tier as the modifier class, for every tier', () => {
      for (const [fit, label] of [
        ['primary', 'Primary match'],
        ['secondary', 'Secondary match'],
        ['adjacent', 'Adjacent'],
      ]) {
        const badge = q(createFixture({ archetype: { fit, label } }), '.dv-arch-badge');
        expect(badge?.textContent?.trim()).toBe(label);
        expect(badge?.classList.contains('dv-arch-badge--' + fit)).toBe(true);
      }
    });
  });

  describe('the meta line', () => {
    it('shows the source label and age it was given rather than deriving them', () => {
      const fixture = createFixture({ sourceLabel: 'WWR', posted: 'yesterday' });
      expect(q(fixture, '.dv-row__srcbadge')?.textContent?.trim()).toBe('WWR');
      expect(q(fixture, '.dv-row__metaitem--dim')?.textContent?.trim()).toBe('yesterday');
    });

    it('omits the location item when the row has no location', () => {
      const withLoc = texts(
        createFixture({ row: row({ location: 'Berlin, Germany' }) }),
        '.dv-row__metaitem',
      );
      const without = texts(createFixture({ row: row({ location: null }) }), '.dv-row__metaitem');
      expect(withLoc).toContain('Berlin, Germany');
      expect(without.length).toBe(withLoc.length - 1);
    });
  });

  describe('the matched keywords', () => {
    it('hides the whole strip, label included, when nothing matched', () => {
      expect(q(createFixture({ matchedKeywords: [] }), '.dv-row__keywords')).toBeNull();
    });

    it('renders every keyword it was given, in order', () => {
      const fixture = createFixture({ matchedKeywords: ['ANGULAR', 'RUST', 'SQL'] });
      expect(texts(fixture, '.dv-row__kw')).toEqual(['ANGULAR', 'RUST', 'SQL']);
      expect(q(fixture, '.dv-row__matchedlbl')).not.toBeNull();
    });
  });

  /**
   * The separator between feed rows sits on the host, because the page's
   * `.dv-feed > :last-child { border-bottom: none }` matches this element and
   * not the `.dv-row` inside it. jsdom resolves `display` from a `:host` rule
   * but returns nothing for the border longhands, so this pins the half that
   * can be asserted - a host left inline would collapse the row's box whether
   * or not the border survived.
   */
  it('is a block-level host', () => {
    const host = createFixture().nativeElement as HTMLElement;
    expect(getComputedStyle(host).display).toBe('block');
  });

  describe('the actions', () => {
    it('offers Save and Dismiss for an unsaved row, and neither for a saved one', () => {
      const unsaved = createFixture({ row: row({ saved: false }) });
      expect(q(unsaved, '.dv-btn--secondary')).not.toBeNull();
      expect(q(unsaved, '.dv-iconbtn')).not.toBeNull();
      expect(q(unsaved, '.dv-row__inmyjobs')).toBeNull();

      const saved = createFixture({ row: row({ saved: true }) });
      expect(q(saved, '.dv-btn--secondary')).toBeNull();
      expect(q(saved, '.dv-iconbtn')).toBeNull();
      expect(q(saved, '.dv-row__inmyjobs')).not.toBeNull();
    });

    it('asks to open the row on click and on Enter', () => {
      const fixture = createFixture();
      let opened = 0;
      fixture.componentInstance.openRequested.subscribe(() => opened++);

      (q(fixture, '.dv-row__main') as HTMLElement).click();
      expect(opened).toBe(1);

      q(fixture, '.dv-row__main')?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
      expect(opened).toBe(2);
    });

    it('asks to save, and to dismiss, from the button that means it', () => {
      const fixture = createFixture({ row: row({ saved: false }) });
      let saved = 0;
      let dismissed = 0;
      fixture.componentInstance.saveRequested.subscribe(() => saved++);
      fixture.componentInstance.dismissRequested.subscribe(() => dismissed++);

      (q(fixture, '.dv-btn--secondary') as HTMLElement).click();
      expect([saved, dismissed]).toEqual([1, 0]);

      (q(fixture, '.dv-iconbtn') as HTMLElement).click();
      expect([saved, dismissed]).toEqual([1, 1]);
    });

    /**
     * Both buttons sit inside `.dv-row__main`, which opens the detail on click.
     * The page's `saveRow`/`dismissRow` call `stopPropagation()` as their first
     * statement, and that only works if the output carries the live DOM event
     * and is emitted synchronously inside the dispatch. Saving a row from the
     * feed must not also navigate into it.
     */
    it('hands over the live event, so a consumer that stops propagation is not also asked to open', () => {
      const fixture = createFixture({ row: row({ saved: false }) });
      let opened = 0;
      fixture.componentInstance.openRequested.subscribe(() => opened++);
      fixture.componentInstance.saveRequested.subscribe((e) => e.stopPropagation());
      fixture.componentInstance.dismissRequested.subscribe((e) => e.stopPropagation());

      (q(fixture, '.dv-btn--secondary') as HTMLElement).click();
      (q(fixture, '.dv-iconbtn') as HTMLElement).click();
      expect(opened).toBe(0);
    });
  });
});
