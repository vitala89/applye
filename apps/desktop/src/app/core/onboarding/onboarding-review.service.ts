import { Injectable, computed, signal } from '@angular/core';
import { CvParsedContent, splitDisplayName } from '@applye/core';
import type { OnboardingCvOverrides } from './onboarding-content.util';

/**
 * The parsed resume and the corrections the user makes to it on the Review step.
 *
 * Component-scoped, provided by the wizard: the Review step child owns the
 * fields, while the wizard reads the same signals back for the Ready summary,
 * the profile it saves and the CV document it writes. These are one set of
 * signals shared through this service, not two copies kept in sync.
 */
@Injectable()
export class OnboardingReviewService {
  readonly parsedCv = signal<CvParsedContent | null>(null);

  readonly experience = computed(() => this.parsedCv()?.experience ?? []);
  readonly skills = computed(() => this.parsedCv()?.skills ?? []);
  readonly lowConfidenceCount = computed(() => this.parsedCv()?.lowConfidenceNotes?.length ?? 0);

  /** The Review step only exists to check a parsed resume. Without one it is an
   * empty form, so it is skipped forward AND unreachable backwards. */
  readonly hasReview = computed(() => this.parsedCv() !== null);

  // ---- Review (editable overrides seeded once from the parsed CV) ----
  readonly reviewFirstName = signal('');
  readonly reviewLastName = signal('');
  /** Set the first time the user touches either name field. The nudge is a
   * question, and a question stops being worth asking once it is answered -
   * including when the answer is "what you parsed was already right". */
  readonly nameEdited = signal(false);

  /** True when the parse could not confirm the split, so the review step should
   * ask. Never gates Continue: Applye augments, it does not block. */
  readonly needsNameConfirm = computed(() => {
    if (this.nameEdited()) return false;
    const first = this.reviewFirstName().trim();
    const last = this.reviewLastName().trim();
    // Nothing parsed at all, nothing to confirm. But one part alone is exactly
    // the case worth asking about, whichever of the two it is.
    if (!first && !last) return false;
    if (!first || !last) return true;
    return this.parsedCv()?.personalDetails.nameSplitConfident !== true;
  });

  onNameEdited(): void {
    this.nameEdited.set(true);
  }

  readonly reviewEmail = signal('');
  readonly reviewPhone = signal('');
  readonly reviewAddress = signal('');

  /** Any change to the resume source invalidates what was parsed from the old
   * one - a stale parse would otherwise reach the profile and the CV document,
   * and keep the Review step reachable for text that is no longer there. */
  discardParse(): void {
    this.parsedCv.set(null);
  }

  /** Seed each review field only if still empty - a Back + re-parse must never
   * silently clobber the user's manual edits. Extracted so tests can drive
   * seeding without running a full parse. */
  seedReviewFields(): void {
    const cv = this.parsedCv();
    if (!cv) return;
    const split = splitDisplayName(cv.personalDetails.fullName ?? '');
    // `||` rather than `??`: a part the parse left as an empty string carries no
    // more information than a missing one, so both fall back to the derived split.
    if (!this.reviewFirstName().trim())
      this.reviewFirstName.set(cv.personalDetails.firstName || split.firstName);
    if (!this.reviewLastName().trim())
      this.reviewLastName.set(cv.personalDetails.lastName || split.lastName);
    if (!this.reviewEmail().trim()) this.reviewEmail.set(cv.personalDetails.email ?? '');
    if (!this.reviewPhone().trim()) this.reviewPhone.set(cv.personalDetails.phone ?? '');
    if (!this.reviewAddress().trim()) this.reviewAddress.set(cv.personalDetails.address ?? '');
  }

  /** What the user's edits say the contact block should be, in the shape the
   * content helpers take. */
  overrides(): OnboardingCvOverrides {
    return {
      firstName: this.reviewFirstName(),
      lastName: this.reviewLastName(),
      email: this.reviewEmail(),
      phone: this.reviewPhone(),
      address: this.reviewAddress(),
      parsedFullName: this.parsedCv()?.personalDetails.fullName ?? '',
      nameEdited: this.nameEdited(),
    };
  }
}
