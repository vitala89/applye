import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ButtonDirective } from '@applye/ui';
import {
  ARTIFACT_CACHED_KEY,
  type ArtifactOutcome,
  type ProfileArtifact,
  ProfileArtifactStore,
  ProfileFormStore,
  ProfileStore,
} from '@applye/application';
import { TranslateService } from '@applye/i18n';
import { LucideAngularModule, Info, Save, Check, RotateCcw, CircleDot } from 'lucide-angular';
import { OnboardingService } from '../../core/onboarding/onboarding.service';
import { ToastService } from '../../core/toast/toast.service';
import { CompletenessHeroComponent } from './completeness-hero.component';
import { ProfilePhotoComponent } from './profile-photo/profile-photo.component';
import { ProfileArchetypesComponent } from './profile-archetypes/profile-archetypes.component';
import { ProfileExperienceComponent } from './profile-experience/profile-experience.component';
import { ProfileEducationComponent } from './profile-education/profile-education.component';
import { ProfileLanguagesComponent } from './profile-languages/profile-languages.component';
import { ProfileSkillsComponent } from './profile-skills/profile-skills.component';
import { ProfileAiToolsComponent } from './profile-ai-tools/profile-ai-tools.component';
import { ProfileTextFieldComponent } from './profile-text-field/profile-text-field.component';
import { ProfileRawEditorComponent } from './profile-raw-editor/profile-raw-editor.component';

/** Which sentence the save status line is currently showing. The stores record
 * what happened; choosing the wording is the page's job. */
type SaveMessage = 'none' | 'loadFailed' | 'saved' | 'saveFailed';

@Component({
  selector: 'app-profile',
  standalone: true,
  imports: [
    FormsModule,
    ButtonDirective,
    CompletenessHeroComponent,
    LucideAngularModule,
    ProfilePhotoComponent,
    ProfileArchetypesComponent,
    ProfileExperienceComponent,
    ProfileEducationComponent,
    ProfileLanguagesComponent,
    ProfileSkillsComponent,
    ProfileAiToolsComponent,
    ProfileTextFieldComponent,
    ProfileRawEditorComponent,
  ],
  templateUrl: './profile.component.html',
  styleUrl: './profile.component.scss',
  providers: [ProfileFormStore, ProfileStore, ProfileArtifactStore],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProfileComponent implements OnInit {
  protected readonly store = inject(ProfileStore);
  protected readonly artifacts = inject(ProfileArtifactStore);
  private readonly i18n = inject(TranslateService);
  protected readonly onboarding = inject(OnboardingService);
  private readonly toast = inject(ToastService);
  protected readonly t = this.i18n.t;
  protected readonly infoIcon = Info;
  protected readonly saveIcon = Save;
  protected readonly checkIcon = Check;
  protected readonly rerunIcon = RotateCcw;
  protected readonly unsavedIcon = CircleDot;

  private readonly saveMessage = signal<SaveMessage>('none');
  private readonly outcome = signal<Record<ProfileArtifact, ArtifactOutcome | 'none'>>({
    scoring: 'none',
    pitch: 'none',
  });

  /** A separator is presentation, so the store hands over the facts and the
   * page joins them. */
  readonly heroSubtitle = computed(() => this.store.heroFacts().join(' · '));

  readonly saveStatus = computed(() => {
    const at = this.store.lastSavedAt();
    switch (this.saveMessage()) {
      case 'loadFailed':
        return this.t()('profile.load_failed').replace('{error}', this.store.error());
      case 'saveFailed':
        return this.t()('profile.save_failed').replace('{error}', this.store.error());
      case 'saved':
        return this.t()('profile.saved_at').replace('{date}', at ?? 'now');
      default:
        return at ? this.t()('profile.last_saved').replace('{date}', at) : '';
    }
  });

  readonly saveError = computed(
    () => this.saveMessage() === 'loadFailed' || this.saveMessage() === 'saveFailed',
  );

  readonly scoreStatus = computed(() => this.artifactStatus('scoring'));
  readonly pitchStatus = computed(() => this.artifactStatus('pitch'));
  readonly scoreError = computed(() => this.outcome().scoring === 'failed');
  readonly pitchError = computed(() => this.outcome().pitch === 'failed');

  /** Each of the store's four outcomes is a different sentence, and all four
   * are the page's to write. */
  private artifactStatus(kind: ProfileArtifact): string {
    switch (this.outcome()[kind]) {
      case 'empty':
        return this.t()('profile.empty_hint');
      case 'cached':
        return this.t()(ARTIFACT_CACHED_KEY[kind]);
      case 'generated': {
        const tokens = this.artifacts.tokens(kind);
        return this.t()('profile.generated_tokens')
          .replace('{in}', String(tokens?.input ?? 0))
          .replace('{out}', String(tokens?.output ?? 0));
      }
      case 'failed':
        return this.t()('profile.generate_failed').replace('{error}', this.artifacts.error(kind));
      default:
        return '';
    }
  }

  async ngOnInit(): Promise<void> {
    if (!(await this.store.load())) {
      this.saveMessage.set('loadFailed');
      this.toast.error(this.t()('profile.load_failed').replace('{error}', this.store.error()));
    }
  }

  /** Scrolling an element into view is the page's, not the layer's. */
  focusField(key: string): void {
    const el = document.getElementById('field-' + key);
    el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    (el as HTMLElement | null)?.focus?.();
  }

  async save(): Promise<void> {
    if (await this.store.save()) {
      this.saveMessage.set('saved');
      this.toast.success(this.t()('profile.saved_ok'));
    } else {
      this.saveMessage.set('saveFailed');
      this.toast.error(this.t()('profile.save_failed').replace('{error}', this.store.error()));
    }
  }

  generateScoringProfile(): Promise<void> {
    return this.generate('scoring');
  }

  generatePitch(): Promise<void> {
    return this.generate('pitch');
  }

  /** Only a real failure toasts. `empty` and `cached` are refusals: they say
   * their piece in the status line and nowhere else, exactly as before. */
  private async generate(kind: ProfileArtifact): Promise<void> {
    const result = await this.artifacts.generate(kind);
    this.outcome.update((o) => ({ ...o, [kind]: result }));
    if (result === 'failed') {
      this.toast.error(
        this.t()('profile.generate_failed').replace('{error}', this.artifacts.error(kind)),
      );
    }
  }
}
