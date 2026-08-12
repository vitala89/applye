import { DocumentCardState, documentCardStatus, documentStatusKey } from './doc-card-status';

function state(overrides: Partial<DocumentCardState> = {}): DocumentCardState {
  return {
    preparing: false,
    awaitingInput: false,
    linked: false,
    hasCheckedInput: false,
    outdated: false,
    ...overrides,
  };
}

describe('documentCardStatus', () => {
  it('reports needs_input while a preparing draft waits on the gap dialog', () => {
    expect(documentCardStatus(state({ preparing: true, awaitingInput: true }))).toBe('needs_input');
  });

  it('still reports needs_input when the card already has a linked document', () => {
    expect(documentCardStatus(state({ preparing: true, awaitingInput: true, linked: true }))).toBe(
      'needs_input',
    );
  });

  it('reports generating while a draft runs unattended', () => {
    expect(documentCardStatus(state({ preparing: true }))).toBe('generating');
  });

  it('reports missing when nothing is linked and nothing is running', () => {
    expect(documentCardStatus(state())).toBe('missing');
  });

  it('reports needs_review when the final checks are stale', () => {
    expect(documentCardStatus(state({ linked: true, hasCheckedInput: true, outdated: true }))).toBe(
      'needs_review',
    );
  });

  it('reports ready when the final checks are current', () => {
    expect(documentCardStatus(state({ linked: true, hasCheckedInput: true }))).toBe('ready');
  });

  it('reports linked when a document exists but no checks have run', () => {
    expect(documentCardStatus(state({ linked: true }))).toBe('linked');
  });
});

describe('documentStatusKey', () => {
  it('namespaces every status under the wizard catalogue', () => {
    expect(documentStatusKey('needs_input')).toBe('jobs.wizard.document_status_needs_input');
    expect(documentStatusKey('generating')).toBe('jobs.wizard.document_status_generating');
  });
});
