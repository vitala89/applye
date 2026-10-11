import { FinalChecks } from './final-checks.service';

/**
 * Where the desktop should open a document editor.
 *
 * The application layer chooses the route and the query facts. The page
 * navigates. `parkedReview` is the final-checks snapshot the page keeps in
 * session storage for the trip into the editor and back.
 */
export interface DocumentEditorDestination {
  commands: (string | number)[];
  queryParams?: Record<string, string | number>;
  parkedReview?: { reviewHash: string; checks: FinalChecks };
}
