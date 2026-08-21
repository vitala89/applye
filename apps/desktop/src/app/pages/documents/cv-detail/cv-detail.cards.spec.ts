import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router } from '@angular/router';
import { CV_STYLE_DEFAULT, resolvePageSettings } from '@applye/core';
import { AiService, DocumentsGateway, JobsGateway, ProfileSettingsGateway } from '@applye/data';
import { TranslateService } from '@applye/i18n';
import { CvStyleStore, ToastService } from '@applye/application';
import { CvDetailComponent } from './cv-detail.component';

/**
 * The settings card, the Style card, the photo editor and the save-template
 * dialog are views the page drives through inputs and outputs. What the
 * extraction can break is the **wiring**, and it is invisible to everything
 * else: the three toggle chips carry three interchangeable `output<void>()`s,
 * the margin grid carries one payload with a side in it, and `ngc` type-checks
 * all of them identically. The existing `cv-detail` specs assert that these
 * blocks *render*; these assert that a click lands on the right signal.
 *
 * `cv-detail.style.spec.ts` is 622/600 territory and `cv-detail.component.spec.ts`
 * is 482, so this is a third file rather than an addition to either.
 */
describe('CvDetailComponent card wiring', () => {
  let component: CvDetailComponent;
  let fixture: ComponentFixture<CvDetailComponent>;

  /** The resolved margins. The page used to expose `currentMargin`; the Style
   * card owns page geometry now (ADR-0005, amendment sixty-four), so this reads
   * the same value from the store the card writes to. These tests still drive
   * the real `<input>`s, which is the wiring they exist to check. */
  const margins = () =>
    resolvePageSettings(fixture.debugElement.injector.get(CvStyleStore).style().page).margin;

  beforeEach(async () => {
    const docItem = {
      id: 1,
      docType: 'cv' as const,
      source: 'generated' as const,
      isDefault: false,
      regionTag: 'generic',
      styleJson: JSON.stringify(CV_STYLE_DEFAULT),
      contentJson: JSON.stringify({
        sections: [
          {
            key: 'personal_details',
            order: 0,
            visible: true,
            fullName: 'Jane Doe',
            birthDate: '1990-01-01',
            maritalStatus: 'single',
          },
        ],
      }),
    };
    // One stub object, several tokens - the document library and its exports
    // come from `DocumentsGateway`, the rest from the gateways this component's
    // dependency graph reaches.
    const docsStub = {
      documentLibraryGet: jest.fn().mockResolvedValue(docItem),
      cvTemplatesList: jest.fn().mockResolvedValue([]),
      // A profile WITH a photo, because `CvPhotoStore.dataUri` gates the
      // placement chips - with a null profile the photo editor renders
      // only its "add in profile" branch and the placement wiring is
      // unreachable. A mutation that broke that wiring survived until
      // this fixture carried an image.
      getProfile: jest.fn().mockResolvedValue({
        photoDataUri: 'data:image/png;base64,iVBORw0KGgo=',
      }),
      checkStyleSafety: jest.fn().mockResolvedValue([]),
      documentLibraryUpsert: jest.fn().mockResolvedValue(docItem),
      listApplications: jest.fn().mockResolvedValue([]),
    };
    await TestBed.configureTestingModule({
      imports: [CvDetailComponent],
      providers: [
        { provide: ProfileSettingsGateway, useValue: docsStub },
        { provide: JobsGateway, useValue: docsStub },
        { provide: DocumentsGateway, useValue: docsStub },
        { provide: AiService, useValue: {} },
        TranslateService,
        ToastService,
        {
          provide: ActivatedRoute,
          useValue: {
            snapshot: { paramMap: { get: () => '1' }, queryParamMap: { get: () => null } },
          },
        },
        { provide: Router, useValue: { navigate: jest.fn() } },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(CvDetailComponent);
    component = fixture.componentInstance;
    await fixture.whenStable();
    fixture.detectChanges();
  });

  function root(): HTMLElement {
    return fixture.nativeElement as HTMLElement;
  }

  /** photo, birthdate, marital - in the order the card renders them. */
  function chips(): HTMLButtonElement[] {
    return Array.from(root().querySelectorAll('.docedit-chip-row .docedit-chip'));
  }

  /** top, right, bottom, left - in the order the grid renders them. */
  function marginInputs(): HTMLInputElement[] {
    return Array.from(root().querySelectorAll('.docedit-margin-field input'));
  }

  function typeInto(el: HTMLInputElement | HTMLSelectElement, value: string): void {
    el.value = value;
    el.dispatchEvent(new Event('input'));
    el.dispatchEvent(new Event('change'));
    fixture.detectChanges();
  }

  describe('the settings card renders three interchangeable toggles', () => {
    it('the card is mounted as a component, not inlined', () => {
      expect(root().querySelector('app-cv-settings-card')).toBeTruthy();
      expect(chips()).toHaveLength(3);
    });

    it('the birthdate chip toggles only the birthdate', () => {
      const before = {
        photo: component.includePhoto(),
        marital: component.includeMaritalStatus(),
      };
      const was = component.includeBirthdate();

      chips()[1].click();
      fixture.detectChanges();

      expect(component.includeBirthdate()).toBe(!was);
      expect(component.includePhoto()).toBe(before.photo);
      expect(component.includeMaritalStatus()).toBe(before.marital);
    });

    it('the marital-status chip toggles only marital status', () => {
      const before = {
        photo: component.includePhoto(),
        birthdate: component.includeBirthdate(),
      };
      const was = component.includeMaritalStatus();

      chips()[2].click();
      fixture.detectChanges();

      expect(component.includeMaritalStatus()).toBe(!was);
      expect(component.includePhoto()).toBe(before.photo);
      expect(component.includeBirthdate()).toBe(before.birthdate);
    });

    it('the photo chip toggles the photo, and neither of the other two', () => {
      const before = {
        birthdate: component.includeBirthdate(),
        marital: component.includeMaritalStatus(),
      };
      const was = component.includePhoto();

      chips()[0].click();
      fixture.detectChanges();

      expect(component.includePhoto()).toBe(!was);
      expect(component.includeBirthdate()).toBe(before.birthdate);
      expect(component.includeMaritalStatus()).toBe(before.marital);
    });

    it('the default checkbox toggles isDefault', () => {
      const was = component.isDefault();
      (root().querySelector('.cvdetail__checkbox') as HTMLButtonElement).click();
      fixture.detectChanges();

      expect(component.isDefault()).toBe(!was);
    });

    it('the region select writes regionTag', () => {
      const select = root().querySelector('.docedit-meta-row select') as HTMLSelectElement;
      typeInto(select, 'de');

      expect(component.regionTag()).toBe('de');
    });
  });

  describe('the Style card carries a side in its payload', () => {
    it('the card is mounted as a component', () => {
      expect(root().querySelector('app-cv-page-style-card')).toBeTruthy();
      expect(marginInputs()).toHaveLength(4);
    });

    it('editing the RIGHT margin moves only the right margin', () => {
      const before = margins();
      typeInto(marginInputs()[1], '25');

      const after = margins();
      expect(after.right).toBe(25);
      expect(after.top).toBe(before.top);
      expect(after.bottom).toBe(before.bottom);
      expect(after.left).toBe(before.left);
    });

    it('editing the BOTTOM margin moves only the bottom margin', () => {
      const before = margins();
      typeInto(marginInputs()[2], '7');

      const after = margins();
      expect(after.bottom).toBe(7);
      expect(after.top).toBe(before.top);
      expect(after.right).toBe(before.right);
      expect(after.left).toBe(before.left);
    });

    it('the clamp runs in the card, which now owns page geometry', () => {
      typeInto(marginInputs()[0], '999');
      expect(margins().top).toBe(50);
    });

    it('the page-size select writes the page size', () => {
      // [0] is the theme picker, [1] is the page size - the card renders them
      // in that order, and the theme select is the reason this is not [0].
      const selects = root().querySelectorAll<HTMLSelectElement>('.docedit-style-grid select');
      expect(selects).toHaveLength(2);
      typeInto(selects[1], 'letter');

      expect(component.style().page?.size).toBe('letter');
    });
  });

  describe('the photo editor is a component like its six siblings', () => {
    /** The photo chip is what creates the section, so turn it on first. */
    function openPhotoSection(): HTMLButtonElement[] {
      chips()[0].click();
      fixture.detectChanges();
      return Array.from(root().querySelectorAll('.cvdetail__chip-row .cvdetail__chip'));
    }

    it('renders through app-cv-photo-editor once the photo section exists', () => {
      openPhotoSection();

      expect(component.sections().some((s) => s.key === 'photo')).toBe(true);
      expect(root().querySelector('app-cv-photo-editor')).toBeTruthy();
    });

    it('a placement chip writes that placement, and nothing else', () => {
      const placements = openPhotoSection();
      expect(placements).toHaveLength(3);
      expect(component.photoPlacement()).toBe('above_left');

      placements[2].click();
      fixture.detectChanges();

      expect(component.photoPlacement()).toBe('above_right');

      placements[1].click();
      fixture.detectChanges();

      expect(component.photoPlacement()).toBe('above_center');
    });

    it('marks the active placement chip, so the control reflects the value', () => {
      const placements = openPhotoSection();
      placements[2].click();
      fixture.detectChanges();

      const active = Array.from(
        root().querySelectorAll('.cvdetail__chip--active'),
      ) as HTMLElement[];
      expect(active).toHaveLength(1);
      expect(active[0]).toBe(placements[2]);
    });
  });

  describe('the save-template dialog', () => {
    it('is absent until opened, then mounted as a component', () => {
      expect(root().querySelector('app-cv-save-template-modal')).toBeNull();

      component.openSaveTemplate();
      fixture.detectChanges();

      expect(root().querySelector('app-cv-save-template-modal')).toBeTruthy();
    });

    it('the name field writes saveTemplateName, and cancel closes', () => {
      component.openSaveTemplate();
      fixture.detectChanges();

      const input = root().querySelector('.modal input[type="text"]') as HTMLInputElement;
      typeInto(input, 'Berlin CV');
      expect(component.saveTemplateName()).toBe('Berlin CV');

      (root().querySelector('.modal__actions .btn--ghost') as HTMLButtonElement).click();
      fixture.detectChanges();
      expect(component.saveTemplateOpen()).toBe(false);
    });

    it('confirm is disabled while the name is blank', () => {
      component.openSaveTemplate();
      fixture.detectChanges();

      const confirm = root().querySelector('.modal__actions .btn--primary') as HTMLButtonElement;
      expect(confirm.disabled).toBe(true);

      typeInto(root().querySelector('.modal input[type="text"]') as HTMLInputElement, 'X');
      expect(confirm.disabled).toBe(false);
    });
  });
});
