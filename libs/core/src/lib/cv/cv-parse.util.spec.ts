import type { CvTemplate } from '../models/document.model';
import { buildCvContent } from './cv-content.util';
import {
  buildAdditionalInfoBlock,
  cleanJsonText,
  parseCoverLetterResponse,
  parseCvGapResponse,
  parseCvSkillResponse,
  parseDateAnswer,
  repairTruncatedJson,
} from './cv-parse.util';

describe('cleanJsonText', () => {
  it('extracts a fenced JSON object unchanged', () => {
    const text = '```json\n{"a": 1}\n```';
    expect(JSON.parse(cleanJsonText(text))).toEqual({ a: 1 });
  });

  it('extracts a fenced JSON array without swallowing the outer brackets', () => {
    const text = '```json\n[{"question": "Q1"}, {"question": "Q2"}]\n```';
    expect(JSON.parse(cleanJsonText(text))).toEqual([{ question: 'Q1' }, { question: 'Q2' }]);
  });

  it('extracts an unfenced array with surrounding prose stripped', () => {
    const text = 'Here you go:\n[{"a": 1}]\nEnjoy.';
    expect(JSON.parse(cleanJsonText(text))).toEqual([{ a: 1 }]);
  });

  it('strips whitespace on both sides of both fences', () => {
    const text = '```json   \n\n  {"a": 1}  \n\n   ```';
    expect(JSON.parse(cleanJsonText(text))).toEqual({ a: 1 });
  });

  it('stays fast on a long run of whitespace before the closing fence', () => {
    // The quadratic form of this function took seconds on input this shape.
    const text = `\`\`\`json\n{"a": 1}${' '.repeat(50_000)}\n\`\`\``;
    const started = performance.now();
    expect(JSON.parse(cleanJsonText(text))).toEqual({ a: 1 });
    expect(performance.now() - started).toBeLessThan(1_000);
  });
});

describe('parseDateAnswer', () => {
  const dash = String.fromCharCode(0x2013); // en dash, kept out of source per house rule

  it('splits a spaced hyphen range into start and end', () => {
    expect(parseDateAnswer('2019 - 2021')).toEqual({ startDate: '2019', endDate: '2021' });
  });

  it('treats a trailing "Present" as an open (empty) end date', () => {
    expect(parseDateAnswer('Jan 2021 - Present')).toEqual({ startDate: 'Jan 2021', endDate: '' });
    expect(parseDateAnswer('Jan 2021 - heute')).toEqual({ startDate: 'Jan 2021', endDate: '' });
  });

  it('handles "to"/"bis" separators', () => {
    expect(parseDateAnswer('March 2020 to July 2022')).toEqual({
      startDate: 'March 2020',
      endDate: 'July 2022',
    });
  });

  it('splits an en-dash range even without surrounding spaces', () => {
    expect(parseDateAnswer(`2019${dash}2021`)).toEqual({ startDate: '2019', endDate: '2021' });
  });

  it('keeps an internal hyphen (01-2021) intact when unspaced', () => {
    expect(parseDateAnswer('01-2021')).toEqual({ startDate: '01-2021', endDate: '' });
  });

  it('returns a lone start with an empty end', () => {
    expect(parseDateAnswer('2018')).toEqual({ startDate: '2018', endDate: '' });
  });

  it('returns two empty strings for a blank answer', () => {
    expect(parseDateAnswer('   ')).toEqual({ startDate: '', endDate: '' });
  });
});

describe('parseCvSkillResponse (enriched)', () => {
  it('fills missing new personal fields with null, not undefined', () => {
    const out = parseCvSkillResponse('{"personalDetails":{"fullName":"A"}}');
    expect(out.personalDetails.title).toBeNull();
    expect(out.personalDetails.website).toBeNull();
    expect(out.personalDetails.linkedin).toBeNull();
  });

  it('reads skillGroups from the model JSON', () => {
    const out = parseCvSkillResponse('{"skillGroups":[{"label":"Data","values":["SQL"]}]}');
    expect(out.skillGroups).toEqual([{ label: 'Data', values: ['SQL'] }]);
  });
});

describe('cv-generate-baseline output → content', () => {
  const sample = JSON.stringify({
    personalDetails: {
      fullName: 'Vitalii Kasap',
      title: 'Senior Frontend Software Engineer',
      email: 'v@icloud.com',
      phone: '+49 171 206 4899',
      address: 'Nuremberg, Germany',
      website: 'vitaliikasap.com',
      linkedin: 'linkedin.com/in/vitaliikasap',
    },
    summary: 'Senior FE engineer with 5+ years.',
    experience: [
      {
        company: 'Celonis',
        role: 'Senior FE Engineer',
        startDate: 'Jan 2026',
        endDate: 'Jun 2026',
        location: 'Munich',
        bullets: ['Cut bundle size by **25%**'],
      },
    ],
    education: [],
    skills: ['TypeScript', 'Angular'],
    skillGroups: [
      { label: 'Languages', values: ['TypeScript'] },
      { label: 'Frameworks', values: ['Angular'] },
    ],
    languages: [{ language: 'English', level: 'C1' }],
    lowConfidenceNotes: [],
  });

  it('parses and builds a full enriched CvContent', () => {
    const content = buildCvContent(
      parseCvSkillResponse(sample),
      null as unknown as CvTemplate | null,
    );
    const pd = content.sections.find((s) => s.key === 'personal_details') as unknown as Record<
      string,
      unknown
    >;
    const skills = content.sections.find((s) => s.key === 'skills') as {
      groups: { label: string }[];
    };
    expect(pd['title']).toBe('Senior Frontend Software Engineer');
    expect(pd['website']).toBe('vitaliikasap.com');
    expect(pd['linkedin']).toBe('linkedin.com/in/vitaliikasap');
    expect(skills.groups.map((g) => g.label)).toEqual(['Languages', 'Frameworks']);

    const parsedSample = parseCvSkillResponse(sample);
    expect(parsedSample.skills).toEqual(['TypeScript', 'Angular']);

    const experience = content.sections.find((s) => s.key === 'experience') as {
      entries: { bullets: string[] }[];
    };
    expect(experience.entries[0].bullets[0]).toContain('**25%**');
  });
});

describe('repairTruncatedJson', () => {
  it('returns already-valid JSON unchanged (parseable)', () => {
    const s = '{"a":1,"b":[2,3]}';
    expect(JSON.parse(repairTruncatedJson(s)!)).toEqual({ a: 1, b: [2, 3] });
  });
  it('recovers a value truncated mid-string', () => {
    const truncated = '{"fullName":"VITALII KASAP","summary":"Senior Frontend Engineer specializ';
    const repaired = repairTruncatedJson(truncated)!;
    const obj = JSON.parse(repaired);
    expect(obj.fullName).toBe('VITALII KASAP');
    expect(typeof obj.summary).toBe('string');
  });
  it('recovers a truncated array of objects', () => {
    const truncated = '{"experience":[{"company":"A","role":"Dev"},{"company":"B","role":"Le';
    const obj = JSON.parse(repairTruncatedJson(truncated)!);
    expect(obj.experience[0]).toEqual({ company: 'A', role: 'Dev' });
    expect(Array.isArray(obj.experience)).toBe(true);
  });
  it('returns null when there is no JSON object at all', () => {
    expect(repairTruncatedJson('totally not json')).toBeNull();
  });
  it('repairTruncatedJson keeps a colon inside a truncated string value', () => {
    // string value cut off mid-word after a colon - the ":" is inside the string, not a dangling separator
    const raw = '{"summary":"Led migration: scale';
    const repaired = repairTruncatedJson(raw);
    expect(repaired).not.toBeNull();
    const obj = JSON.parse(repaired as string);
    expect(obj.summary).toBe('Led migration: scale');
  });
  it('repairTruncatedJson keeps a trailing colon truncated inside a string value', () => {
    // truncation lands exactly on the ":" while still inside the open string -
    // the dangling-separator guard must not fire here, or the ":" is dropped
    const raw = '{"summary":"Led migration:';
    const repaired = repairTruncatedJson(raw);
    expect(repaired).not.toBeNull();
    const obj = JSON.parse(repaired as string);
    expect(obj.summary).toBe('Led migration:');
  });
});

describe('parseCvSkillResponse repair fallback', () => {
  it('recovers personalDetails from a truncated response', () => {
    const truncated =
      '{"personalDetails":{"fullName":"VITALII KASAP","email":null,"phone":"+49","address":"Nuremberg"},"summary":"Senior Frontend Software Engineer (7+ years) specializ';
    const out = parseCvSkillResponse(truncated);
    expect(out.personalDetails.fullName).toBe('VITALII KASAP');
    expect(out.personalDetails.address).toBe('Nuremberg');
  });

  /// The failure this must never take: returning an empty draft. The user
  /// cannot tell that apart from a model that found nothing in their CV, so
  /// they see a blank editor and no reason for it. Throwing is what lets the
  /// caller show what actually came back. Removing the throw entirely left
  /// every test green before this one existed.
  it('throws with the raw response rather than returning an empty draft', () => {
    expect(() => parseCvSkillResponse('the model apologised instead')).toThrow(
      /AI returned invalid JSON/,
    );
    expect(() => parseCvSkillResponse('')).toThrow(/AI returned invalid JSON/);
    try {
      parseCvSkillResponse('sorry, I cannot help with that');
      throw new Error('expected parseCvSkillResponse to throw');
    } catch (error) {
      expect((error as Error).message).toContain('sorry, I cannot help with that');
    }
  });

  /// `JSON.parse` succeeds on more than objects, and each of these used to
  /// become an empty draft instead of an error. The bare string is the one seen
  /// in practice: a model answering "I could not read this CV" in the JSON the
  /// prompt asked for.
  it('rejects valid JSON that is not a CV object', () => {
    expect(() => parseCvSkillResponse('"I could not read this CV"')).toThrow(
      /AI returned invalid JSON/,
    );
    expect(() => parseCvSkillResponse('null')).toThrow(/AI returned invalid JSON/);
    expect(() => parseCvSkillResponse('42')).toThrow(/AI returned invalid JSON/);
  });

  /// Not asserted here, and left as it is: a JSON *array* still gets through,
  /// because the repair pass recovers the first object inside it. That is the
  /// same recovery a truncated response relies on, so tightening it is a change
  /// to repair behaviour rather than to this guard.

  /// The empty object is deliberately still accepted: a CV with no recognised
  /// fields is a real answer, and the review step is what asks about it.
  it('still accepts an empty CV object', () => {
    expect(parseCvSkillResponse('{}').personalDetails.fullName).toBeNull();
  });
});

describe('cv-import output → content', () => {
  it('parses the enriched import shape into a full CvContent', () => {
    const sample = JSON.stringify({
      personalDetails: {
        fullName: 'VITALII KASAP',
        title: 'Senior Frontend Software Engineer',
        email: null,
        phone: '+49 171 206 4899',
        address: 'Nuremberg, Germany',
        website: 'vitaliikasap.com',
        linkedin: 'linkedin.com/in/vitaliikasap',
      },
      summary: 'Senior Frontend Engineer with 5+ years.',
      experience: [
        {
          company: 'Celonis',
          role: 'Senior FE Engineer',
          startDate: 'Jan 2026',
          endDate: 'Jun 2026',
          location: 'Munich',
          bullets: ['Led Performance Spectrum to GA'],
        },
      ],
      education: [],
      skills: ['TypeScript'],
      skillGroups: [{ label: 'Languages', values: ['TypeScript'] }],
      languages: [{ language: 'English', level: 'C1' }],
      lowConfidenceNotes: [],
    });
    const content = buildCvContent(
      parseCvSkillResponse(sample),
      null as unknown as CvTemplate | null,
    );
    const pd = content.sections.find((s) => s.key === 'personal_details') as unknown as Record<
      string,
      unknown
    >;
    expect(pd['fullName']).toBe('VITALII KASAP');
    expect(pd['website']).toBe('vitaliikasap.com');
    expect(pd['linkedin']).toBe('linkedin.com/in/vitaliikasap');
  });
});

describe('parseCvSkillResponse - content-only boundary', () => {
  it('strips unknown top-level keys (style/theme/fontFamily) from AI JSON', () => {
    const res = parseCvSkillResponse(
      JSON.stringify({
        summary: 'Hi',
        style: { fontFamily: 'Comic Sans', accentColorHex: '#ff0000' },
        theme: 2,
        themeId: 9,
        fontFamily: 'Arial',
      }),
    );
    expect(res.summary).toBe('Hi');
    expect(Object.keys(res).sort()).toEqual(
      [
        'education',
        'experience',
        'languages',
        'lowConfidenceNotes',
        'personalDetails',
        'skillGroups',
        'skills',
        'summary',
      ].sort(),
    );
    expect((res as unknown as Record<string, unknown>)['style']).toBeUndefined();
    expect((res as unknown as Record<string, unknown>)['theme']).toBeUndefined();
    expect((res as unknown as Record<string, unknown>)['themeId']).toBeUndefined();
    expect((res as unknown as Record<string, unknown>)['fontFamily']).toBeUndefined();
  });

  it('strips unknown keys nested inside personalDetails', () => {
    const res = parseCvSkillResponse(
      JSON.stringify({
        personalDetails: { fullName: 'Ada', fontFamily: 'Arial', accentColorHex: '#000' },
      }),
    );
    expect(res.personalDetails.fullName).toBe('Ada');
    expect(Object.keys(res.personalDetails).sort()).toEqual(
      [
        'address',
        'email',
        'firstName',
        'fullName',
        'lastName',
        'linkedin',
        'nameSplitConfident',
        'phone',
        'title',
        'website',
      ].sort(),
    );
    expect(
      (res.personalDetails as unknown as Record<string, unknown>)['fontFamily'],
    ).toBeUndefined();
    expect(
      (res.personalDetails as unknown as Record<string, unknown>)['accentColorHex'],
    ).toBeUndefined();
  });

  it('preserves all valid content fields unchanged', () => {
    const res = parseCvSkillResponse(
      JSON.stringify({
        personalDetails: { fullName: 'Ada', email: 'a@b.c' },
        summary: 'S',
        experience: [
          { company: 'X', role: 'Y', startDate: '2020', endDate: '2021', bullets: ['b'] },
        ],
        skills: ['ts'],
        languages: [{ language: 'EN', level: 'C2' }],
      }),
    );
    expect(res.personalDetails.fullName).toBe('Ada');
    expect(res.personalDetails.email).toBe('a@b.c');
    expect(res.personalDetails.title).toBeNull();
    expect(res.summary).toBe('S');
    expect(res.experience).toHaveLength(1);
    expect(res.skills).toEqual(['ts']);
    expect(res.languages).toEqual([{ language: 'EN', level: 'C2' }]);
  });

  it('contract: a rogue style key in AI JSON never reaches a saved CvContent', () => {
    const parsed = parseCvSkillResponse(
      JSON.stringify({ summary: 'S', style: { fontFamily: 'Comic Sans' }, accentColorHex: '#f00' }),
    );
    const content = buildCvContent(parsed, null);
    const serialized = JSON.stringify(content);
    expect(serialized).not.toContain('fontFamily');
    expect(serialized).not.toContain('accentColorHex');
    expect(serialized.toLowerCase()).not.toContain('comic sans');
  });
});

describe('parseCvGapResponse', () => {
  it('parses questions from valid JSON', () => {
    const raw = JSON.stringify({
      questions: [
        {
          id: 'q1',
          category: 'skill',
          question: 'Do you know Kubernetes?',
          hint: 'The job asks for it',
        },
        { id: 'q2', category: 'language', question: 'German level?', hint: null },
      ],
    });
    expect(parseCvGapResponse(raw)).toEqual([
      {
        id: 'q1',
        category: 'skill',
        question: 'Do you know Kubernetes?',
        hint: 'The job asks for it',
      },
      { id: 'q2', category: 'language', question: 'German level?', hint: null },
    ]);
  });

  it('returns [] on garbage (fail-open)', () => {
    expect(parseCvGapResponse('not json at all')).toEqual([]);
    expect(parseCvGapResponse('{"questions": "oops"}')).toEqual([]);
  });

  it('caps at 5 questions', () => {
    const q = (n: number) => ({ id: `q${n}`, category: 'other', question: `Q${n}`, hint: null });
    const raw = JSON.stringify({ questions: [q(1), q(2), q(3), q(4), q(5), q(6), q(7)] });
    expect(parseCvGapResponse(raw)).toHaveLength(5);
  });

  it('defaults a missing/unknown category to "other" and a missing hint to null', () => {
    const raw = JSON.stringify({ questions: [{ id: 'q1', question: 'X' }] });
    expect(parseCvGapResponse(raw)).toEqual([
      { id: 'q1', category: 'other', question: 'X', hint: null },
    ]);
  });
});

describe('buildAdditionalInfoBlock', () => {
  it('builds a markdown block from answered items', () => {
    const block = buildAdditionalInfoBlock([
      { id: 'q1', question: 'Kubernetes?', answer: '2 years in production' },
      { id: 'q2', question: 'German level?', answer: 'B2' },
    ]);
    expect(block).toBe(
      '## Additional information\n- Kubernetes?: 2 years in production\n- German level?: B2',
    );
  });

  it('drops empty/whitespace answers', () => {
    const block = buildAdditionalInfoBlock([
      { id: 'q1', question: 'Kubernetes?', answer: '  ' },
      { id: 'q2', question: 'German level?', answer: 'B2' },
    ]);
    expect(block).toBe('## Additional information\n- German level?: B2');
  });

  it('returns "" when nothing is answered', () => {
    expect(buildAdditionalInfoBlock([{ id: 'q1', question: 'X', answer: '' }])).toBe('');
    expect(buildAdditionalInfoBlock([])).toBe('');
  });
});

describe('parseCvSkillResponse name split', () => {
  it('keeps the split the AI supplied', () => {
    const cv = parseCvSkillResponse(
      JSON.stringify({
        personalDetails: {
          fullName: 'Anna Kowalska',
          firstName: 'Anna',
          lastName: 'Kowalska',
          nameSplitConfident: true,
        },
      }),
    );
    expect(cv.personalDetails.firstName).toBe('Anna');
    expect(cv.personalDetails.lastName).toBe('Kowalska');
    expect(cv.personalDetails.nameSplitConfident).toBe(true);
  });

  it('derives the split when the AI omitted it, and marks a clean two-token name confident', () => {
    const cv = parseCvSkillResponse(
      JSON.stringify({ personalDetails: { fullName: 'Anna Kowalska' } }),
    );
    expect(cv.personalDetails.firstName).toBe('Anna');
    expect(cv.personalDetails.lastName).toBe('Kowalska');
    expect(cv.personalDetails.nameSplitConfident).toBe(true);
  });

  it('derives an unconfident split for a three-token name', () => {
    const cv = parseCvSkillResponse(
      JSON.stringify({ personalDetails: { fullName: 'Anna Maria Kowalska' } }),
    );
    expect(cv.personalDetails.firstName).toBe('Anna Maria');
    expect(cv.personalDetails.lastName).toBe('Kowalska');
    expect(cv.personalDetails.nameSplitConfident).toBe(false);
  });

  it('reports a mononym as unconfident with no last name', () => {
    const cv = parseCvSkillResponse(JSON.stringify({ personalDetails: { fullName: 'Prince' } }));
    expect(cv.personalDetails.firstName).toBe('Prince');
    expect(cv.personalDetails.lastName).toBeNull();
    expect(cv.personalDetails.nameSplitConfident).toBe(false);
  });

  it('trusts an explicit false flag even when the name looks clean', () => {
    const cv = parseCvSkillResponse(
      JSON.stringify({
        personalDetails: {
          fullName: 'Kim Minjun',
          firstName: 'Minjun',
          lastName: 'Kim',
          nameSplitConfident: false,
        },
      }),
    );
    expect(cv.personalDetails.nameSplitConfident).toBe(false);
  });

  it('derives the split when the AI sent empty strings for the parts', () => {
    const cv = parseCvSkillResponse(
      JSON.stringify({
        personalDetails: {
          fullName: 'Anna Kowalska',
          firstName: '',
          lastName: '',
          nameSplitConfident: true,
        },
      }),
    );
    expect(cv.personalDetails.fullName).toBe('Anna Kowalska');
    expect(cv.personalDetails.firstName).toBe('Anna');
    expect(cv.personalDetails.lastName).toBe('Kowalska');
  });

  it('derives the split when the AI sent a non-string for a name part', () => {
    const cv = parseCvSkillResponse(
      JSON.stringify({
        personalDetails: { fullName: 'Anna Kowalska', firstName: 123, lastName: 'Kowalska' },
      }),
    );
    expect(cv.personalDetails.firstName).toBe('Anna');
    expect(cv.personalDetails.lastName).toBe('Kowalska');
  });

  it('derives the confidence flag when the AI sent a non-boolean for it', () => {
    const cv = parseCvSkillResponse(
      JSON.stringify({
        personalDetails: { fullName: 'Anna Maria Kowalska', nameSplitConfident: 'true' },
      }),
    );
    expect(cv.personalDetails.nameSplitConfident).toBe(false);
  });

  it('leaves every name field null when there is no name at all', () => {
    const cv = parseCvSkillResponse(JSON.stringify({ personalDetails: {} }));
    expect(cv.personalDetails.fullName).toBeNull();
    expect(cv.personalDetails.firstName).toBeNull();
    expect(cv.personalDetails.lastName).toBeNull();
    expect(cv.personalDetails.nameSplitConfident).toBe(false);
  });
});

describe('parseCoverLetterResponse', () => {
  it('reads a fenced answer into the letter fields', () => {
    const text = '```json\n{"greeting": "Dear Team", "bodyParagraphs": ["One", "Two"]}\n```';
    expect(parseCoverLetterResponse(text)).toEqual({
      greeting: 'Dear Team',
      bodyParagraphs: ['One', 'Two'],
    });
  });

  it('keeps a partial answer partial rather than filling the missing blocks', () => {
    const letter = parseCoverLetterResponse('{"closing": "Sincerely"}');
    expect(letter).toEqual({ closing: 'Sincerely' });
    expect(letter.greeting).toBeUndefined();
  });

  it('throws on an answer that is not JSON, carrying the raw text', () => {
    expect(() => parseCoverLetterResponse('I could not write that letter')).toThrow();
  });

  it('throws on a truncated answer rather than repairing it', () => {
    expect(() => parseCoverLetterResponse('{"greeting": "Dear Te')).toThrow();
  });

  it('rejects a JSON array instead of casting it into an empty letter', () => {
    expect(() => parseCoverLetterResponse('[{"greeting": "Dear Team"}]')).toThrow(/invalid JSON/);
  });

  it('rejects a bare scalar for the same reason', () => {
    expect(() => parseCoverLetterResponse('null')).toThrow(/invalid JSON/);
  });
});
