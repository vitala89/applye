import { Injectable, computed, inject, signal } from '@angular/core';
import { AiProvider } from '@applye/core';
import { AiService, CliStatus } from '@applye/data';
import { TranslateService } from '@applye/i18n';
import { openUrl } from '@tauri-apps/plugin-opener';
import { OnboardingAiKeyService } from './onboarding-ai-key.service';
import { CLI_SETUP_INFO, cardNameKey } from './onboarding-cli.util';

/**
 * The CLI-bridge half of the onboarding AI step: which CLIs are installed on
 * this machine, installing one on request, and what the user still has to do
 * to the one they picked.
 *
 * Split out for the same reason as `OnboardingAiKeyService`, and it is the
 * mirror of it: the panel that edits this state is its own component, while the
 * wizard reads the result - `selectedCliWorks` feeds the Continue gate and the
 * Ready step's summary, and switching mode has to re-probe.
 *
 * The selected provider lives on `OnboardingAiKeyService`, because the provider
 * grid above both panels sets it and both panels read it.
 */
@Injectable()
export class OnboardingCliBridgeService {
  private readonly ai = inject(AiService);
  private readonly t = inject(TranslateService).t;
  private readonly aiKey = inject(OnboardingAiKeyService);

  readonly statuses = signal<CliStatus[]>([]);
  readonly probing = signal(false);
  /** Provider id currently being installed, so only that row shows a spinner. */
  readonly installing = signal<AiProvider | null>(null);
  readonly installError = signal<{ message: string; needsNode: boolean } | null>(null);

  /** Status row for one provider, once probed. */
  statusFor(provider: AiProvider): CliStatus | undefined {
    return this.statuses().find((c) => c.provider === provider);
  }

  /** The selected CLI is present and actually runs. */
  readonly selectedWorks = computed(() => this.statusFor(this.aiKey.provider())?.working ?? false);

  /**
   * What the user has to do to get the CLI they picked working.
   *
   * Scoped to the selected provider on purpose: showing setup steps for all
   * three at once would bury the one decision being made. The three status
   * rows above stay a scannable list; this is the teaching state for the one
   * the user is committing to.
   *
   * A working CLI still gets a line, because "runs" is not "signed in" - the
   * probe only proves the binary executes. An expired or ineligible account
   * fails later, at task time, with an authentication error, and this is the
   * only place that tells the user what that means.
   */
  readonly selectedSetup = computed(() => {
    const provider = this.aiKey.provider();
    const info = CLI_SETUP_INFO[provider];
    if (!info) return null;
    const status = this.statusFor(provider);
    const name = this.t()(cardNameKey(provider, true));
    if (status?.working) {
      return { name, working: true, signInCommand: info.cmd, steps: [] };
    }
    return {
      name,
      working: false,
      signInCommand: info.cmd,
      steps: [
        {
          n: 1,
          text: this.t()(
            status?.installed ? 'onboarding.ai.cli.step_repair' : 'onboarding.ai.cli.step_install',
          ),
          command: `npm install -g ${info.pkg}`,
        },
        {
          n: 2,
          text: this.t()('onboarding.ai.cli.step_signin'),
          command: info.cmd,
        },
      ],
    };
  });

  async refreshProbe(): Promise<void> {
    this.probing.set(true);
    try {
      this.statuses.set(await this.ai.probeClis());
    } catch {
      // Outside a Tauri runtime the command does not exist; an empty list
      // reads as "none found" rather than breaking the wizard.
      this.statuses.set([]);
    } finally {
      this.probing.set(false);
    }
  }

  /**
   * Installs a CLI with npm on the user's behalf. This modifies their machine,
   * so it happens only on this explicit click, and the exact command is shown
   * in the UI both before and after.
   *
   * A successful install does NOT mean the user can use it yet: these CLIs
   * authenticate interactively against the user's own account, which cannot be
   * done from inside Applye. The UI says so rather than letting them find out
   * at the first real task.
   */
  async install(provider: AiProvider): Promise<void> {
    if (this.installing()) return;
    this.installing.set(provider);
    this.installError.set(null);
    try {
      const result = await this.ai.installCli(provider);
      if (result.ok) {
        await this.refreshProbe();
      } else {
        this.installError.set({ message: result.message, needsNode: result.needsNode });
      }
    } catch (e) {
      this.installError.set({ message: String(e), needsNode: false });
    } finally {
      this.installing.set(null);
    }
  }

  async openNodeSite(): Promise<void> {
    await openUrl('https://nodejs.org');
  }
}
