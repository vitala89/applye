import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router } from '@angular/router';
import { AiService, DbService } from '@applye/data';
import { TranslateService } from '@applye/i18n';
import { ToastService } from '../../../core/toast/toast.service';
import { CvDetailComponent, mergePersonalField } from './cv-detail.component';

describe('mergePersonalField', () => {
  it('ignores empty/whitespace, keeps current', () => {
    expect(mergePersonalField('', 'Vitalii')).toBe('Vitalii');
    expect(mergePersonalField('   ', 'Vitalii')).toBe('Vitalii');
    expect(mergePersonalField(undefined, 'Vitalii')).toBe('Vitalii');
    expect(mergePersonalField('New', 'Vitalii')).toBe('New');
  });
});

describe('CvDetailComponent per-section style', () => {
  let component: CvDetailComponent;

  beforeEach(async () => {
    const dbStub: Partial<DbService> = {
      documentLibraryGet: jest.fn().mockResolvedValue(null),
      cvTemplatesList: jest.fn().mockResolvedValue([]),
      checkStyleSafety: jest.fn().mockResolvedValue([]),
    };

    await TestBed.configureTestingModule({
      imports: [CvDetailComponent],
      providers: [
        { provide: DbService, useValue: dbStub },
        { provide: AiService, useValue: {} },
        TranslateService,
        ToastService,
        {
          provide: ActivatedRoute,
          useValue: {
            snapshot: {
              paramMap: { get: () => '1' },
              queryParamMap: { get: () => null },
            },
          },
        },
        { provide: Router, useValue: { navigate: jest.fn() } },
      ],
    }).compileComponents();

    const fixture = TestBed.createComponent(CvDetailComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('setSectionStyle writes an override and re-emits', () => {
    component.setSectionStyle('experience', { fontWeight: 700 });
    expect(component.style().sectionStyles?.experience?.fontWeight).toBe(700);
    expect(component.effStyle('experience').fontWeight).toBe(700);
  });

  it('resetSectionStyle clears the override back to inherit', () => {
    component.setSectionStyle('experience', { fontSizePt: 13, colorHex: '#0a5' });
    component.resetSectionStyle('experience');
    expect(component.style().sectionStyles?.experience).toBeUndefined();
    expect(component.effStyle('experience').colorHex).toBe(component.style().accentColorHex);
  });

  it('toggleStylePopover opens and closes the same key', () => {
    expect(component.openStyleKey()).toBeNull();
    component.toggleStylePopover('summary');
    expect(component.openStyleKey()).toBe('summary');
    component.toggleStylePopover('summary');
    expect(component.openStyleKey()).toBeNull();
  });

  it('removePhoto clears the stored dataUri', () => {
    component.photoDataUri.set('data:image/jpeg;base64,AAAA');
    component.removePhoto();
    expect(component.photoDataUri()).toBeNull();
  });

  it('toggleIncludePhoto adds a photo section when turning on if none exists', () => {
    component.sections.set([{ key: 'personal_details', order: 0, visible: true, fullName: 'X' }]);
    component.includePhoto.set(false);

    component.toggleIncludePhoto();

    expect(component.includePhoto()).toBe(true);
    const photo = component.sections().find((s) => s.key === 'photo');
    expect(photo).toBeDefined();
    expect(photo?.visible).toBe(true);
    expect(component.sections()[0].key).toBe('photo');
  });

  it('toggleIncludePhoto off keeps the photo section (bytes retained)', () => {
    component.sections.set([
      { key: 'photo', order: 0, visible: true, dataUri: 'data:image/jpeg;base64,AAAA' },
      { key: 'personal_details', order: 1, visible: true, fullName: 'X' },
    ]);
    component.includePhoto.set(true);

    component.toggleIncludePhoto();

    expect(component.includePhoto()).toBe(false);
    expect(component.sections().some((s) => s.key === 'photo')).toBe(true);
  });
});
