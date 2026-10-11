import {
  ChangeDetectionStrategy,
  Component,
  inject,
  input,
  linkedSignal,
  output,
} from '@angular/core';
import { ChevronDown, LucideAngularModule, Plus } from 'lucide-angular';
import { ProfilePhotoStore } from '@applye/application';
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
 *
 * **That is also why `uri` did not move to `ProfilePhotoStore`**: it is a
 * `linkedSignal` on a required input, and an input belongs to the component
 * that declares it (ADR-0005, amendment twenty-eight). The store owns what is
 * in flight and the two gateway calls; the value being rendered, and the
 * optimistic set-and-revert around it, stay here.
 */
@Component({
  selector: 'app-profile-photo',
  standalone: true,
  imports: [LucideAngularModule, CvPhotoCropComponent],
  providers: [ProfilePhotoStore],
  templateUrl: './profile-photo.component.html',
  styleUrl: './profile-photo.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProfilePhotoComponent {
  private readonly toast = inject(ToastService);
  protected readonly t = inject(TranslateService).t;
  protected readonly photos = inject(ProfilePhotoStore);

  readonly photo = input.required<string | null>();
  readonly open = input.required<boolean>();

  readonly toggled = output<void>();

  protected readonly uri = linkedSignal<string | null>(() => this.photo());

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
    if (!(await this.photos.readForCrop(selected))) this.toast.error(this.photos.error());
  }

  protected async onCropConfirmed(uri: string): Promise<void> {
    this.photos.cancelCrop();
    await this.save(uri);
  }

  protected onCropCancelled(): void {
    this.photos.cancelCrop();
  }

  protected async remove(): Promise<void> {
    await this.save(null);
  }

  /**
   * The optimistic half of the save. The store performs the write and owns
   * `saving`; what stays here is the value being rendered - `uri` is a
   * `linkedSignal` on an input, so the store cannot hold it - and therefore the
   * revert too.
   *
   * The `saving` guard is checked here as well as in the store, and that is not
   * redundant: without it a second click would show the new photo before the
   * store refused to write it, and the revert would put back a value the first
   * save is still in the middle of replacing.
   */
  private async save(uri: string | null): Promise<void> {
    if (this.photos.saving()) return;
    const previous = this.uri();
    this.uri.set(uri);

    if (await this.photos.save(uri)) {
      this.toast.success(this.t()(uri ? 'profile.photo_saved' : 'profile.photo_removed'));
      return;
    }
    this.uri.set(previous);
    this.toast.error(this.photos.error());
  }
}
