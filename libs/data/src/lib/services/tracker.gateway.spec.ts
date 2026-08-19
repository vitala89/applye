import { TestBed } from '@angular/core/testing';
import { invoke } from '@tauri-apps/api/core';

import { TrackerGateway } from './tracker.gateway';

jest.mock('@tauri-apps/api/core', () => ({ invoke: jest.fn(async () => null) }));

/**
 * The command strings and argument shapes, for the reason `drafts.gateway.spec.ts`
 * states: every consumer stubs the gateway, so a method invoking the wrong Rust
 * command leaves the whole suite green and fails only in the running app.
 *
 * Two shapes here are worth pinning beyond the names. `trackerReportExportPdfWysiwyg`
 * passes its params **as the argument map itself**, like `addSource` and unlike
 * every other save; and the three custom-column commands are `..._list`,
 * `..._add` and `..._remove` rather than the `db_` prefix the rest of this
 * gateway uses, so they are the easiest to mistype into a command that does not
 * exist.
 */
describe('TrackerGateway', () => {
  let gateway: TrackerGateway;

  beforeEach(() => {
    (window as unknown as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__ = {};
    (invoke as jest.Mock).mockClear();
    TestBed.configureTestingModule({ providers: [TrackerGateway] });
    gateway = TestBed.inject(TrackerGateway);
  });

  afterEach(() => {
    delete (window as unknown as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__;
  });

  it('reads the rows with no arguments', async () => {
    await gateway.trackerRows();
    expect(invoke).toHaveBeenCalledWith('db_tracker_rows', undefined);
  });

  it('exports a report with content, format and file base', async () => {
    await gateway.exportReport('a,b', 'csv', 'tracker');
    expect(invoke).toHaveBeenCalledWith('export_report', {
      content: 'a,b',
      format: 'csv',
      fileBase: 'tracker',
    });
  });

  it('exports the WYSIWYG PDF by spreading its params, not by wrapping them', async () => {
    const params = { html: '<p></p>', fileBase: 'tracker' };
    await gateway.trackerReportExportPdfWysiwyg(params as never);
    expect(invoke).toHaveBeenCalledWith('tracker_report_export_pdf_wysiwyg', params);
  });

  it('archives and unarchives by application id', async () => {
    await gateway.setApplicationArchived(5, true);
    expect(invoke).toHaveBeenCalledWith('db_set_application_archived', { id: 5, archived: true });
    await gateway.setApplicationArchived(5, false);
    expect(invoke).toHaveBeenCalledWith('db_set_application_archived', { id: 5, archived: false });
  });

  it('uses the tracker_custom_column commands, which do not carry the db_ prefix', async () => {
    await gateway.trackerCustomColumns();
    expect(invoke).toHaveBeenCalledWith('tracker_custom_columns_list', undefined);
    await gateway.addTrackerCustomColumn('c1', 'Notes', 'text');
    expect(invoke).toHaveBeenCalledWith('tracker_custom_column_add', {
      id: 'c1',
      label: 'Notes',
      colType: 'text',
    });
    await gateway.removeTrackerCustomColumn('c1');
    expect(invoke).toHaveBeenCalledWith('tracker_custom_column_remove', { id: 'c1' });
  });

  it('sends seven distinct commands, one per method', async () => {
    await gateway.trackerRows();
    await gateway.exportReport('', 'csv', 'f');
    await gateway.trackerReportExportPdfWysiwyg({} as never);
    await gateway.setApplicationArchived(1, true);
    await gateway.trackerCustomColumns();
    await gateway.addTrackerCustomColumn('a', 'b', 'text');
    await gateway.removeTrackerCustomColumn('a');
    const commands = (invoke as jest.Mock).mock.calls.map((c) => c[0] as string);
    expect(new Set(commands).size).toBe(7);
  });
});
