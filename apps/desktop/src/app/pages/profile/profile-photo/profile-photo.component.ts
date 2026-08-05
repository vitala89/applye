import {
  ChangeDetectionStrategy,
  Component,
  inject,
  input,
  linkedSignal,
  output,
  signal,
} from '@angular/core';
import { ChevronDown, LucideAngularModule, Plus } from 'lucide-angular';
import { DbService } from '@applye/data';
import { TranslateService } from '@applye/i18n';
import { ToastService } from '../../../core/toast/toast.service';
import { CvPhotoCropComponent } from '../../documents/cv-detail/cv-photo-crop/cv-photo-crop.component';

/**
 * Profile's photo section: one cropped headshot, reused by any CV that wants one.
 *
 * Unlike Profile's other sections this one owns its whole flow - pick, crop,
 * persist - because the photo is not part of the profile form and never
 * reaches `fullMd`. It has its own backend command for the same reason, so
 * routing the write back through the page would only spread one save path
 * across a boundary.
 *
 * `photo` is a seed, not a binding: it carries what the profile row last
 * reported, and `uri` takes over from the first local edit. A profile reload
 * re-seeds it, which is correct - `db_upsert_profile` leaves `photo_data_uri`
 * alone and returns the row, so the reloaded value is whatever this component
 * last wrote.
 */
@Component({
  selector: 'app-profile-photo',
  standalone: true,
  imports: [LucideAngularModule, CvPhotoCropComponent],
  templateUrl: './profile-photo.component.html',
  styleUrl: './profile-photo.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProfilePhotoComponent {
  private readonly db = inject(DbService);
  private readonly toast = inject(ToastService);
  protected readonly t = inject(TranslateService).t;

  readonly photo = input.required<string | null>();
  readonly open = input.required<boolean>();

  readonly toggled = output<void>();

  protected readonly uri = linkedSignal<string | null>(() => this.photo());
  protected readonly saving = signal(false);
  /** Source image awaiting a crop; non-null opens the crop modal. */
  protected readonly cropSourceUri = signal<string | null>(null);

  protected readonly icons = {
    chevron: ChevronDown,
    plus: Plus,
  };

  /** Native image picker -> backend read -> crop modal. Mirrors the CV editor's
   * flow so both places produce a photo in the identical frame. */
  protected async pick(): Promise<void> {
    const { open } = await import('@tauri-apps/plugin-dialog');
    const selected = await open({
      multiple: false,
      filters: [{ name: 'Image', extensions: ['jpg', 'jpeg', 'png', 'webp'] }],
    });
    if (typeof selected !== 'string') return;
    try {
      this.cropSourceUri.set(await this.db.cvPhotoReadFile(selected));
    } catch (e) {
      this.toast.error(String(e));
    }
  }

  protected async onCropConfirmed(uri: string): Promise<void> {
    this.cropSourceUri.set(null);
    await this.save(uri);
  }

  protected onCropCancelled(): void {
    this.cropSourceUri.set(null);
  }

  protected async remove(): Promise<void> {
    await this.save(null);
  }

  /** Persists immediately rather than waiting for the page's Save button: the
   * photo is not part of the profile form, and a cropped photo left unsaved
   * would be silently lost on navigation. */
  private async save(uri: string | null): Promise<void> {
    if (this.saving()) return;
    this.saving.set(true);
    const previous = this.uri();
    this.uri.set(uri);
    try {
      await this.db.setProfilePhoto(uri);
      this.toast.success(this.t()(uri ? 'profile.photo_saved' : 'profile.photo_removed'));
    } catch (e) {
      this.uri.set(previous);
      this.toast.error(String(e));
    } finally {
      this.saving.set(false);
    }
  }
}
