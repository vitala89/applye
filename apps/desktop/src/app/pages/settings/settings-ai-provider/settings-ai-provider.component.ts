import { ChangeDetectionStrategy, Component, inject, input, output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import type { AiProvider, Settings } from '@applye/core';
import { TranslateService } from '@applye/i18n';
import { CLI_MODEL_CUSTOM } from '@applye/application';

/** Which model field a picker is driving. Both behave identically; naming them
 * is what lets one set of handlers serve both rows. */
export type CliModelField = 'defaultModel' | 'economyModel';

/** A model picker's answer, before the page decides what it means. */
export interface CliModelChoice {
  field: CliModelField;
  choice: string;
}

/** A settings field and its new value, as the page's `patch` takes them. */
export interface SettingsFieldChange {
  key: keyof Settings;
  value: Settings[keyof Settings];
}

/**
 * How Applye talks to a model: API or CLI bridge, which provider, which two
 * models, and which of them the test button should use.
 *
 * **Every list this renders is given to it.** Which models a provider offers,
 * whether a stored model name is a known one or hand-typed, and what switching
 * mode does to a stale provider are all decisions with reasons that outlive
 * this markup - they stay with the page, and this component renders the answer.
 *
 * The API-mode privacy note lives here because it is the note for this picker's
 * own state; the CLI-mode note lives with the status list it describes.
 */
@Component({
  selector: 'app-settings-ai-provider',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule],
  templateUrl: './settings-ai-provider.component.html',
  styleUrl: './settings-ai-provider.component.scss',
})
export class SettingsAiProviderComponent {
  private readonly i18n = inject(TranslateService);
  protected readonly t = this.i18n.t;

  readonly settings = input.required<Settings>();
  /** The providers offered in CLI mode, with the command each one runs. */
  readonly cliProviders =
    input.required<readonly { id: AiProvider; label: string; command: string }[]>();
  /** The API model catalogue for the selected provider. Empty in CLI mode. */
  readonly apiModels = input<readonly string[]>([]);
  /** Known model names for the selected CLI. Empty for a CLI that publishes none. */
  readonly cliModels = input<readonly string[]>([]);
  /** Which of the two model fields are currently in free-text mode. */
  readonly customModel = input<{ defaultModel: boolean; economyModel: boolean }>({
    defaultModel: false,
    economyModel: false,
  });
  /**
   * What each dropdown should show for its stored value: the value itself when
   * it is a known name, "custom" when it was typed by hand, and empty when
   * nothing is set. Two resolved strings rather than a function input - handing
   * a component a function to call is how view logic gets smuggled across a
   * boundary while looking like data (ADR-0005, amendments thirty-two and
   * thirty-seven).
   */
  readonly defaultModelSelectValue = input('');
  readonly economyModelSelectValue = input('');
  /** The company the API key talks to, named in the privacy note. */
  readonly vendorName = input('');
  readonly tier = input<'economy' | 'quality'>('economy');

  readonly modeChanged = output<Settings['aiMode']>();
  readonly providerChanged = output<Settings['provider']>();
  readonly cliModelSelected = output<CliModelChoice>();
  readonly fieldChanged = output<SettingsFieldChange>();
  readonly tierChanged = output<'economy' | 'quality'>();

  protected readonly CLI_MODEL_CUSTOM = CLI_MODEL_CUSTOM;

  protected isCliMode(): boolean {
    return this.settings().aiMode === 'cli';
  }

  protected patch(key: keyof Settings, value: Settings[keyof Settings]): void {
    this.fieldChanged.emit({ key, value });
  }
}
