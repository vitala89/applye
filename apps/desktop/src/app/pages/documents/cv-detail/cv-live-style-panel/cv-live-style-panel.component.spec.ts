import { ComponentFixture, TestBed } from '@angular/core/testing';
import {
  CV_STYLE_DEFAULT,
  type CvSectionKey,
  type CvSectionStyle,
  type CvTextStyle,
} from '@applye/core';
import { TranslateService } from '@applye/i18n';
import { CvLiveStylePanelComponent } from './cv-live-style-panel.component';

describe('CvLiveStylePanelComponent', () => {
  let component: CvLiveStylePanelComponent;
  let fixture: ComponentFixture<CvLiveStylePanelComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [CvLiveStylePanelComponent],
      providers: [TranslateService],
    }).compileComponents();

    fixture = TestBed.createComponent(CvLiveStylePanelComponent);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('style', CV_STYLE_DEFAULT);
    fixture.componentRef.setInput('selection', null);
  });

  it('shows an empty state and no controls when nothing is selected', () => {
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.cvlive__empty')).toBeTruthy();
    expect(fixture.nativeElement.querySelector('select')).toBeNull();
  });

  it('emits cleaned body patches for font/size/weight/colour/line-height', () => {
    fixture.componentRef.setInput('selection', { sectionKey: 'summary', part: 'body' });
    fixture.detectChanges();
    const events: { key: CvSectionKey; patch: Partial<CvSectionStyle> }[] = [];
    component.styleChange.subscribe((e) => events.push(e));

    component.setBodyFont('Arial');
    component.setBodySize('12');
    component.setBodyWeight(700);
    component.setBodyColor('#123456');
    component.setLineHeight(1.6);

    expect(events).toEqual([
      { key: 'summary', patch: { fontFamily: 'Arial' } },
      { key: 'summary', patch: { fontSizePt: 12 } },
      { key: 'summary', patch: { fontWeight: 700 } },
      { key: 'summary', patch: { colorHex: '#123456' } },
      { key: 'summary', patch: { lineHeight: 1.6 } },
    ]);
  });

  it('inherit clears font (undefined) and line height (undefined)', () => {
    fixture.componentRef.setInput('selection', { sectionKey: 'summary', part: 'body' });
    const events: { key: CvSectionKey; patch: Partial<CvSectionStyle> }[] = [];
    component.styleChange.subscribe((e) => events.push(e));

    component.setBodyFont('');
    component.setLineHeight(null);

    expect(events).toEqual([
      { key: 'summary', patch: { fontFamily: undefined } },
      { key: 'summary', patch: { lineHeight: undefined } },
    ]);
  });

  it('offers a line-height control for the body scope only, not for titles', () => {
    fixture.componentRef.setInput('selection', { sectionKey: 'summary', part: 'body' });
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.cvlive__line-height')).toBeTruthy();

    fixture.componentRef.setInput('selection', { sectionKey: 'summary', part: 'title' });
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.cvlive__line-height')).toBeNull();
  });

  it('title scope emits title patches, with the border via the section patch', () => {
    fixture.componentRef.setInput('selection', { sectionKey: 'summary', part: 'title' });
    fixture.detectChanges();
    const titleEvents: { key: CvSectionKey; patch: Partial<CvTextStyle> }[] = [];
    const styleEvents: { key: CvSectionKey; patch: Partial<CvSectionStyle> }[] = [];
    component.titleStyleChange.subscribe((e) => titleEvents.push(e));
    component.styleChange.subscribe((e) => styleEvents.push(e));

    component.setTitleFont('Georgia');
    component.setTitleBorder('dotted');

    expect(titleEvents).toEqual([{ key: 'summary', patch: { fontFamily: 'Georgia' } }]);
    expect(styleEvents).toEqual([{ key: 'summary', patch: { titleBorder: 'dotted' } }]);
  });

  it('reset emits the selected section key', () => {
    fixture.componentRef.setInput('selection', { sectionKey: 'skills', part: 'body' });
    let reset: CvSectionKey | undefined;
    component.resetSection.subscribe((k) => (reset = k));
    component.reset();
    expect(reset).toBe('skills');
  });
});
