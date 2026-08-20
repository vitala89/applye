import { AiResponse } from '@applye/data';
import { parseCoverLetterFromResponse } from './cover-letter-response';

function response(text: string, stopReason?: string | null): AiResponse {
  return { text, tokensInput: 0, tokensOutput: 0, cachedTokens: 0, stopReason };
}

describe('parseCoverLetterFromResponse', () => {
  it('returns the letter the model sent', () => {
    const res = response('{"greeting":"Dear team","bodyParagraphs":["One."]}');

    expect(parseCoverLetterFromResponse(res)).toEqual({
      greeting: 'Dear team',
      bodyParagraphs: ['One.'],
    });
  });

  it('reads an answer the model wrapped in a fence', () => {
    const res = response('```json\n{"greeting":"Dear team"}\n```');

    expect(parseCoverLetterFromResponse(res)).toEqual({ greeting: 'Dear team' });
  });

  // The defect the raw cast allowed: a model answering "I could not do this"
  // in the JSON the prompt asked for became a letter with no fields, which the
  // user reads as a model that had nothing to say.
  it('refuses a bare string instead of casting it into an empty letter', () => {
    expect(() => parseCoverLetterFromResponse(response('"I cannot write this letter"'))).toThrow(
      /invalid JSON/,
    );
  });

  it('refuses an array', () => {
    expect(() => parseCoverLetterFromResponse(response('[{"greeting":"Dear team"}]'))).toThrow(
      /invalid JSON/,
    );
  });

  // `B11`'s core complaint: the message that reached the status line was
  // `Unexpected end of JSON input` and nothing else.
  it('carries the raw answer, so a cut-off reply is visible as one', () => {
    const truncated = '{"greeting":"Dear team","bodyParagraphs":["I have spent six years';

    expect(() => parseCoverLetterFromResponse(response(truncated))).toThrow(
      /I have spent six years/,
    );
  });

  it('names the provider limit when the provider said it hit one', () => {
    const res = response('{"greeting":"Dear team"', 'max_tokens');

    expect(() => parseCoverLetterFromResponse(res)).toThrow(/output token limit/);
    expect(() => parseCoverLetterFromResponse(res)).toThrow(/max_tokens/);
  });

  it('names the OpenAI-compatible spelling of the same thing', () => {
    expect(() => parseCoverLetterFromResponse(response('{"greeting":', 'length'))).toThrow(
      /output token limit/,
    );
  });

  // A clean stop with unreadable output is a different bug from a cut-off one,
  // and saying so is the whole point of surfacing the reason.
  it('says the answer was not cut short when the provider finished cleanly', () => {
    expect(() => parseCoverLetterFromResponse(response('not json at all', 'end_turn'))).toThrow(
      /not cut short/,
    );
  });

  // Every CLI-bridge answer is absent. Claiming a clean finish there would be a
  // statement the app cannot support.
  it('adds nothing when the provider reported no reason', () => {
    let message = '';
    try {
      parseCoverLetterFromResponse(response('not json at all'));
    } catch (e) {
      message = String(e);
    }

    expect(message).toContain('invalid JSON');
    expect(message).not.toContain('stop reason');
    expect(message).not.toContain('token limit');
  });

  // Truncation repair is the CV path's behaviour and deliberately not this
  // one's: a repaired letter would present its missing paragraphs as finished.
  it('does not salvage a truncated answer', () => {
    expect(() =>
      parseCoverLetterFromResponse(response('{"greeting":"Dear team","bodyParagraphs":["One.')),
    ).toThrow(/invalid JSON/);
  });
});
