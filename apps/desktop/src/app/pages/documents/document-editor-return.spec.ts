import { convertToParamMap } from '@angular/router';
import {
  applyWizardReturnParams,
  backLabel,
  isApplyWizardReturn,
  myJobsReturnJobId,
} from './document-editor-return';

/** Identity translator, so an assertion names the key rather than a locale. */
const t = (key: string): string => key;

function params(q: Record<string, string>) {
  return convertToParamMap(q);
}

describe('document editor return rules', () => {
  describe('isApplyWizardReturn', () => {
    it('is true only for the wizard', () => {
      expect(isApplyWizardReturn(params({ returnTo: 'applyWizard' }))).toBe(true);
      expect(isApplyWizardReturn(params({ returnTo: 'myJobs' }))).toBe(false);
      expect(isApplyWizardReturn(params({}))).toBe(false);
    });
  });

  describe('myJobsReturnJobId', () => {
    it('returns the job only when My Jobs sent the user', () => {
      expect(myJobsReturnJobId(params({ returnTo: 'myJobs', jobId: '7' }))).toBe('7');
    });

    it('ignores a jobId that arrived from anywhere else', () => {
      // The wizard also carries `jobId`, and Back must hand control to the
      // wizard rather than jumping straight to the job.
      expect(myJobsReturnJobId(params({ returnTo: 'applyWizard', jobId: '7' }))).toBeNull();
      expect(myJobsReturnJobId(params({ jobId: '7' }))).toBeNull();
    });
  });

  describe('backLabel', () => {
    const keys = { job: 'back_to_job', documents: 'back_to_documents' };

    it('names the job when there is one to return to', () => {
      const label = backLabel(
        params({ returnTo: 'myJobs', jobId: '7', jobLabel: 'Senior Dev at Acme' }),
        keys,
        t,
      );

      expect(label).toBe('back_to_job'.replace('{job}', 'Senior Dev at Acme'));
      expect(
        backLabel(params({ returnTo: 'myJobs', jobId: '7', jobLabel: 'X' }), keys, (k) =>
          k === 'back_to_job' ? 'Back to {job}' : 'Back',
        ),
      ).toBe('Back to X');
    });

    it('falls back to Documents when either half is missing', () => {
      // A jobLabel with no myJobs return is a stale link, not a job to name.
      expect(backLabel(params({ jobLabel: 'Acme' }), keys, t)).toBe('back_to_documents');
      // A job with no label has nothing to interpolate.
      expect(backLabel(params({ returnTo: 'myJobs', jobId: '7' }), keys, t)).toBe(
        'back_to_documents',
      );
      expect(backLabel(params({}), keys, t)).toBe('back_to_documents');
    });
  });

  describe('applyWizardReturnParams', () => {
    it('puts the wizard back on its documents step for this editor', () => {
      const out = applyWizardReturnParams(params({ reviewHash: 'abc' }), 'cv', 42, true);

      expect(out).toEqual({
        returnTo: 'applyWizard',
        wizardStep: 'documents',
        documentType: 'cv',
        documentId: 42,
        reviewHash: 'abc',
        documentSaved: '1',
      });
    });

    it('reports whether the document was saved, as the wizard expects it', () => {
      expect(applyWizardReturnParams(params({}), 'cv', 1, false).documentSaved).toBe('0');
      expect(applyWizardReturnParams(params({}), 'cv', 1, true).documentSaved).toBe('1');
    });

    it('carries each editor its own documentType', () => {
      expect(applyWizardReturnParams(params({}), 'cover_letter', 1, false).documentType).toBe(
        'cover_letter',
      );
    });

    it('falls back to the id the wizard sent when the record is not in hand yet', () => {
      // A return before the first save has no record of its own.
      expect(
        applyWizardReturnParams(params({ documentId: '9' }), 'cv', null, false).documentId,
      ).toBe('9');
      // ...and the record wins once it exists.
      expect(applyWizardReturnParams(params({ documentId: '9' }), 'cv', 42, false).documentId).toBe(
        42,
      );
    });
  });
});
