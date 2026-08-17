import { ChangeDetectionStrategy, Component, OnInit, computed, inject } from '@angular/core';
import {
  ArrowDownRight,
  ArrowUpRight,
  BarChart3,
  LucideAngularModule,
  LucideIconData,
  Reply,
  Send,
  Target,
  Trophy,
} from 'lucide-angular';
import { RouterLink } from '@angular/router';
import { TranslateService } from '@applye/i18n';
import { AnalyticsStore, areaPoints, polylinePoints } from '@applye/application';
import { AnalyticsBarListComponent } from './analytics-bar-list/analytics-bar-list.component';
import type { AnalyticsBarRow } from './analytics-bar-list/analytics-bar-list.component';
import { AnalyticsKpiRowComponent } from './analytics-kpi-row/analytics-kpi-row.component';
import { AnalyticsTrendComponent } from './analytics-trend/analytics-trend.component';
import { AnalyticsKpi, AnalyticsPeriod } from '@applye/core';
import { ToastService } from '@applye/application';

const PERIODS: AnalyticsPeriod[] = ['30d', '90d', 'all'];

@Component({
  selector: 'app-analytics',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    LucideAngularModule,
    RouterLink,
    AnalyticsBarListComponent,
    AnalyticsKpiRowComponent,
    AnalyticsTrendComponent,
  ],
  templateUrl: './analytics.component.html',
  styleUrl: './analytics.component.scss',
  providers: [AnalyticsStore],
})
export class AnalyticsComponent implements OnInit {
  protected readonly stats = inject(AnalyticsStore);
  private readonly i18n = inject(TranslateService);
  private readonly toast = inject(ToastService);
  protected readonly t = this.i18n.t;

  protected readonly icons = {
    apps: Send,
    rate: Reply,
    interviews: Target,
    offers: Trophy,
    up: ArrowUpRight,
    down: ArrowDownRight,
    empty: BarChart3,
  };

  /** The store's view, read once per computed below - all of which translate. */
  private readonly view = this.stats.view;

  protected readonly isLowData = computed(() => this.stats.state() === 'low-data');

  protected readonly segments = computed(() =>
    PERIODS.map((value) => ({
      value,
      label: this.t()(`analytics.period_${value}`),
      selected: this.stats.period() === value,
    })),
  );

  protected readonly caption = computed(() => {
    const v = this.view();
    if (!v) return '';
    const period = this.t()(`analytics.period_${this.stats.period()}`);
    return `${period} · ${v.appliedTotal} ${this.t()('analytics.applications_caption')}`;
  });

  protected readonly tiles = computed(() => {
    const v = this.view();
    if (!v) return [];
    const k = v.kpis;
    return [
      this.tile('apps', this.icons.apps, this.t()('analytics.kpi_apps'), k.apps, false),
      this.tile(
        'rate',
        this.icons.rate,
        this.t()('analytics.kpi_rate'),
        k.rate,
        k.rate.value !== null,
      ),
      this.tile(
        'interviews',
        this.icons.interviews,
        this.t()('analytics.kpi_interviews'),
        k.interviews,
        false,
      ),
      this.tile(
        'offers',
        this.icons.offers,
        this.t()('analytics.kpi_offers'),
        k.offers,
        (k.offers.value ?? 0) > 0,
      ),
    ];
  });

  protected readonly stages = computed(() => {
    const v = this.view();
    if (!v) return [];
    return v.stages.map<AnalyticsBarRow>((s) => ({
      name: this.t()(`analytics.stage_${s.key}`),
      valueText: String(s.count),
      widthPct: `${s.widthPct}%`,
      fill: s.primary ? 'var(--accent)' : 'var(--ana-neutral-fill)',
      nameColor: s.primary ? 'var(--text-accent)' : 'var(--text-secondary)',
      convText: s.conv !== null ? `${s.conv}%` : '',
      convOf: s.convOf ? this.t()(`analytics.conv_of_${s.convOf}`) : '',
    }));
  });

  protected readonly leakage = computed(() => {
    const v = this.view();
    if (!v) return null;
    const l = v.leakage;
    return {
      widthPct: `${l.widthPct}%`,
      text: `${l.rejected} ${this.t()('analytics.leak_rejected')} · ${l.cancelled} ${this.t()('analytics.leak_withdrawn')}`,
    };
  });

  protected readonly trend = computed(() => {
    const v = this.view();
    if (!v) return null;
    const b = v.trend;
    const lineApps = polylinePoints(b.apps, b.yMax);
    const opts: Intl.DateTimeFormatOptions =
      b.bucketKind === 'month'
        ? { month: 'short', timeZone: 'UTC' }
        : { month: 'short', day: 'numeric', timeZone: 'UTC' };
    const fmt = new Intl.DateTimeFormat(this.i18n.locale(), opts);
    return {
      lineApps,
      lineFollow: polylinePoints(b.followups, b.yMax),
      area: areaPoints(lineApps),
      ticks: b.tickDates.map((d) => fmt.format(new Date(`${d}T00:00:00Z`)).toUpperCase()),
      unit: this.t()(`analytics.unit_${b.bucketKind}`),
      yMax: String(b.yMax),
      hasFollowups: b.hasFollowups,
    };
  });

  protected readonly scoreDist = computed(() => {
    const v = this.view();
    if (!v) return null;
    const d = v.scoreDist;
    if (d.scored === 0) return null; // no scored jobs at all - hide the card
    return {
      scored: d.scored,
      unscored: d.unscored,
      median: d.median,
      lowData: d.lowData,
      coverage: `${d.scored} ${this.t()('analytics.score_scored')} · ${d.unscored} ${this.t()('analytics.score_unscored')}`,
      rows: d.buckets.map<AnalyticsBarRow>((b) => ({
        name: `${b.lo}-${b.hi}`,
        valueText: String(b.count),
        widthPct: `${b.widthPct}%`,
      })),
    };
  });

  protected readonly scoreOutcome = computed(() => {
    const v = this.view();
    if (!v) return null;
    const o = v.scoreOutcome;
    const total = o.groups.reduce((s, g) => s + g.count, 0);
    if (total === 0) return null; // no scored jobs - hide (same as the distribution card)
    const label: Record<string, string> = {
      offer: this.t()('analytics.outcome_offer'),
      interview: this.t()('analytics.outcome_interview'),
      noInterview: this.t()('analytics.outcome_none'),
    };
    return {
      lowData: o.lowData,
      rows: o.groups.map<AnalyticsBarRow>((g) => ({
        name: label[g.key],
        // The bar carries the average score; the caption carries how many
        // applications it averages over. This is the one list whose value column
        // is not a count.
        valueText: g.avgScore === null ? '-' : `${g.avgScore}%`,
        widthPct: `${g.widthPct}%`,
        fill: g.key === 'offer' ? 'var(--accent)' : 'var(--ana-neutral-fill)',
        convOf: `${g.count} ${this.t()('analytics.outcome_apps')}`,
      })),
    };
  });

  protected readonly timeToResponse = computed(() => {
    const v = this.view();
    if (!v) return null;
    const r = v.timeToResponse;
    if (r.count === 0) return null; // no measured responses - hide the card
    const days = this.t()('analytics.ttr_days');
    const d = this.t()('analytics.ttr_d');
    return {
      lowData: r.lowData,
      medianDays: r.medianDays,
      summary: `${this.t()('analytics.ttr_fastest')} ${r.fastestDays}${d} · ${this.t()('analytics.ttr_slowest')} ${r.slowestDays}${d}`,
      rows: r.buckets.map<AnalyticsBarRow>((b) => ({
        name: b.hi === null ? `${b.lo}+ ${days}` : `${b.lo}-${b.hi} ${days}`,
        valueText: String(b.count),
        widthPct: `${b.widthPct}%`,
      })),
    };
  });

  protected readonly aging = computed(() => {
    const v = this.view();
    if (!v) return null;
    const a = v.aging;
    if (a.activeCount === 0) return null; // no in-flight pipeline - hide
    const days = this.t()('analytics.ttr_days');
    return {
      lowData: a.lowData,
      medianDays: a.medianDays,
      activeCount: a.activeCount,
      staleCount: a.staleCount,
      rows: a.buckets.map<AnalyticsBarRow>((b) => ({
        name: b.hi === null ? `${b.lo}+ ${days}` : `${b.lo}-${b.hi} ${days}`,
        valueText: String(b.count),
        widthPct: `${b.widthPct}%`,
      })),
    };
  });

  protected readonly locations = computed(() => {
    const v = this.view();
    if (!v) return null;
    const l = v.locations;
    if (l.total === 0) return null; // nothing located - hide
    return {
      lowData: l.lowData,
      unknown: l.unknown,
      rows: l.rows.map<AnalyticsBarRow>((r) => ({
        name: r.name,
        valueText: String(r.count),
        widthPct: `${r.widthPct}%`,
      })),
    };
  });

  /**
   * The store records the failure and installs empty facts; saying so is the
   * page's job, because the store does not translate.
   */
  async ngOnInit(): Promise<void> {
    if (!(await this.stats.load())) {
      this.toast.error(this.t()('analytics.load_error'));
    }
  }

  protected setPeriod(p: AnalyticsPeriod): void {
    this.stats.setPeriod(p);
  }

  private tile(key: string, icon: LucideIconData, label: string, k: AnalyticsKpi, accent: boolean) {
    const up = (k.delta ?? 0) >= 0;
    return {
      key,
      icon,
      label,
      valueText: k.value === null ? '-' : String(k.value),
      isPercent: k.isPercent && k.value !== null,
      accent,
      deltaShow: k.delta !== null,
      deltaUp: up,
      deltaIcon: up ? this.icons.up : this.icons.down,
      deltaText:
        k.delta === null
          ? ''
          : `${up ? '+' : '-'}${Math.abs(k.delta)}${k.isPointsDelta ? 'pp' : ''}`,
      spark: k.spark,
      note: k.lowData ? this.t()('analytics.rate_lowdata') : '',
    };
  }
}
