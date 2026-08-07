import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import type { TrackerRow } from '@applye/core';
import { ReportColumn, ReportMarket, ReportMode, reportFit } from '@applye/application';

/**
 * The printable Eigenbemuehungen / job-application report sheet. Renders the
 * user's OWN visible tracker columns (not a fixed set), packs what fits an A4
 * row for the chosen orientation, and - in `all` mode - wraps the rest onto a
 * second line per record so nothing is lost. Same component backs the export
 * preview and the hidden print window, so the PDF equals the preview.
 */
@Component({
  selector: 'app-tracker-report',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="paper" [class.paper--print]="print()" [class.paper--landscape]="landscape()">
      <div class="paper__head">
        <div>
          <div class="paper__title">{{ txt().title }}</div>
          <div class="paper__sub">{{ txt().subtitle }}</div>
        </div>
        <div class="paper__meta">{{ txt().generated }}: {{ generatedOn() }}<br />Applye</div>
      </div>
      <div class="paper__fields">
        <div>
          <span class="paper__flabel">{{ txt().name }}</span>
          <span class="paper__fval">{{ applicant() || '-' }}</span>
        </div>
        <div>
          <span class="paper__flabel">{{ txt().period }}</span>
          <span class="paper__fval">{{ periodLabel() }}</span>
        </div>
      </div>
      <table class="paper__table" [class.paper__table--grouped]="overflowCols().length">
        <thead>
          <tr>
            <th>#</th>
            @for (c of fitCols(); track c.id) {
              <th>{{ c.label }}</th>
            }
          </tr>
        </thead>
        <tbody>
          @for (r of rows(); track r.id; let i = $index) {
            <tr>
              <td>{{ i + 1 }}</td>
              @for (c of fitCols(); track c.id) {
                <td [class.paper__td--wrap]="c.type === 'text' || c.custom">
                  {{ cell(r, c) }}
                </td>
              }
            </tr>
            @for (chunk of overflowRows(); track $index) {
              <tr class="paper__detail">
                <td></td>
                @for (slot of fitCols(); track slot.id; let ci = $index) {
                  <td>
                    @if (chunk[ci]; as oc) {
                      <span class="paper__more-k">{{ oc.label }}</span>
                      <span
                        class="paper__more-v"
                        [class.paper__more-v--wrap]="oc.type === 'text' || oc.custom"
                        >{{ cell(r, oc) }}</span
                      >
                    }
                  </td>
                }
              </tr>
            }
          }
        </tbody>
      </table>
      <div class="paper__foot">
        <span
          >{{ txt().total }}: <b>{{ total() }}</b></span
        >
        <span
          >{{ txt().rate }}: <b>{{ rate() }}%</b></span
        >
        <span
          >{{ txt().avg }}: <b>{{ avg() }}</b></span
        >
      </div>
    </div>
  `,
  styleUrl: './tracker-report.component.scss',
})
export class TrackerReportComponent {
  readonly rows = input.required<TrackerRow[]>();
  readonly columns = input<ReportColumn[]>([]);
  readonly applicant = input<string>('');
  readonly periodLabel = input<string>('');
  readonly market = input<ReportMarket>('de');
  readonly mode = input<ReportMode>('fit');
  readonly landscape = input<boolean>(false);
  readonly generatedOn = input<string>('');
  readonly total = input<number>(0);
  readonly rate = input<number>(0);
  readonly avg = input<number>(0);
  readonly print = input<boolean>(false);

  private readonly fitResult = computed(() => reportFit(this.columns(), this.landscape()));
  readonly fitCols = computed(() => this.fitResult().fit);
  /** Overflow columns only render (as continuation rows) in `all` mode. */
  readonly overflowCols = computed(() => (this.mode() === 'all' ? this.fitResult().overflow : []));
  /** Overflow columns chunked into rows that reuse the main table's column
   * slots, so each continues UNDER the same column position (aligned grid),
   * not a detached block. */
  readonly overflowRows = computed<ReportColumn[][]>(() => {
    const cols = this.overflowCols();
    const size = Math.max(1, this.fitCols().length);
    const chunks: ReportColumn[][] = [];
    for (let i = 0; i < cols.length; i += size) chunks.push(cols.slice(i, i + size));
    return chunks;
  });

  private readonly STATUS_DE: Record<string, string> = {
    saved: 'Gespeichert',
    applied: 'Beworben',
    interview: 'Interview',
    offer: 'Angebot',
    rejected: 'Abgelehnt',
    cancelled: 'Zurückgezogen',
  };
  private readonly STATUS_EN: Record<string, string> = {
    saved: 'Saved',
    applied: 'Applied',
    interview: 'Interview',
    offer: 'Offer',
    rejected: 'Rejected',
    cancelled: 'Withdrawn',
  };

  readonly txt = computed(() =>
    this.market() === 'de'
      ? {
          title: 'Nachweise über Bewerbungsbemühungen',
          subtitle: 'Nachweis der Eigenbemühungen · vorzulegen bei der Agentur für Arbeit',
          generated: 'Erstellt am',
          name: 'Name',
          period: 'Zeitraum',
          total: 'Bewerbungen gesamt',
          rate: 'Rückmeldequote',
          avg: 'Ø Tage bis Rückmeldung',
          yes: 'Ja',
          no: 'Nein',
        }
      : {
          title: 'Job Application Report',
          subtitle: 'Record of job-search efforts',
          generated: 'Generated on',
          name: 'Name',
          period: 'Period',
          total: 'Total applications',
          rate: 'Response rate',
          avg: 'Avg days to response',
          yes: 'Yes',
          no: 'No',
        },
  );

  fmtDate(v: string): string {
    if (!v) return '';
    const [y, m, d] = v.slice(0, 10).split('-');
    const mo = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return m ? `${d} ${mo[+m - 1]} ${y.slice(2)}` : v;
  }
  private statusLabel(v?: string): string {
    if (!v) return '-';
    const map = this.market() === 'de' ? this.STATUS_DE : this.STATUS_EN;
    return map[v] ?? v;
  }
  private customVal(row: TrackerRow, id: string): string {
    if (!row.customFields) return '';
    try {
      return (JSON.parse(row.customFields) as Record<string, string>)[id] ?? '';
    } catch {
      return '';
    }
  }
  private yesno(v: unknown): string {
    if (v == null || v === '') return '-';
    const on = v === true || v === 'yes' || v === '1' || v === 1;
    return on ? this.txt().yes : this.txt().no;
  }

  cell(row: TrackerRow, col: ReportColumn): string {
    if (col.custom) {
      const raw = this.customVal(row, col.id);
      if (!raw) return '-';
      if (col.type === 'date') return this.fmtDate(raw);
      if (col.type === 'yesno') return this.yesno(raw);
      return raw;
    }
    const rec = row as unknown as Record<string, unknown>;
    switch (col.type) {
      case 'date':
        return rec[col.id] ? this.fmtDate(String(rec[col.id])) : '-';
      case 'status':
        return this.statusLabel(row.status);
      case 'yesno':
        return this.yesno(rec[col.id]);
      case 'link':
        return row.sourceUrl || '-';
      case 'stage':
        return row.nextStageLabel
          ? row.nextStageLabel + (row.nextStageAt ? ' · ' + this.fmtDate(row.nextStageAt) : '')
          : '-';
      default: {
        const v = rec[col.id];
        return v != null && v !== '' ? String(v) : '-';
      }
    }
  }
}
