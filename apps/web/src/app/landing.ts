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
 * translated.
 *
 * These two lists are the app's two dispatch tables, and nothing else. API mode
 * is `run` in `apps/desktop/src-tauri/src/ai/api.rs`, which has exactly two
 * arms; the CLI bridge is `adapter_for` in `ai/cli.rs`, which has two more.
 * `AiProvider` is a wider set than either, so listing it here is what made this
 * page wrong twice: OpenAI has no API arm at all and reaches Applye only
 * through Codex CLI, and Gemini reaches it through nothing, because Google
 * withdrew Gemini CLI for personal accounts on 2026-06-18 and no API arm was
 * ever written. If an arm is added or dropped there, this list moves with it.
 */
const API_ENGINES = ['Anthropic Claude', 'DeepSeek'];
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
