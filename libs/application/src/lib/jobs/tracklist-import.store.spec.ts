import { TestBed } from '@angular/core/testing';
import type { ImportPreviewRow } from '@applye/core';
import {
  AiService,
  DocumentsGateway,
  JobsGateway,
  ProfileSettingsGateway,
  SystemGateway,
} from '@applye/data';
import { TracklistImportStore } from './tracklist-import.store';

const preview = (over: Partial<ImportPreviewRow> = {}): ImportPreviewRow =>
  ({
    company: 'Acme',
    role: 'Engineer',
    status: 'applied',
    isDuplicate: false,
    ...over,
  }) as ImportPreviewRow;

const AI_TEXT = JSON.stringify({
  normalized_rows: [
    {
      company: 'Acme',
      role: 'Engineer',
      status: 'applied',
      applied_at: null,
      notes: null,
      tech_stack: null,
      source_url: null,
      contact_name: null,
      contact_role: null,
      contact_channel: null,
      next_action: null,
      next_action_at: null,
      salary_range: null,
    },
  ],
  skipped: [{ row: 2, reason: 'no company' }],
  duplicates_expected: [],
});

function createStore(over: Record<string, jest.Mock> = {}) {
  const db = {
    importReadFile: jest.fn().mockResolvedValue({ fileType: 'csv', content: 'a,b' }),
    getSettings: jest.fn().mockResolvedValue({
      uiLanguage: 'en',
      aiMode: 'api',
      provider: 'openai',
      economyModel: 'small',
      followupDaysAfterApply: 5,
    }),
    importPreview: jest.fn().mockResolvedValue([preview(), preview({ isDuplicate: true })]),
    importConfirm: jest.fn().mockResolvedValue({ inserted: 1, skippedDuplicate: 1 }),
    ...over,
  };
  const ai = {
    renderSkill: jest.fn().mockResolvedValue({ systemPrompt: 's', userPrompt: 'u' }),
    run: jest.fn().mockResolvedValue({ text: AI_TEXT }),
    ...over,
  };
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      TracklistImportStore,
      { provide: ProfileSettingsGateway, useValue: db },
      { provide: JobsGateway, useValue: db },
      { provide: DocumentsGateway, useValue: db },
      { provide: SystemGateway, useValue: db },
      { provide: AiService, useValue: ai },
    ],
  });
  return { store: TestBed.inject(TracklistImportStore), db, ai };
}

describe('TracklistImportStore', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('opens on a clean slate so a previous run never shows under a new file', async () => {
    const { store } = createStore();
    await store.detect('/tmp/a.csv');
    expect(store.rows()).toHaveLength(2);

    store.start();

    expect(store.rows()).toEqual([]);
    expect(store.skipped()).toEqual([]);
    expect(store.step()).toBe('pick');
    expect(store.open()).toBe(true);
  });

  describe('detect', () => {
    /** Importing a row that already exists is the one outcome a click cannot
     * undo, so duplicates arrive unticked. */
    it('ticks new rows and leaves duplicates unticked', async () => {
      const { store } = createStore();

      expect(await store.detect('/tmp/a.csv')).toBe(true);
      expect(store.rows().map((r) => r.selected)).toEqual([true, false]);
      expect(store.selectedCount()).toBe(1);
      expect(store.step()).toBe('preview');
    });

    it('publishes the counts the page turns into a sentence', async () => {
      const { store } = createStore();
      await store.detect('/tmp/a.csv');

      expect(store.total()).toBe(3);
      expect(store.willAdd()).toBe(1);
      expect(store.duplicates()).toBe(1);
      expect(store.skipped()).toHaveLength(1);
    });

    it('sends the language from settings to the skill', async () => {
      const { store, ai } = createStore();
      await store.detect('/tmp/a.csv');

      expect(ai.renderSkill).toHaveBeenCalledWith(
        'import-tracklist',
        expect.objectContaining({ language: 'en', file_type: 'csv' }),
      );
    });

    it('records a failure and stays on the pick step', async () => {
      const { store } = createStore({
        importReadFile: jest.fn().mockRejectedValue(new Error('unreadable')),
      });

      expect(await store.detect('/tmp/a.csv')).toBe(false);
      expect(store.error()).toContain('unreadable');
      expect(store.step()).toBe('pick');
      expect(store.busy()).toBe(false);
    });

    /** Invalid model output is a failure of the run, not a crash of the flow. */
    it('reports invalid JSON from the model as a failure', async () => {
      const { store } = createStore({ run: jest.fn().mockResolvedValue({ text: 'not json' }) });

      expect(await store.detect('/tmp/a.csv')).toBe(false);
      expect(store.error()).toContain('AI returned invalid JSON');
    });
  });

  describe('confirm', () => {
    it('refuses silently when nothing is ticked', async () => {
      const { store, db } = createStore({
        importPreview: jest.fn().mockResolvedValue([preview({ isDuplicate: true })]),
      });
      await store.detect('/tmp/a.csv');

      expect(await store.confirm()).toBeNull();
      expect(db.importConfirm).not.toHaveBeenCalled();
      expect(store.error()).toBe('');
    });

    it('inserts only the ticked, non-duplicate rows and records the result', async () => {
      const { store, db } = createStore();
      await store.detect('/tmp/a.csv');

      expect(await store.confirm()).toBe(true);
      expect(db.importConfirm).toHaveBeenCalledWith(
        [expect.objectContaining({ company: 'Acme' })],
        'import_csv',
        5,
      );
      expect(store.result()).toEqual({ inserted: 1, skippedDuplicate: 1 });
      expect(store.step()).toBe('done');
    });

    it('falls back to a seven-day follow-up when settings carry none', async () => {
      const { store, db } = createStore({
        getSettings: jest.fn().mockResolvedValue({ uiLanguage: 'en', aiMode: 'api' }),
      });
      await store.detect('/tmp/a.csv');

      await store.confirm();

      expect(db.importConfirm).toHaveBeenCalledWith(expect.anything(), 'import_csv', 7);
    });

    it('records a failure and stays on the preview step', async () => {
      const { store } = createStore({
        importConfirm: jest.fn().mockRejectedValue(new Error('write failed')),
      });
      await store.detect('/tmp/a.csv');

      expect(await store.confirm()).toBe(false);
      expect(store.error()).toContain('write failed');
      expect(store.step()).toBe('preview');
      expect(store.result()).toBeNull();
    });
  });

  it('unticks a row without touching its neighbours', async () => {
    const { store } = createStore();
    await store.detect('/tmp/a.csv');

    store.setRowSelected(0, false);

    expect(store.rows().map((r) => r.selected)).toEqual([false, false]);
    expect(store.selectedCount()).toBe(0);
  });
});
