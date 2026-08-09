import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { TrackerRowsStore } from '@applye/application';
import { TranslateService } from '@applye/i18n';
import { TrackerSummaryStripComponent } from './tracker-summary-strip.component';

describe('TrackerSummaryStripComponent', () => {
  it('renders the three totals the store reports', async () => {
    await TestBed.configureTestingModule({
      imports: [TrackerSummaryStripComponent],
      providers: [
        {
          provide: TrackerRowsStore,
          useValue: { summary: signal({ total: 42, rate: 31, avg: 9 }) },
        },
        { provide: TranslateService, useValue: { t: signal((k: string) => k) } },
      ],
    }).compileComponents();

    const fixture = TestBed.createComponent(TrackerSummaryStripComponent);
    fixture.detectChanges();

    const values = [...fixture.nativeElement.querySelectorAll('.jt__stat-val')].map((e) =>
      (e as HTMLElement).textContent?.trim(),
    );
    expect(values).toHaveLength(3);
    expect(values[0]).toBe('42');
    expect(values[1]).toContain('31');
    expect(values[2]).toContain('9');
  });
});
