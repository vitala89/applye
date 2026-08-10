import { Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  BadgeCheck,
  CheckCheck,
  CirclePlay,
  ExternalLink,
  Info,
  Key,
  Lock,
  LucideAngularModule,
  TriangleAlert,
} from 'lucide-angular';
import { TranslateService } from '@applye/i18n';
import { openUrl } from '@tauri-apps/plugin-opener';
import { ButtonDirective } from '@applye/ui';
import { OnboardingAiKeyStore } from '@applye/application';

/**
 * The API-key panel of the onboarding AI step: where to get a key, the key
 * input and its save status, and the quality/economy model pickers.
 *
 * It reads and mutates `OnboardingAiKeyStore` directly rather than taking
 * inputs and emitting outputs. The wizard provides that service and reads the
 * same signals back for its Continue gate and the settings it persists, so
 * routing every change through the parent would only split one flow in two.
 */
@Component({
  selector: 'app-onboarding-api-key-card',
  standalone: true,
  imports: [ButtonDirective, FormsModule, LucideAngularModule],
  templateUrl: './onboarding-api-key-card.component.html',
  styleUrl: './onboarding-api-key-card.component.scss',
})
export class OnboardingApiKeyCardComponent {
  protected readonly aiKey = inject(OnboardingAiKeyStore);
  protected readonly t = inject(TranslateService).t;

  /** The store publishes the addresses; opening one is a Tauri plugin call, and
   * `libs/application` makes none. */
  protected async openConsole(): Promise<void> {
    await openUrl(this.aiKey.guide().consoleUrl);
  }

  protected async openVideo(): Promise<void> {
    const url = this.aiKey.guide().helpVideoUrl;
    if (url) await openUrl(url);
  }

  protected readonly icons = {
    badgeCheck: BadgeCheck,
    checkCheck: CheckCheck,
    externalLink: ExternalLink,
    info: Info,
    key: Key,
    lock: Lock,
    playCircle: CirclePlay,
    triangleAlert: TriangleAlert,
  };
}
