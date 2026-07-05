import { Injectable, signal } from '@angular/core';

/** Lets a route component override the topbar title (e.g. the job title on
 * `/jobs/:id`) instead of the generic per-section nav label. Cleared by the
 * component on destroy so leaving the route falls back to the nav label. */
@Injectable({ providedIn: 'root' })
export class PageTitleService {
  private readonly overrideState = signal<string | null>(null);
  readonly override = this.overrideState.asReadonly();

  set(title: string): void {
    this.overrideState.set(title);
  }

  clear(): void {
    this.overrideState.set(null);
  }
}
