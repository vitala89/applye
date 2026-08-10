import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import {
  BadgeCheck,
  Download,
  ExternalLink,
  Info,
  LucideAngularModule,
  RefreshCw,
  TriangleAlert,
} from 'lucide-angular';
import { AiProvider } from '@applye/core';
import { TranslateService } from '@applye/i18n';
import { openUrl } from '@tauri-apps/plugin-opener';
import { ButtonDirective } from '@applye/ui';
import {
  ONBOARDING_CLI_PROVIDERS,
  OnboardingCliBridgeStore,
  cardNameKey,
} from '@applye/application';

/**
 * The CLI-bridge panel of the onboarding AI step: which CLIs this machine has,
 * installing one, and what is still left to do to the one the user picked.
 *
 * The sibling of `OnboardingApiKeyCardComponent`, and built the same way: it
 * reads and mutates `OnboardingCliBridgeStore` directly rather than taking
 * inputs and emitting outputs, because the wizard provides that service and
 * reads the same signals back for its Continue gate.
 */
@Component({
  selector: 'app-onboarding-cli-card',
  standalone: true,
  imports: [ButtonDirective, LucideAngularModule],
  templateUrl: './onboarding-cli-card.component.html',
  styleUrl: './onboarding-cli-card.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class OnboardingCliCardComponent {
  protected readonly cli = inject(OnboardingCliBridgeStore);
  protected readonly t = inject(TranslateService).t;

  protected readonly cliProviders = ONBOARDING_CLI_PROVIDERS;

  /** The store publishes the address; opening it is a Tauri plugin call, and
   * `libs/application` makes none. */
  protected async openNodeSite(): Promise<void> {
    await openUrl(this.cli.nodeDownloadUrl);
  }

  /** This panel only ever renders in CLI mode, so it never has to ask. */
  protected cardNameKey(provider: AiProvider): string {
    return cardNameKey(provider, true);
  }

  protected readonly icons = {
    badgeCheck: BadgeCheck,
    download: Download,
    externalLink: ExternalLink,
    info: Info,
    refresh: RefreshCw,
    triangleAlert: TriangleAlert,
  };
}
