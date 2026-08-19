import { Injectable, inject, signal } from '@angular/core';
import { DbService, DocumentsGateway } from '@applye/data';

/**
 * The profile headshot's pick-crop-save flow: whether a save is running, the
 * source image waiting to be cropped, and the two gateway calls.
 *
 * **`uri` deliberately stayed on the component** (ADR-0005, amendment
 * twenty-eight). It is a `linkedSignal` seeded from a required input, and an
 * input belongs to the component that declares it - a store cannot derive one.
 * Reproducing that with a `seed()` method and an effect would be more machinery
 * than the thing it replaced, and would add a re-seed ordering question that
 * does not exist today. So the component keeps the value it renders and its
 * optimistic set-and-revert, and this store owns what is in flight.
 *
 * **It does not toast**, and it does not decide what "saved" reads as. `save`
 * returns whether the write succeeded and leaves `error` set on failure; the
 * component picks between the saved and removed wordings, which are
 * translations and therefore the app's.
 */
@Injectable()
export class ProfilePhotoStore {
  private readonly db = inject(DbService);
  private readonly docs = inject(DocumentsGateway);

  readonly saving = signal(false);
  /** Source image awaiting a crop; non-null opens the crop modal. */
  readonly cropSourceUri = signal<string | null>(null);
  readonly error = signal('');

  /**
   * Reads a picked file through the backend, which is what turns a path into
   * the data URI the crop modal needs. Returns `false` and sets `error` if the
   * read fails, leaving the modal closed.
   */
  async readForCrop(path: string): Promise<boolean> {
    this.error.set('');
    try {
      this.cropSourceUri.set(await this.docs.cvPhotoReadFile(path));
      return true;
    } catch (e) {
      this.error.set(String(e));
      return false;
    }
  }

  cancelCrop(): void {
    this.cropSourceUri.set(null);
  }

  /**
   * Persists immediately rather than waiting for the page's Save button: the
   * photo is not part of the profile form, and a cropped photo left unsaved
   * would be silently lost on navigation.
   *
   * Returns `false` without writing when a save is already running - the guard
   * the component carried, kept next to the flag it guards.
   */
  async save(uri: string | null): Promise<boolean> {
    if (this.saving()) return false;
    this.saving.set(true);
    this.error.set('');
    try {
      await this.db.setProfilePhoto(uri);
      return true;
    } catch (e) {
      this.error.set(String(e));
      return false;
    } finally {
      this.saving.set(false);
    }
  }
}
