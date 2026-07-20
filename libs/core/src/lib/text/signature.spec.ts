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
