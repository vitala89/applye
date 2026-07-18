import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
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
import { DbService } from '@applye/data';
import { AnalyticsFacts, AnalyticsKpi, AnalyticsPeriod, computeAnalytics } from '@applye/core';
import { ToastService } from '../../core/toast/toast.service';

const PERIODS: AnalyticsPeriod[] = ['30d', '90d', 'all'];

@Component({
  selector: 'app-analytics',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [LucideAngularModule, RouterLink],
  templateUrl: './analytics.component.html',
  styleUrl: './analytics.component.scss',
})
export class AnalyticsComponent implements OnInit {
  private readonly db = inject(DbService);
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

  private readonly facts = signal<AnalyticsFacts | null>(null);
  protected readonly loading = signal(true);
  protected readonly period = signal<AnalyticsPeriod>('90d');

  private readonly view = computed(() => {
    const f = this.facts();
    return f ? computeAnalytics(f, this.period(), new Date()) : null;
  });

  protected readonly state = computed(() => this.view()?.state ?? 'empty');
  protected readonly isLowData = computed(() => this.state() === 'low-data');

  protected readonly segments = computed(() =>
    PERIODS.map((value) => ({
      value,
      label: this.t()(`analytics.period_${value}`),
      selected: this.period() === value,
    })),
  );

  protected readonly caption = computed(() => {
    const v = this.view();
    if (!v) return '';
    const period = this.t()(`analytics.period_${this.period()}`);
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
    return v.stages.map((s) => ({
      name: this.t()(`analytics.stage_${s.key}`),
      count: s.count,
      widthPct: `${s.widthPct}%`,
      fill: s.primary ? 'var(--accent)' : 'var(--graphite-500)',
      nameColor: s.primary ? 'var(--text-accent)' : 'var(--text-secondary)',
      showConv: s.conv !== null,
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
    const n = b.apps.length;
    const yMax = b.yMax;
    const pts = (arr: number[]): string =>
      arr
        .map((val, i) => {
          const x = n > 1 ? (i / (n - 1)) * 100 : 0;
          const y = 3 + (1 - val / yMax) * 36;
          return `${x.toFixed(2)},${y.toFixed(2)}`;
        })
        .join(' ');
    const lineApps = pts(b.apps);
    const opts: Intl.DateTimeFormatOptions =
      b.bucketKind === 'month'
        ? { month: 'short', timeZone: 'UTC' }
        : { month: 'short', day: 'numeric', timeZone: 'UTC' };
    const fmt = new Intl.DateTimeFormat(this.i18n.locale(), opts);
    return {
      lineApps,
      lineFollow: pts(b.followups),
      area: `${lineApps} 100.00,39.00 0.00,39.00`,
      ticks: b.tickDates.map((d) => fmt.format(new Date(`${d}T00:00:00Z`)).toUpperCase()),
      unit: this.t()(`analytics.unit_${b.bucketKind}`),
      yMax: String(yMax),
      hasFollowups: b.hasFollowups,
    };
  });

  protected readonly scoreDist = computed(() => {
    const v = this.view();
    if (!v) return null;
    const d = v.scoreDist;
    if (d.scored === 0) return null; // no scored jobs at all — hide the card
    return {
      scored: d.scored,
      unscored: d.unscored,
      median: d.median,
      lowData: d.lowData,
      coverage: `${d.scored} ${this.t()('analytics.score_scored')} · ${d.unscored} ${this.t()('analytics.score_unscored')}`,
      buckets: d.buckets.map((b) => ({
        label: `${b.lo}-${b.hi}`,
        count: b.count,
        widthPct: `${b.widthPct}%`,
      })),
    };
  });

  protected readonly scoreOutcome = computed(() => {
    const v = this.view();
    if (!v) return null;
    const o = v.scoreOutcome;
    const total = o.groups.reduce((s, g) => s + g.count, 0);
    if (total === 0) return null; // no scored jobs — hide (same as the distribution card)
    const label: Record<string, string> = {
      offer: this.t()('analytics.outcome_offer'),
      interview: this.t()('analytics.outcome_interview'),
      noInterview: this.t()('analytics.outcome_none'),
    };
    return {
      lowData: o.lowData,
      groups: o.groups.map((g) => ({
        label: label[g.key],
        count: g.count,
        avgText: g.avgScore === null ? '—' : `${g.avgScore}%`,
        widthPct: `${g.widthPct}%`,
        accent: g.key === 'offer',
      })),
    };
  });

  protected readonly timeToResponse = computed(() => {
    const v = this.view();
    if (!v) return null;
    const r = v.timeToResponse;
    if (r.count === 0) return null; // no measured responses — hide the card
    const days = this.t()('analytics.ttr_days');
    const d = this.t()('analytics.ttr_d');
    return {
      lowData: r.lowData,
      medianDays: r.medianDays,
      summary: `${this.t()('analytics.ttr_fastest')} ${r.fastestDays}${d} · ${this.t()('analytics.ttr_slowest')} ${r.slowestDays}${d}`,
      buckets: r.buckets.map((b) => ({
        label: b.hi === null ? `${b.lo}+ ${days}` : `${b.lo}-${b.hi} ${days}`,
        count: b.count,
        widthPct: `${b.widthPct}%`,
      })),
    };
  });

  protected readonly aging = computed(() => {
    const v = this.view();
    if (!v) return null;
    const a = v.aging;
    if (a.activeCount === 0) return null; // no in-flight pipeline — hide
    const days = this.t()('analytics.ttr_days');
    return {
      lowData: a.lowData,
      medianDays: a.medianDays,
      activeCount: a.activeCount,
      staleCount: a.staleCount,
      buckets: a.buckets.map((b) => ({
        label: b.hi === null ? `${b.lo}+ ${days}` : `${b.lo}-${b.hi} ${days}`,
        count: b.count,
        widthPct: `${b.widthPct}%`,
      })),
    };
  });

  protected readonly locations = computed(() => {
    const v = this.view();
    if (!v) return null;
    const l = v.locations;
    if (l.total === 0) return null; // nothing located — hide
    return {
      lowData: l.lowData,
      unknown: l.unknown,
      rows: l.rows.map((r) => ({ name: r.name, count: r.count, widthPct: `${r.widthPct}%` })),
    };
  });

  async ngOnInit(): Promise<void> {
    await this.load();
  }

  protected setPeriod(p: AnalyticsPeriod): void {
    this.period.set(p);
  }

  private async load(): Promise<void> {
    this.loading.set(true);
    try {
      this.facts.set(await this.db.getAnalyticsFacts());
    } catch {
      this.toast.error(this.t()('analytics.load_error'));
      this.facts.set({ applications: [], followups: [] });
    } finally {
      this.loading.set(false);
    }
  }

  private tile(key: string, icon: LucideIconData, label: string, k: AnalyticsKpi, accent: boolean) {
    const up = (k.delta ?? 0) >= 0;
    return {
      key,
      icon,
      label,
      valueText: k.value === null ? '—' : String(k.value),
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
