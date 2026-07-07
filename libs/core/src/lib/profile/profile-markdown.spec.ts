import {
  ProfileForm,
  EMPTY_FORM,
  parseProfileMd,
  serializeProfileForm,
  profileCompleteness,
  missingFields,
  parseScoringJson,
} from './profile-markdown';

const fullForm: ProfileForm = {
  name: 'Vitalii Kasap',
  title: 'Senior Frontend Engineer',
  location: 'Germany',
  experienceText: 'Led frontend for a 2M DAU platform.\nCut bundle size 40%.',
  skills: ['React', 'TypeScript', 'Angular'],
  education: 'BSc Computer Science',
  languages: ['English', 'German'],
  other: '',
};

describe('profile-markdown', () => {
  it('round-trips a full form through serialize→parse', () => {
    expect(parseProfileMd(serializeProfileForm(fullForm))).toEqual(fullForm);
  });

  it('returns EMPTY_FORM for empty input', () => {
    expect(parseProfileMd('')).toEqual(EMPTY_FORM);
    expect(parseProfileMd('   \n  ')).toEqual(EMPTY_FORM);
  });

  it('parses legacy freeform (name only, no headers) without losing text', () => {
    const form = parseProfileMd('Vitalii Kasap\nSenior Frontend Engineer · Germany');
    expect(form.name).toBe('Vitalii Kasap');
    expect(form.title).toBe('Senior Frontend Engineer');
    expect(form.location).toBe('Germany');
  });

  it('preserves unknown sections in other and re-appends on serialize', () => {
    const md = '# Jane\n\n## Skills\nGo\n\n## Awards\nBest dev 2025';
    const form = parseProfileMd(md);
    expect(form.skills).toEqual(['Go']);
    expect(form.other).toContain('## Awards');
    expect(serializeProfileForm(form)).toContain('## Awards');
    expect(serializeProfileForm(form)).toContain('Best dev 2025');
  });

  it('computes completeness from filled fields', () => {
    expect(profileCompleteness(EMPTY_FORM)).toBe(0);
    expect(profileCompleteness(fullForm)).toBe(100);
    const half = { ...EMPTY_FORM, title: 'Dev', location: 'EU', skills: ['Go'] };
    expect(profileCompleteness(half)).toBe(50);
  });

  it('lists missing field keys', () => {
    expect(missingFields(fullForm)).toEqual([]);
    expect(missingFields(EMPTY_FORM)).toEqual([
      'title',
      'location',
      'experience',
      'skills',
      'education',
      'languages',
    ]);
  });

  it('parses scoringJson wrapped in a ```json fence', () => {
    const raw = '```json\n{ "seniority": "senior", "skills": ["React"] }\n```';
    expect(parseScoringJson(raw)).toEqual({ seniority: 'senior', skills: ['React'] });
  });

  it('returns null for malformed or empty scoringJson', () => {
    expect(parseScoringJson('not json')).toBeNull();
    expect(parseScoringJson(null)).toBeNull();
    expect(parseScoringJson(undefined)).toBeNull();
  });
});
