import { jobHeaderTitle } from './job-identity';

describe('jobHeaderTitle', () => {
  const t = (key: string) => `[${key}]`;

  it('joins the company and title the posting gave', () => {
    expect(jobHeaderTitle('Elbrus', 'Backend Engineer', t)).toBe('Elbrus - Backend Engineer');
  });

  it('stands a placeholder in for a company the parser could not find', () => {
    expect(jobHeaderTitle(undefined, 'Backend Engineer', t)).toBe(
      '[jobs.company_unknown] - Backend Engineer',
    );
  });

  it('stands a placeholder in for a title the parser could not find', () => {
    expect(jobHeaderTitle('Elbrus', undefined, t)).toBe('Elbrus - [jobs.title_unknown]');
  });

  it('keeps both halves rather than collapsing when neither was found', () => {
    // Dropping the empty half would read as though the posting never had one,
    // and the header is where the user notices the parser came up empty.
    expect(jobHeaderTitle(undefined, undefined, t)).toBe(
      '[jobs.company_unknown] - [jobs.title_unknown]',
    );
  });

  it('treats an empty string as missing, not as a value', () => {
    expect(jobHeaderTitle('', '', t)).toBe('[jobs.company_unknown] - [jobs.title_unknown]');
  });
});
