import { Injectable, inject, signal } from '@angular/core';
import type { AiProvider, Settings } from '@applye/core';
import { AiService, type CliStatus } from '@applye/data';
import { CLI_MODELS } from './cli-bridge';
import { CLI_MODEL_CUSTOM, cliModelSelectValue } from './cli-models';

/** What one install attempt did. */
export type CliInstallOutcome = 'busy' | 'installed' | 'refused' | 'failed';

/** Which model field a picker drives. */
export type CliModelField = 'defaultModel' | 'economyModel';

/**
 * CLI bridge mode: which local CLIs are there, installing the ones that are
 * not, and which model name each picker should show.
 *
 * **A probe failure is not an error here.** Outside a Tauri runtime the command
 * does not exist at all, and an empty list reads correctly as "none found"
 * rather than breaking the screen it sits on.
 *
 * **`refused` is kept apart from `failed`.** npm answering "no" is a message
 * worth showing the user verbatim; the call itself throwing is a different
 * problem, and collapsing the two would hide whichever one the page decided not
 * to print.
 */
@Injectable()
export class CliBridgeStore {
  private readonly ai = inject(AiService);

  readonly statuses = signal<readonly CliStatus[]>([]);
  readonly probing = signal(false);
  readonly installing = signal<AiProvider | null>(null);
  readonly error = signal('');

  /** Which of the two model fields are currently in free-text mode. */
  readonly customModel = signal<{ defaultModel: boolean; economyModel: boolean }>({
    defaultModel: false,
    economyModel: false,
  });

  async probe(): Promise<void> {
    this.probing.set(true);
    try {
      this.statuses.set(await this.ai.probeClis());
    } catch {
      this.statuses.set([]);
    } finally {
      this.probing.set(false);
    }
  }

  /**
   * Installs or repairs a CLI with npm. The package name is chosen in Rust from
   * a fixed list keyed on the provider id - it is never sent from here, so no
   * input can make Applye install something else.
   */
  async install(provider: AiProvider): Promise<CliInstallOutcome> {
    this.error.set('');
    if (this.installing()) return 'busy';
    this.installing.set(provider);
    try {
      const result = await this.ai.installCli(provider);
      if (!result.ok) {
        this.error.set(result.message);
        return 'refused';
      }
      await this.probe();
      return 'installed';
    } catch (e) {
      this.error.set(String(e));
      return 'failed';
    } finally {
      this.installing.set(null);
    }
  }

  /** Whether the selected CLI actually **runs**. Being present on the path is
   * not enough: a broken npm wrapper is present and still fails on first call. */
  works(provider: string | undefined): boolean {
    return this.statuses().find((c) => c.provider === provider)?.working ?? false;
  }

  /** Known model names for a CLI. Empty for one that publishes no readable
   * list - the picker then offers the default and a custom field. */
  models(provider: string | undefined): string[] {
    return CLI_MODELS[provider ?? ''] ?? [];
  }

  /**
   * What a picker should show for a stored value: the value itself when it is a
   * known name, "custom" when it was typed by hand, the empty option when
   * nothing is set. Derived rather than stored, so a settings row written
   * before the picker existed - or by hand - still shows up correctly.
   */
  selectValue(stored: string, provider: string | undefined): string {
    return cliModelSelectValue(stored, this.models(provider));
  }

  /**
   * Opens the free-text field for any stored model that is not a known name, so
   * an existing hand-typed value stays visible and editable.
   */
  syncCustomFlags(settings: Settings | null): void {
    const known = this.models(settings?.provider);
    const isCustom = (v: string) => !!v && !known.includes(v);
    this.customModel.set({
      defaultModel: isCustom(settings?.defaultModel ?? ''),
      economyModel: isCustom(settings?.economyModel ?? ''),
    });
  }

  clearCustomFlags(): void {
    this.customModel.set({ defaultModel: false, economyModel: false });
  }

  /**
   * Records a picker choice and answers with the model name to store, or `null`
   * when the user asked for the free-text field instead - there is nothing to
   * write yet in that case, and writing the sentinel would put `__custom__` in
   * the settings row.
   */
  chooseModel(field: CliModelField, choice: string): string | null {
    const custom = choice === CLI_MODEL_CUSTOM;
    this.customModel.update((c) => ({ ...c, [field]: custom }));
    return custom ? null : choice;
  }
}
