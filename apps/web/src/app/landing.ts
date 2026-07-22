import { Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { I18nService } from './i18n/i18n.service';
import { COMING_SOON, RELEASES } from './site';
import { Icon, IconName } from './ui/icon';
import { SourceLink } from './ui/source-link';

/** Icons for the principles strip, paired with the translated labels by index. */
const PRINCIPLE_ICONS: IconName[] = ['hard-drive', 'shield-check', 'file-text', 'key', 'sparkles'];

@Component({
  selector: 'app-landing',
  standalone: true,
  imports: [RouterLink, SourceLink, Icon],
  templateUrl: './landing.html',
})
export class Landing {
  private readonly i18n = inject(I18nService);

  /** All landing copy comes from the active locale's bundle. */
  readonly m = this.i18n.m;
  readonly locale = this.i18n.locale;

  readonly releases = RELEASES;
  readonly comingSoon = COMING_SOON;

  readonly openFaq = signal<number | null>(0);

  readonly principles = computed(() =>
    this.m().principles.map((p, i) => ({ ...p, icon: PRINCIPLE_ICONS[i] })),
  );

  toggleFaq(index: number): void {
    this.openFaq.set(this.openFaq() === index ? null : index);
  }
}
