import { parseImportResponse, stripJsonFence, toRawRows } from './tracklist-import';

describe('stripJsonFence', () => {
  it('leaves bare JSON alone', () => {
    expect(stripJsonFence('{"a":1}')).toBe('{"a":1}');
  });

  /** Models wrap their answer often enough that treating it as malformed would
   * fail a response that is otherwise perfectly good. */
  it('strips a ```json fence', () => {
    expect(stripJsonFence('```json\n{"a":1}\n```')).toBe('{"a":1}');
  });

  it('strips an unlabelled fence', () => {
    expect(stripJsonFence('```\n{"a":1}\n```')).toBe('{"a":1}');
  });
});

describe('parseImportResponse', () => {
  it('parses a fenced response', () => {
    const parsed = parseImportResponse('```json\n{"normalized_rows":[],"skipped":[]}\n```');

    expect(parsed.normalized_rows).toEqual([]);
  });

  /**
   * The excerpt is the point: a parse failure with no sample of what came back
   * is unactionable, and the whole response can be thousands of tokens.
   */
  it('throws with a truncated excerpt of what came back', () => {
    const long = 'x'.repeat(500);

    expect(() => parseImportResponse(long)).toThrow(`AI returned invalid JSON: ${'x'.repeat(200)}`);
  });
});

describe('toRawRows', () => {
  it('maps the skill snake_case shape onto the gateway shape', () => {
    const rows = toRawRows({
      normalized_rows: [
        {
          company: 'Acme',
          role: 'Engineer',
          status: 'applied',
          applied_at: '2026-08-01',
          notes: null,
          tech_stack: 'TypeScript',
          source_url: 'https://example.test/1',
          contact_name: 'Sam',
          contact_role: 'Recruiter',
          contact_channel: 'email',
          next_action: 'follow up',
          next_action_at: '2026-08-08',
          salary_range: '80-90k',
        },
      ],
      skipped: [],
      duplicates_expected: [],
    });

    expect(rows).toEqual([
      {
        company: 'Acme',
        role: 'Engineer',
        status: 'applied',
        appliedAt: '2026-08-01',
        notes: null,
        techStack: 'TypeScript',
        sourceUrl: 'https://example.test/1',
        contactName: 'Sam',
        contactRole: 'Recruiter',
        contactChannel: 'email',
        nextAction: 'follow up',
        nextActionAt: '2026-08-08',
        salaryRange: '80-90k',
      },
    ]);
  });

  it('is empty for no rows', () => {
    expect(toRawRows({ normalized_rows: [], skipped: [], duplicates_expected: [] })).toEqual([]);
  });
});
