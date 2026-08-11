import { Injectable, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { CvContent, DocumentLibraryItem, withCvPhoto } from '@applye/core';

import { DbService } from '@applye/data';
import { TranslateService } from '@applye/i18n';
import { DocumentRegionTag } from '@applye/application';

/**
 * The German-market photo prompt.
 *
 * A photo is conventional on a German CV and unusual - sometimes actively
 * discouraged - elsewhere, so switching the CV's market to Germany is the one
 * moment where asking is useful rather than nagging. Asked once per visit to a
 * job, and never for the other markets.
 *
 * Its own service because it is its own decision: a flag, a dialog, and one
 * document write, sharing nothing with the rest of the jobs page except the CV
 * it patches. Component-scoped, so "once per visit" is the lifetime of the page.
 */
@Injectable()
export class CvPhotoPromptService {
  private readonly db = inject(DbService);
  private readonly router = inject(Router);
  private readonly i18n = inject(TranslateService);
  private readonly t = this.i18n.t;

  readonly open = signal(false);
  readonly busy = signal(false);
  /** The last outcome worth showing, or '' - the page owns where it appears. */
  readonly status = signal('');
  private prompted = false;

  /** Raise the prompt the first time this visit that the market becomes German. */
  onRegionChosen(region: DocumentRegionTag): void {
    if (region !== 'de' || this.prompted) return;
    this.prompted = true;
    this.open.set(true);
  }

  dismiss(): void {
    this.open.set(false);
  }

  /**
   * "Yes, add my photo."
   *
   * With a photo already on the profile this writes it into the linked CV and
   * returns the updated document. Without one it sends the user to the
   * profile's Photo section, so the photo is cropped once and reused rather
   * than re-uploaded per application. With no CV generated yet there is nothing
   * to patch: the photo is on the profile and the region is set, so the CV
   * picks it up when it is created.
   *
   * Returns the document to link, or null when there is nothing to link.
   */
  async accept(
    photo: string | null,
    cv: DocumentLibraryItem | null,
  ): Promise<DocumentLibraryItem | null> {
    this.status.set('');
    if (!photo) {
      this.open.set(false);
      void this.router.navigate(['/profile']);
      return null;
    }
    if (!cv?.id) {
      this.open.set(false);
      return null;
    }

    this.busy.set(true);
    try {
      const content = withCvPhoto(
        JSON.parse(cv.contentJson ?? '{"sections":[]}') as CvContent,
        photo,
      );
      const doc = await this.db.documentLibraryUpsert({
        ...cv,
        id: cv.id,
        contentJson: JSON.stringify(content),
      });
      this.status.set(this.t()('jobs.wizard.photo_added'));
      this.open.set(false);
      return doc;
    } catch (e) {
      this.status.set(String(e));
      return null;
    } finally {
      this.busy.set(false);
    }
  }
}
