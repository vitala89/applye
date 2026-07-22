/**
 * The translatable surface of the site: the shell (nav, footer, consent bar)
 * and the landing page. Everything else is English by design - see locales.ts.
 *
 * The interface is exhaustive on purpose: adding a string here breaks every
 * locale file until it is translated, which is the point. No silent fallback
 * to English inside a page, because a half-translated page reads as broken.
 */
export interface Messages {
  /** Page <title> and meta description for this locale's landing page. */
  meta: { title: string; description: string };

  nav: {
    methodology: string;
    docs: string;
    changelog: string;
    blog: string;
    viewSource: string;
    sourceSoon: string;
    language: string;
    themeToLight: string;
    themeToDark: string;
  };

  footer: {
    tagline: string;
    docs: string;
    manifesto: string;
    methodology: string;
    compare: string;
    blog: string;
    changelog: string;
    press: string;
    privacy: string;
    cookies: string;
    sustain: string;
    licence: string;
    builtBy: string;
  };

  consent: { body: string; learnMore: string; decline: string; allow: string };

  /** Shown on non-English landing pages, above the fold of the docs links. */
  docsInEnglishNote: string;

  hero: {
    eyebrow: string;
    titleTop: string;
    titleAccent: string;
    sub: string;
    download: string;
    downloadSoon: string;
    viewSource: string;
    sourceSoon: string;
    meta: string;
  };

  gap: {
    eyebrow: string;
    title: string;
    saasTitle: string;
    saasBody: string;
    cliTitle: string;
    cliBody: string;
    usTitle: string;
    usBody: string;
    line: string;
  };

  what: { eyebrow: string; body: string };

  features: {
    eyebrow: string;
    title: string;
    items: { title: string; example: string; note: string; linkText?: string }[];
  };

  /**
   * Local hiring rules. Deliberately not "the German market": the product is
   * global, and this section shows depth where a market has its own paperwork,
   * with Germany as the first and deepest example rather than the frame.
   */
  local: { eyebrow: string; title: string; intro: string; points: string[] };

  principles: { label: string; line: string }[];

  trust: {
    eyebrow: string;
    title: string;
    body: string;
    repo: string;
    repoSoon: string;
    guarantee: string;
    useTitle: string;
    usePoints: string[];
    notTitle: string;
    notPoints: string[];
  };

  faq: { eyebrow: string; title: string; items: { q: string; a: string }[] };
}
