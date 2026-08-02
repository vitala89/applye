import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { LoaderCircle, LucideAngularModule, RefreshCw } from 'lucide-angular';
import { TranslateService } from '@applye/i18n';
import { UpdaterService } from '../../core/updater.service';

/**
 * The About block: which Applye this is, and whether a newer one exists.
 *
 * Its own component rather than more markup in the settings page, which is far
 * over its size budget - and because "what version am I running, and can I move
 * off it" is one question with one owner.
 */
@Component({
  selector: 'app-about-update',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [LucideAngularModule],
  templateUrl: './about-update.component.html',
  styleUrl: './about-update.component.scss',
})
export class AboutUpdateComponent {
  private readonly i18n = inject(TranslateService);
  protected readonly t = this.i18n.t;
  protected readonly updater = inject(UpdaterService);

  protected readonly icons = { check: RefreshCw, spinner: LoaderCircle };

  /** Read once from the Tauri runtime; `null` in a browser preview. */
  readonly appVersion = signal<string | null>(null);

  constructor() {
    void this.loadVersion();
  }

  private async loadVersion(): Promise<void> {
    try {
      const { getVersion } = await import('@tauri-apps/api/app');
      this.appVersion.set(await getVersion());
    } catch {
      // Outside Tauri there is no build to name; the row simply omits it.
      this.appVersion.set(null);
    }
  }

  protected check(): void {
    void this.updater.check();
  }

  protected install(): void {
    void this.updater.install();
  }
}
