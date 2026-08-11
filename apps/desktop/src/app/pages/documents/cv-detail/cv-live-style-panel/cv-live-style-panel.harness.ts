import { ComponentFixture, TestBed } from '@angular/core/testing';
import { CV_STYLE_DEFAULT } from '@applye/core';
import { TranslateService } from '@applye/i18n';

import { CvLiveStylePanelComponent } from './cv-live-style-panel.component';

import type { CvStylePanelChange } from '@applye/core';

/** Shared setup for the panel's specs, which were one 913-line file. */
export interface PanelHarness {
  component: CvLiveStylePanelComponent;
  fixture: ComponentFixture<CvLiveStylePanelComponent>;
}

export async function createPanel(): Promise<PanelHarness> {
  await TestBed.configureTestingModule({
    imports: [CvLiveStylePanelComponent],
    providers: [TranslateService],
  }).compileComponents();

  const fixture = TestBed.createComponent(CvLiveStylePanelComponent);
  fixture.componentRef.setInput('style', CV_STYLE_DEFAULT);
  fixture.componentRef.setInput('selection', null);
  return { component: fixture.componentInstance, fixture };
}

/** Records every change the panel emits from the moment it is called. */
export function collectChanges(component: CvLiveStylePanelComponent): CvStylePanelChange[] {
  const events: CvStylePanelChange[] = [];
  component.panelChange.subscribe((e) => events.push(e));
  return events;
}
