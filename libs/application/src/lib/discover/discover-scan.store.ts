import { Injectable, inject, signal } from '@angular/core';
import { TranslateService } from '@applye/i18n';
import { DiscoverGateway } from '@applye/data';
import { type ConsoleLine, failureLines, resultLines, startedLines } from './scan-console';

/**
 * A scan of the enabled job sources, and the terminal-style console that
 * narrates it.
 *
 * **Component-scoped.** A scan belongs to the Discover page that started it;
 * its console is not something another screen should find still open.
 *
 * The follow-up work is a continuation rather than something the caller does
 * after `run` returns, and that is deliberate: in the version this replaces,
 * reloading the feed happened **inside** the same `try`, so the console stayed
 * open across it and a failure there narrated as a failed scan. Both are
 * behaviour, not incidental ordering, and a caller doing the reload afterwards
 * would lose both.
 *
 * The store never raises a toast. Telling the user is the app's job, so `run`
 * reports the failure back and the page decides what to show.
 */
@Injectable()
export class DiscoverScanStore {
  private readonly db = inject(DiscoverGateway);
  private readonly t = inject(TranslateService).t;

  private readonly scanningState = signal(false);
  private readonly linesState = signal<ConsoleLine[]>([]);
  private readonly expandedState = signal(false);

  /** True for the whole scan, including the caller's follow-up work. */
  readonly scanning = this.scanningState.asReadonly();
  readonly lines = this.linesState.asReadonly();
  /** The console opens for the scan and closes when it is over. */
  readonly expanded = this.expandedState.asReadonly();

  /** Lets the page collapse the console without ending a scan. */
  collapse(): void {
    this.expandedState.set(false);
  }

  expand(): void {
    this.expandedState.set(true);
  }

  /**
   * Runs a scan, narrating each stage, then hands the summary to `afterScan`
   * while the console is still open.
   *
   * Returns the error text when anything in either half failed, or null when it
   * all succeeded. A second call while one is running is ignored rather than
   * queued - two scans would interleave their console lines.
   *
   * `elapsed` is injected so the console's duration is testable; the page has
   * no reason to pass it.
   */
  async run(
    sourceNames: readonly string[],
    afterScan: () => Promise<void>,
    now: () => number = Date.now,
  ): Promise<string | null> {
    if (this.scanningState()) return null;
    this.scanningState.set(true);
    this.expandedState.set(true);
    this.linesState.set(startedLines([...sourceNames], this.t()));

    const started = now();
    try {
      const summary = await this.db.discoverScan();
      const seconds = ((now() - started) / 1000).toFixed(1);
      this.linesState.set(resultLines(summary, seconds, this.t()));
      await afterScan();
      return null;
    } catch (e) {
      console.error('discover: scan failed', e);
      this.linesState.update((lines) => failureLines(lines, String(e), this.t()));
      return String(e);
    } finally {
      this.scanningState.set(false);
      this.expandedState.set(false);
    }
  }
}
