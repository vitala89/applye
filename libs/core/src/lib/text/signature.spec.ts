import { sanitizeSignature } from './signature';

describe('sanitizeSignature', () => {
  it('keeps a plain name untouched', () => {
    expect(sanitizeSignature('Vitalii Kasap')).toBe('Vitalii Kasap');
  });

  it('strips a phone number appended inline', () => {
    expect(sanitizeSignature('Vitalii Kasap +38 097 000 00 00')).toBe('Vitalii Kasap');
  });

  it('strips a US-formatted phone', () => {
    expect(sanitizeSignature('Jane Doe (555) 010-0100')).toBe('Jane Doe');
  });

  it('strips an email appended inline', () => {
    expect(sanitizeSignature('Jane Doe · jane@doe.io')).toBe('Jane Doe');
  });

  it('strips a URL appended inline', () => {
    expect(sanitizeSignature('Jane Doe | https://jane.dev')).toBe('Jane Doe');
  });

  it('takes the name line when contact detail is on later lines', () => {
    expect(sanitizeSignature('Vitalii Kasap\n+38 097 000 00 00\njane@doe.io')).toBe(
      'Vitalii Kasap',
    );
  });

  it('handles empty / nullish input', () => {
    expect(sanitizeSignature('')).toBe('');
    expect(sanitizeSignature(null)).toBe('');
    expect(sanitizeSignature(undefined)).toBe('');
  });

  it('does not strip a name that contains no contact run', () => {
    expect(sanitizeSignature('José María O’Connor-Smith')).toBe('José María O’Connor-Smith');
  });
});

// The signature arrives from a model, which is uncontrolled input for this
// purpose, so the contact-detail regexes must be linear in its length. On a
// regression this hangs rather than fails, so the wall-clock bound is the guard.
describe('sanitizeSignature is linear on pathological input', () => {
  it('handles a long run of non-@ characters', () => {
    const name = 'a'.repeat(100_000);
    const started = Date.now();
    expect(sanitizeSignature(name)).toBe(name);
    expect(Date.now() - started).toBeLessThan(2_000);
  });

  it('still strips an email that follows a long run', () => {
    expect(sanitizeSignature(`${'a'.repeat(5_000)} jane@doe.io`)).toBe('a'.repeat(5_000));
  });
});
