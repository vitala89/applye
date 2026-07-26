import { Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Track } from './analytics/track.directive';
import { I18nService } from './i18n/i18n.service';
import { COMING_SOON, RELEASES } from './site';
import { Icon, IconName } from './ui/icon';
import { SourceLink } from './ui/source-link';

/** Icons for the principles strip, paired with the translated labels by index. */
const PRINCIPLE_ICONS: IconName[] = ['hard-drive', 'shield-check', 'file-text', 'key', 'sparkles'];

/**
 * Engines Applye can talk to. Names are proper nouns, so they are not
 * translated. Kept honest against the app itself: API mode covers every
 * provider in `AiProvider`, while the CLI bridge only has adapters for Claude
 * Code and Codex - Google withdrew Gemini CLI for personal accounts on
 * 2026-06-18 (see `apps/desktop/src-tauri/src/ai/cli.rs`). If an adapter is
 * added or dropped there, this list moves with it.
 */
const API_ENGINES = ['Anthropic Claude', 'OpenAI', 'Google Gemini', 'DeepSeek'];
const CLI_ENGINES = ['Claude Code', 'Codex CLI'];

@Component({
  selector: 'app-landing',
  standalone: true,
  imports: [RouterLink, SourceLink, Icon, Track],
  templateUrl: './landing.html',
})
export class Landing {
  private readonly i18n = inject(I18nService);

  /** All landing copy comes from the active locale's bundle. */
  readonly m = this.i18n.m;
  readonly locale = this.i18n.locale;

  readonly releases = RELEASES;
  readonly comingSoon = COMING_SOON;

  readonly apiEngines = API_ENGINES;
  readonly cliEngines = CLI_ENGINES;

  readonly openFaq = signal<number | null>(0);

  readonly principles = computed(() =>
    this.m().principles.map((p, i) => ({ ...p, icon: PRINCIPLE_ICONS[i] })),
  );

  toggleFaq(index: number): void {
    this.openFaq.set(this.openFaq() === index ? null : index);
  }
}
