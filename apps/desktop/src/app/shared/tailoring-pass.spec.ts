import {
  TailorContext,
  baselineFor,
  buildPassResult,
  parseJsonArray,
  parsePassResult,
  resultMdForPass,
} from './tailoring-pass';

/**
 * The pure half of the tailoring pipeline, asserted without a database or an AI
 * client. `TailoringService`'s own suite reaches all of this through three
 * passes and a cache; these tests reach it directly, which is what makes the
 * failure modes distinguishable - an unparseable base CV and an unparseable
 * model reply are opposite decisions, and through the service they both surface
 * as "the run used the profile".
 */
describe('tailoring-pass', () => {
  function ctx(over: Partial<TailorContext> = {}): TailorContext {
    return {
      job: null,
      profile: { fullMd: 'the profile' } as never,
      settings: null,
      jdText: '',
      scoring: null,
      baseCvId: null,
      matchingCvs: [],
      ...over,
    };
  }

  const CV = {
    id: 4,
    contentJson: JSON.stringify({
      sections: [{ key: 'summary', visible: true, text: 'from the chosen CV' }],
    }),
  } as never;

  describe('parseJsonArray', () => {
    it('reads a stored list', () => {
      expect(parseJsonArray('["a","b"]')).toEqual(['a', 'b']);
    });

    it('treats undefined as an empty list', () => {
      expect(parseJsonArray(undefined)).toEqual([]);
    });

    it('never throws on a row that will not parse', () => {
      expect(parseJsonArray('{not json')).toEqual([]);
    });
  });

  describe('baselineFor', () => {
    it('uses the profile when no base CV is selected', () => {
      expect(baselineFor(ctx())).toBe('the profile');
    });

    it('uses the selected base CV when there is one', () => {
      expect(baselineFor(ctx({ baseCvId: 4, matchingCvs: [CV] }))).toContain('from the chosen CV');
    });

    it('falls back to the profile when the selected CV will not parse', () => {
      expect(
        baselineFor(
          ctx({ baseCvId: 4, matchingCvs: [{ id: 4, contentJson: '{not json' } as never] }),
        ),
      ).toBe('the profile');
    });

    it('falls back when the selected id matches nothing in the list', () => {
      expect(baselineFor(ctx({ baseCvId: 99, matchingCvs: [CV] }))).toBe('the profile');
    });

    it('yields an empty baseline rather than throwing when there is no profile', () => {
      expect(baselineFor(ctx({ profile: null }))).toBe('');
    });
  });

  describe('resultMdForPass', () => {
    const passes = [
      buildPassResult({
        pass: 1,
        resultMd: 'md-1',
        changesJson: '[]',
        gapsJson: '[]',
        inputHash: 'h1',
        fromCache: false,
        tokensIn: 0,
        tokensOut: 0,
      }),
    ];

    it('finds the pass by its number, not its position', () => {
      expect(resultMdForPass(passes, 1)).toBe('md-1');
    });

    it('answers with an empty string for a pass that has not run', () => {
      expect(resultMdForPass(passes, 2)).toBe('');
    });
  });

  describe('buildPassResult', () => {
    it('decodes both stored lists and carries the rest through', () => {
      const result = buildPassResult({
        pass: 2,
        resultMd: 'md-2',
        changesJson: '["changed"]',
        gapsJson: '["a gap"]',
        inputHash: 'h2',
        fromCache: true,
        tokensIn: 10,
        tokensOut: 5,
      });

      expect(result).toEqual({
        pass: 2,
        resultMd: 'md-2',
        changes: ['changed'],
        gaps: ['a gap'],
        inputHash: 'h2',
        fromCache: true,
        tokensIn: 10,
        tokensOut: 5,
      });
    });
  });

  describe('parsePassResult', () => {
    const body = JSON.stringify({ result_md: 'md', changes: ['c'], gaps: ['g'] });

    it('reads a plain JSON reply', () => {
      expect(parsePassResult(body, 1)).toEqual({ result_md: 'md', changes: ['c'], gaps: ['g'] });
    });

    it('strips the fence some models wrap the reply in', () => {
      expect(parsePassResult('```json\n' + body + '\n```', 1).result_md).toBe('md');
    });

    it('defaults the three fields rather than propagating undefined', () => {
      expect(parsePassResult('{}', 1)).toEqual({ result_md: '', changes: [], gaps: [] });
    });

    it('rejects a changes field that is not a list', () => {
      expect(
        parsePassResult(JSON.stringify({ result_md: 'md', changes: 'nope' }), 1).changes,
      ).toEqual([]);
    });

    it('throws with the pass number and a slice of what came back', () => {
      expect(() => parsePassResult('not json at all', 3)).toThrow(
        /Pass 3 returned invalid JSON: not json at all/,
      );
    });
  });
});
