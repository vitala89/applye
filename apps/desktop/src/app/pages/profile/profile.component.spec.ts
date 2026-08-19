import { ComponentFixture, TestBed } from '@angular/core/testing';
import { serializeProfileForm, parseProfileMd, EMPTY_FORM } from '@applye/core';
import { AiService, DbService, SystemGateway } from '@applye/data';
import { TranslateService } from '@applye/i18n';
import { OnboardingService } from '../../core/onboarding/onboarding.service';
import { ToastService } from '@applye/application';
import { ProfileStore } from '@applye/application';
import { ProfileComponent } from './profile.component';

function createFixture(): ComponentFixture<ProfileComponent> {
  TestBed.resetTestingModule();
  // One stub, two tokens - `SystemGateway` now serves the shared
  // operations, and the rest of this stub is still `DbService`'s.
  const dbStub = {
    getProfile: jest.fn().mockResolvedValue(null),
    getSettings: jest
      .fn()
      .mockResolvedValue({ uiLanguage: 'en', aiMode: 'api', provider: 'openai' }),
    upsertProfile: jest.fn(),
    hashText: jest.fn().mockResolvedValue('hash'),
  };
  TestBed.configureTestingModule({
    imports: [ProfileComponent],
    providers: [
      { provide: DbService, useValue: dbStub },
      { provide: SystemGateway, useValue: dbStub },
      {
        provide: AiService,
        useValue: { renderSkill: jest.fn(), run: jest.fn() },
      },
      { provide: OnboardingService, useValue: { open: () => false, start: jest.fn() } },
      TranslateService,
      ToastService,
    ],
  });
  return TestBed.createComponent(ProfileComponent);
}

/**
 * The page's state lives in a component-scoped `ProfileStore` (ADR-0005,
 * amendment thirty-seven), so the form assertions below read it through the
 * component's own injector. The assertions themselves are unchanged.
 */
function createStore(): ProfileStore {
  return createFixture().debugElement.injector.get(ProfileStore);
}

function storeOf(fixture: ComponentFixture<ProfileComponent>): ProfileStore {
  return fixture.debugElement.injector.get(ProfileStore);
}

/**
 * A fixture whose initial load has finished. `ProfileStore.load` sets `loading`
 * while it runs and reseeds the sections when it finishes, so arranging state
 * before it settles is arranging against a store that is about to overwrite it.
 */
async function settledFixture(): Promise<ComponentFixture<ProfileComponent>> {
  const fixture = createFixture();
  fixture.detectChanges();
  await new Promise((resolve) => setTimeout(resolve, 0));
  return fixture;
}

/**
 * `_profile-shell.scss` gives `flex: 1` to `.field-row > .field` and
 * `.field-row > app-profile-text-field`, because those are the two shapes the
 * row's children take. It has to name the flex items themselves: extracting a
 * field into a component once put a host element between the row and `.field`,
 * which left the rule on an element that was no longer the flex item, and the
 * fields collapsed to their content width with half the row empty.
 *
 * jsdom does no layout, so the widths cannot be asserted here. The shape can:
 * a child of any other kind means the stylesheet no longer describes the row.
 */
describe('field-row children are the shapes the stylesheet gives flex to', () => {
  const FLEXED = ['app-profile-text-field', 'div.field'];

  it('has no field-row child outside those two shapes', async () => {
    const fixture = createFixture();
    fixture.detectChanges();
    // `ngOnInit` is async and nothing tracks it under zoneless, so `whenStable`
    // can resolve while the page is still on its loading branch. A macrotask
    // runs after every pending microtask, which is all the stubs need.
    await new Promise((resolve) => setTimeout(resolve, 0));
    fixture.detectChanges();

    const rows = [...fixture.nativeElement.querySelectorAll('.field-row')];
    expect(rows.length).toBeGreaterThan(0);

    const children = rows.flatMap((row: Element) => [...row.children]);
    const unflexed = children.filter((c) => !FLEXED.some((sel) => c.matches(sel)));

    expect(unflexed.map((c) => c.tagName.toLowerCase() + '.' + c.className)).toEqual([]);
    // Both shapes really occur, or the rule's other half is untested.
    expect(children.some((c) => c.matches('app-profile-text-field'))).toBe(true);
    expect(children.some((c) => c.matches('div.field'))).toBe(true);
  });
});

describe('ProfileComponent form/md sync (unit-level contract)', () => {
  it('form → md → form is stable for a filled form', () => {
    const form = {
      ...EMPTY_FORM,
      name: 'Jane',
      title: 'Dev',
      location: 'EU',
      skills: ['Go'],
    };
    expect(parseProfileMd(serializeProfileForm(form))).toEqual(form);
  });

  it('toggling to raw and back preserves an unknown section', () => {
    const md = '# Jane\nDev · EU\n\n## Awards\nPrize';
    const roundTripped = serializeProfileForm(parseProfileMd(md));
    expect(roundTripped).toContain('## Awards');
    expect(roundTripped).toContain('Prize');
  });
});

describe('unmatchable target role warning', () => {
  function warnings(fixture: ComponentFixture<ProfileComponent>): string[] {
    fixture.detectChanges();
    return Array.from(
      fixture.nativeElement.querySelectorAll('.archetype-card__warn') as NodeListOf<HTMLElement>,
    ).map((el) => el.textContent?.trim() ?? '');
  }

  it('warns about a role whose words are all generic', async () => {
    const fixture = await settledFixture();
    const c = storeOf(fixture);
    c.loading.set(false);
    c.sectionOpen.update((s) => ({ ...s, archetypes: true }));
    c.archetypes.set([{ name: 'Senior Engineer', fit: 'primary', sellWhen: '' }]);
    expect(warnings(fixture)).toHaveLength(1);
  });

  it('stays silent for a role with a distinctive word, including a short one', async () => {
    const fixture = await settledFixture();
    const c = storeOf(fixture);
    c.loading.set(false);
    c.sectionOpen.update((s) => ({ ...s, archetypes: true }));
    c.archetypes.set([
      { name: 'UI Engineer', fit: 'primary', sellWhen: '' },
      { name: 'Senior Angular Engineer', fit: 'secondary', sellWhen: '' },
    ]);
    expect(warnings(fixture)).toHaveLength(0);
  });

  it('says nothing about a name the user has not typed yet', async () => {
    const fixture = await settledFixture();
    const c = storeOf(fixture);
    c.loading.set(false);
    c.sectionOpen.update((s) => ({ ...s, archetypes: true }));
    c.archetypes.set([{ name: '  ', fit: 'primary', sellWhen: '' }]);
    expect(warnings(fixture)).toHaveLength(0);
  });
});

describe('name backfill', () => {
  it('fills the two fields from the H1 when the markdown has no Contact name lines', () => {
    const c = createStore();
    c.editor.applyLoadedMarkdown('# Anna Kowalska\n\n## Contact\n- Email: anna@example.com');
    expect(c.editor.form().name).toBe('Anna Kowalska');
    expect(c.editor.form().firstName).toBe('Anna');
    expect(c.editor.form().lastName).toBe('Kowalska');
  });

  it('leaves the stored split alone when the markdown already carries it', () => {
    const c = createStore();
    c.editor.applyLoadedMarkdown(
      '# Anna Maria Kowalska\n\n## Contact\n- First name: Anna\n- Last name: Maria Kowalska',
    );
    expect(c.editor.form().firstName).toBe('Anna');
    expect(c.editor.form().lastName).toBe('Maria Kowalska');
  });

  it('recomposes the display name when a part is edited', () => {
    const c = createStore();
    c.editor.applyLoadedMarkdown('# Anna Kowalska');
    c.editor.updateField('lastName', 'Nowak');
    expect(c.editor.form().name).toBe('Anna Nowak');
  });

  it('never blanks the display name when both parts are cleared', () => {
    const c = createStore();
    c.editor.applyLoadedMarkdown('# Anna Kowalska');
    c.editor.updateField('firstName', '');
    c.editor.updateField('lastName', '');
    // A composition that comes out empty never overwrites, so the last
    // non-empty one stands and the generated documents keep a name on them.
    expect(c.editor.form().name).toBe('Kowalska');
  });

  it('re-adopts the composed name after the display name itself is cleared', () => {
    const c = createStore();
    c.editor.applyLoadedMarkdown('# Anna Kowalska');
    c.editor.updateField('name', '');
    c.editor.updateField('firstName', 'Ania');
    expect(c.editor.form().name).toBe('Ania Kowalska');
  });

  it('leaves a hand-set display name alone when a part is edited afterwards', () => {
    const c = createStore();
    c.editor.applyLoadedMarkdown(
      '# Anna Nowak\n\n## Contact\n- First name: Anna\n- Last name: Kowalska',
    );
    c.editor.updateField('firstName', 'Ania');
    expect(c.editor.form().name).toBe('Anna Nowak');
    expect(c.editor.form().firstName).toBe('Ania');
  });

  it('follows the parts again once the display name matches them', () => {
    const c = createStore();
    c.editor.applyLoadedMarkdown(
      '# Anna Nowak\n\n## Contact\n- First name: Anna\n- Last name: Kowalska',
    );
    c.editor.updateField('name', 'Anna Kowalska');
    c.editor.updateField('lastName', 'Nowak');
    expect(c.editor.form().name).toBe('Anna Nowak');
  });
});
