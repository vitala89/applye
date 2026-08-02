import { ComponentFixture, TestBed } from '@angular/core/testing';
import { CV_STYLE_DEFAULT } from '@applye/core';
import { TranslateService } from '@applye/i18n';
import { CvPreviewComponent } from './cv-preview.component';

/**
 * The CV preview's test harness, shared by the four spec files that grew out of
 * one 2263-line file.
 *
 * The defaults matter: every input is set before a test runs, so a spec that
 * cares about one of them sets that one and nothing else. A test that forgot to
 * set `sections` would otherwise fail on a missing required input rather than on
 * whatever it was actually asserting.
 */
export interface CvPreviewHarness {
  component: CvPreviewComponent;
  fixture: ComponentFixture<CvPreviewComponent>;
}

export async function createCvPreview(): Promise<CvPreviewHarness> {
  await TestBed.configureTestingModule({
    imports: [CvPreviewComponent],
    providers: [TranslateService],
  }).compileComponents();

  const fixture = TestBed.createComponent(CvPreviewComponent);
  fixture.componentRef.setInput('sections', []);
  fixture.componentRef.setInput('style', CV_STYLE_DEFAULT);
  fixture.componentRef.setInput('themeId', 1);
  fixture.componentRef.setInput('includePhoto', false);
  fixture.componentRef.setInput('photoDataUri', null);
  fixture.componentRef.setInput('photoPlacement', 'above_left');
  fixture.componentRef.setInput('includeBirthdate', false);
  fixture.componentRef.setInput('includeMaritalStatus', false);
  return { component: fixture.componentInstance, fixture };
}
