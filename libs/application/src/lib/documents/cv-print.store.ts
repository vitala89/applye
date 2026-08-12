import { Injectable, inject, signal } from '@angular/core';
import {
  CV_STYLE_DEFAULT,
  getBuiltinTheme,
  normalizeCvContent,
  themeStyleSeed,
  type CvContent,
  type CvSection,
  type CvStyle,
  type PhotoPlacement,
} from '@applye/core';
import { DbService } from '@applye/data';

/**
 * What the hidden print window renders for a CV, and the one call that tells
 * Rust the snapshot may be taken.
 *
 * **The settle sequence is not here** - waiting on `document.fonts` and marking
 * `document.body` printable is view timing, and this layer does not touch the
 * DOM (ADR-0005, amendment twenty-seven).
 */
@Injectable()
export class CvPrintStore {
  private readonly db = inject(DbService);

  readonly loaded = signal(false);
  readonly sections = signal<CvSection[]>([]);
  readonly style = signal<CvStyle>(CV_STYLE_DEFAULT);
  readonly themeId = signal(1);
  readonly includePhoto = signal(false);
  readonly photoDataUri = signal<string | null>(null);
  readonly photoPlacement = signal<PhotoPlacement>('above_left');
  readonly includeBirthdate = signal(false);
  readonly includeMaritalStatus = signal(false);

  /**
   * Returns `false` when the row is missing, leaving `loaded` false and the
   * window blank - the Rust side times out and reports the failure.
   */
  async load(id: number): Promise<boolean> {
    const item = await this.db.documentLibraryGet(id);
    if (!item) return false;

    const raw: CvContent = item.contentJson ? JSON.parse(item.contentJson) : { sections: [] };
    const ordered = [...normalizeCvContent(raw).sections].sort((a, b) => a.order - b.order);
    this.sections.set(ordered);

    const photo = ordered.find((s) => s.key === 'photo') as
      Extract<CvSection, { key: 'photo' }> | undefined;
    this.includePhoto.set(photo?.visible ?? false);
    this.photoDataUri.set(photo?.dataUri ?? null);
    this.photoPlacement.set(photo?.placement ?? 'above_left');

    const personal = ordered.find(
      (s): s is Extract<CvSection, { key: 'personal_details' }> => s.key === 'personal_details',
    );
    this.includeBirthdate.set(!!personal?.birthDate);
    this.includeMaritalStatus.set(!!personal?.maritalStatus);

    const themeId = item.themeId ?? 1;
    this.themeId.set(themeId);
    const seed = themeStyleSeed(getBuiltinTheme(themeId));
    this.style.set(
      item.styleJson
        ? { ...CV_STYLE_DEFAULT, ...seed, ...JSON.parse(item.styleJson) }
        : { ...CV_STYLE_DEFAULT, ...seed },
    );
    this.loaded.set(true);
    return true;
  }

  notifyReady(): Promise<void> {
    return this.db.printWindowReady();
  }
}
