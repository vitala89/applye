import type { CvContent, CvParsedContent, CvTemplate } from '@applye/core';

/**
 * Reading a CV skill's answer and laying it out against a template are pure
 * functions, but they live in `apps/desktop` (`cv-parse.util.ts` and
 * `cv-content.util.ts`), which this layer may not import. The page passes them
 * in - the same device `CoverLetterAiStore` uses for `cleanJsonText`, and for
 * the same reason (ADR-0005, amendment six).
 *
 * `cv-content.util.ts` is 630 lines against a 400 budget with 40 files touching
 * it, and was already split once because the size gate refused the merged
 * version. Moving it down whole is a job of its own, not a rider on a page
 * migration.
 */
export interface CvCodec {
  /** `parseCvSkillResponse` - throws on an answer that is not the shape asked for. */
  parse(text: string): CvParsedContent;
  /** `buildCvContent` - lays the parsed fields out in the template's section order. */
  buildContent(parsed: CvParsedContent, template: CvTemplate | null): CvContent;
}

/** Generating additionally re-reads the profile's stored scoring JSON, which
 * may carry the model's own formatting around it. */
export interface CvGenerateCodec extends CvCodec {
  /** `cleanJsonText` - strips code fences and prose from around a JSON body. */
  cleanScoring(text: string): string;
}
