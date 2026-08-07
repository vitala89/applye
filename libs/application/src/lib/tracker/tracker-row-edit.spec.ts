import type { TrackerRow } from '@applye/core';
import {
  buildTrackerFieldsInput,
  trackerDraftValue,
  trackerStatusChanged,
} from './tracker-row-edit';
import { TrackerColumnDef } from './tracker-columns';

function row(over: Partial<TrackerRow> = {}): TrackerRow {
  return { id: 1, ...over };
}

function col(over: Partial<TrackerColumnDef> = {}): TrackerColumnDef {
  return { key: 'notes', src: 'app', ...over };
}

describe('buildTrackerFieldsInput', () => {
  it('sends the seven editable fields and the custom blob', () => {
    const draft = row({
      id: 7,
      contactName: 'Ada',
      contactRole: 'Hiring lead',
      contactChannel: 'email',
      nextAction: 'Follow up',
      nextActionAt: '2026-09-01',
      salaryRange: '70-80k',
      notes: 'Warm intro',
    });

    expect(buildTrackerFieldsInput(draft, { cf_1: 'yes' })).toEqual({
      id: 7,
      contactName: 'Ada',
      contactRole: 'Hiring lead',
      contactChannel: 'email',
      nextAction: 'Follow up',
      nextActionAt: '2026-09-01',
      salaryRange: '70-80k',
      notes: 'Warm intro',
      customFields: '{"cf_1":"yes"}',
    });
  });

  // The rule the whole function exists for: `|| undefined` is what makes
  // clearing a cell clear the stored value instead of writing a blank string.
  it('sends an emptied field as undefined, not as an empty string', () => {
    const input = buildTrackerFieldsInput(row({ contactName: '', notes: 'kept' }), {});

    expect(input.contactName).toBeUndefined();
    expect(input.notes).toBe('kept');
  });

  // Asymmetric on the two ways a field can be absent: one never set, one
  // cleared by the user. Both must reach the gateway the same way.
  it('treats an untouched field and a cleared one alike', () => {
    const untouched = buildTrackerFieldsInput(row({}), {});
    const cleared = buildTrackerFieldsInput(row({ salaryRange: '' }), {});

    expect(untouched.salaryRange).toBeUndefined();
    expect(cleared.salaryRange).toBeUndefined();
  });

  it('carries the row id through unchanged', () => {
    expect(buildTrackerFieldsInput(row({ id: 42 }), {}).id).toBe(42);
  });

  it('sends an empty custom map as an empty blob, not as omitted', () => {
    expect(buildTrackerFieldsInput(row(), {}).customFields).toBe('{}');
  });

  // Fields outside the editable seven belong to the job posting or the
  // pipeline. Sending them would let the grid overwrite them.
  it('does not send fields the inline editor cannot edit', () => {
    const input = buildTrackerFieldsInput(
      row({ company: 'Aiven', status: 'offer', appliedAt: '2026-08-01', archived: true }),
      {},
    );

    expect(input).not.toHaveProperty('company');
    expect(input).not.toHaveProperty('status');
    expect(input).not.toHaveProperty('appliedAt');
    expect(input).not.toHaveProperty('archived');
  });
});

describe('trackerStatusChanged', () => {
  it('is true when the draft moved to a different status', () => {
    expect(trackerStatusChanged(row({ status: 'offer' }), row({ status: 'applied' }))).toBe(true);
  });

  it('is false when the status is untouched', () => {
    expect(trackerStatusChanged(row({ status: 'applied' }), row({ status: 'applied' }))).toBe(
      false,
    );
  });

  // The editor offers a fixed list with no blank option, so a falsy draft
  // status means "not touched" rather than "set to nothing". Dropping the
  // first check would write an empty status over a real one.
  it('is false when the draft has no status, even against a row that has one', () => {
    expect(trackerStatusChanged(row({ status: '' }), row({ status: 'offer' }))).toBe(false);
    expect(trackerStatusChanged(row({}), row({ status: 'offer' }))).toBe(false);
  });

  it('is true when the original row had no status and the draft sets one', () => {
    expect(trackerStatusChanged(row({ status: 'saved' }), row({}))).toBe(true);
  });

  // `find` returns undefined when the row has left the list under the editor.
  it('is true when the original row is gone, so the write is not skipped', () => {
    expect(trackerStatusChanged(row({ status: 'saved' }), undefined)).toBe(true);
  });
});

describe('trackerDraftValue', () => {
  it('reads a built-in column off the draft', () => {
    expect(trackerDraftValue(row({ notes: 'hello' }), {}, col({ key: 'notes' }))).toBe('hello');
  });

  // Asymmetric: the draft's blob and the editor's map disagree. While a row is
  // open the map is the truth - the blob is only rebuilt on save.
  it('reads a custom column out of the editor map, not the row blob', () => {
    const draft = row({ customFields: '{"cf_1":"stale"}' });

    expect(trackerDraftValue(draft, { cf_1: 'typed' }, col({ key: 'cf_1', custom: true }))).toBe(
      'typed',
    );
  });

  it('reads a custom column with nothing typed yet as empty', () => {
    expect(trackerDraftValue(row(), {}, col({ key: 'cf_1', custom: true }))).toBe('');
  });

  it('reads every column as empty when no row is open', () => {
    expect(trackerDraftValue(null, { cf_1: 'typed' }, col({ key: 'notes' }))).toBe('');
    expect(trackerDraftValue(null, { cf_1: 'typed' }, col({ key: 'cf_1', custom: true }))).toBe('');
  });

  it('truncates a timestamp in an -At column, as the grid does', () => {
    expect(
      trackerDraftValue(
        row({ nextActionAt: '2026-09-01T10:00:00Z' }),
        {},
        col({ key: 'nextActionAt' }),
      ),
    ).toBe('2026-09-01');
  });
});
