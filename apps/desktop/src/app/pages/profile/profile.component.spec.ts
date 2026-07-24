import { TestBed } from '@angular/core/testing';
import { serializeProfileForm, parseProfileMd, EMPTY_FORM } from '@applye/core';
import { AiService, DbService } from '@applye/data';
import { TranslateService } from '@applye/i18n';
import { OnboardingService } from '../../core/onboarding/onboarding.service';
import { ToastService } from '../../core/toast/toast.service';
import { ProfileComponent } from './profile.component';

function createComponent(): ProfileComponent {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    imports: [ProfileComponent],
    providers: [
      {
        provide: DbService,
        useValue: {
          getProfile: jest.fn().mockResolvedValue(null),
          getSettings: jest
            .fn()
            .mockResolvedValue({ uiLanguage: 'en', aiMode: 'api', provider: 'openai' }),
          upsertProfile: jest.fn(),
          hashText: jest.fn().mockResolvedValue('hash'),
        },
      },
      {
        provide: AiService,
        useValue: { renderSkill: jest.fn(), run: jest.fn() },
      },
      { provide: OnboardingService, useValue: { open: () => false, start: jest.fn() } },
      TranslateService,
      ToastService,
    ],
  });
  const fixture = TestBed.createComponent(ProfileComponent);
  return fixture.componentInstance;
}

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

describe('name backfill', () => {
  it('fills the two fields from the H1 when the markdown has no Contact name lines', () => {
    const c = createComponent();
    c.applyLoadedMarkdown('# Anna Kowalska\n\n## Contact\n- Email: anna@example.com');
    expect(c.form().name).toBe('Anna Kowalska');
    expect(c.form().firstName).toBe('Anna');
    expect(c.form().lastName).toBe('Kowalska');
  });

  it('leaves the stored split alone when the markdown already carries it', () => {
    const c = createComponent();
    c.applyLoadedMarkdown(
      '# Anna Maria Kowalska\n\n## Contact\n- First name: Anna\n- Last name: Maria Kowalska',
    );
    expect(c.form().firstName).toBe('Anna');
    expect(c.form().lastName).toBe('Maria Kowalska');
  });

  it('recomposes the display name when a part is edited', () => {
    const c = createComponent();
    c.applyLoadedMarkdown('# Anna Kowalska');
    c.updateField('lastName', 'Nowak');
    expect(c.form().name).toBe('Anna Nowak');
  });
});
