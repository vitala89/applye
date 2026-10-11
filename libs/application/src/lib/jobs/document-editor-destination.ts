import { ReviewDocumentKind } from '../documents/document-gen.service';
import { FinalChecks } from './final-checks.service';

/**
 * Where a document editor should open, as facts about the document and the
 * trip back. The desktop turns this into a route. Nothing here is a path,
 * a query map, or a router instruction.
 */
export type DocumentEditorReturn =
  | { context: 'myJobs'; jobId: number; jobLabel: string }
  | { context: 'applyWizard'; jobId: number; reviewHash: string };

export interface DocumentEditorDestination {
  kind: ReviewDocumentKind;
  documentId: number;
  /** The wizard's Review action opens the rendered document first. */
  preview?: boolean;
  returnTo?: DocumentEditorReturn;
  /** Final checks the desktop keeps for the trip into the editor and back. */
  parkedReview?: { reviewHash: string; checks: FinalChecks };
}
