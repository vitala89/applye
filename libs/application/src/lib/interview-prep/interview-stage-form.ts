import type { StageType, SupportedLanguage } from '@applye/core';

/** What the add/edit modal is holding. Strings throughout, because that is what
 * the inputs bind to; empty means "not set" on the way to the gateway. */
export interface StageFormValue {
  stageType: StageType;
  stageLabel: string;
  scheduledAt: string;
  stageLanguage: SupportedLanguage | '';
  interviewerName: string;
  interviewerRole: string;
  interviewerEmail: string;
  notes: string;
}

export function emptyStageForm(): StageFormValue {
  return {
    stageType: 'hr_screen',
    stageLabel: '',
    scheduledAt: '',
    stageLanguage: '',
    interviewerName: '',
    interviewerRole: '',
    interviewerEmail: '',
    notes: '',
  };
}

/**
 * The form in the shape create and update both take.
 *
 * Empty strings become `undefined`, so a field the user left blank is **absent**
 * from the write rather than written as `''`. The distinction is not cosmetic:
 * an absent optional stays null in the row, while `''` is a value, and the two
 * read differently everywhere downstream.
 */
export function stageGatewayFields(form: StageFormValue, label: string) {
  return {
    stageType: form.stageType,
    stageLabel: label,
    scheduledAt: form.scheduledAt || undefined,
    stageLanguage: form.stageLanguage || undefined,
    interviewerName: form.interviewerName || undefined,
    interviewerRole: form.interviewerRole || undefined,
    interviewerEmail: form.interviewerEmail || undefined,
    notes: form.notes || undefined,
  };
}
