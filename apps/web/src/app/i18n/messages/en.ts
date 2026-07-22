import { Messages } from '../messages';

/** English is the source of truth; every other locale translates from here. */
export const en: Messages = {
  meta: {
    title: 'Applye: Drafting is automated. Submitting is not.',
    description:
      'A free, open-source, local-first desktop app for an AI-powered job search. Blunt recruiter checks, tailored CVs, a pipeline kanban. Your data, your machine, your AI.',
  },

  nav: {
    methodology: 'Methodology',
    docs: 'Docs',
    changelog: 'Changelog',
    blog: 'Blog',
    viewSource: 'View source',
    sourceSoon: 'Source: soon',
    language: 'Language',
    themeToLight: 'Switch to light theme',
    themeToDark: 'Switch to dark theme',
  },

  footer: {
    tagline: 'Drafting is automated. Submitting is not.',
    docs: 'Docs',
    manifesto: 'Manifesto',
    methodology: 'Methodology',
    compare: 'Compare',
    blog: 'Blog',
    changelog: 'Changelog',
    press: 'Press',
    privacy: 'Privacy',
    cookies: 'Cookies',
    sustain: 'Sustain',
    licence: 'MIT licensed',
    builtBy: 'Built by',
  },

  consent: {
    body: 'We would like to count anonymous page views to see which docs are worth writing. No cookies and no requests to Google happen unless you allow it, and the app itself never sends anything either way.',
    learnMore: 'What is collected',
    decline: 'Decline',
    allow: 'Allow analytics',
  },

  docsInEnglishNote:
    'The app ships in six languages. The documentation is currently English only - translating it properly takes time, and a machine-translated manual would be worse than an honest link.',

  hero: {
    eyebrow: 'The augmentation principle',
    titleTop: 'Drafting is automated.',
    titleAccent: 'Submitting is not.',
    sub: 'An open-source, local-first desktop app for an AI-powered job search. Your data, your machine, your AI. It scores roles, tailors your CV, and tracks the pipeline, then hands every decision back to you.',
    download: 'Download',
    downloadSoon: 'Download (coming soon)',
    viewSource: 'View source on GitHub',
    sourceSoon: 'Source: coming soon',
    meta: 'Free · MIT licensed · No account · No telemetry',
  },

  gap: {
    eyebrow: 'The gap we fill',
    title: 'Three tools, one missing one.',
    saasTitle: 'Cloud SaaS',
    saasBody:
      'Powerful, but paid by the month and your whole search lives on someone else’s servers. No German-market awareness.',
    cliTitle: 'CLI pipelines',
    cliBody:
      'Full pipeline, local-first, free, and excellent. But it is terminal-only, so it speaks to developers and no one else.',
    usTitle: 'Desktop, local, free',
    usBody:
      'The full pipeline as a desktop GUI: local-first, free, MIT, and aware of the German market. Setup in 3 minutes, not 15. No terminal required.',
    line: 'career-ops gives developers a CLI. Applye gives everyone a desktop.',
  },

  what: {
    eyebrow: 'What is Applye?',
    body: 'Applye is a desktop app that runs the whole job-search loop end to end, on your machine. You paste a job description; it gives you a blunt HR and ATS check; it drafts a tailored CV you review and export; you move the role across a pipeline kanban as it progresses; and it helps you prepare for the interview. It is local-first, you bring your own AI (a direct API key or the CLI subscription you already pay for) and it is MIT-licensed and free.',
  },

  features: {
    eyebrow: 'What it does',
    title: 'Built to give you signal, not encouragement.',
    items: [
      {
        title: 'Blunt recruiter check',
        example:
          'Paste a job and get an honest fit score, the keywords you are missing, the red flags a screener would catch, and a plain ATS pass/fail, the way a recruiter actually reads in the first ten seconds.',
        note: 'No encouragement. Just signal.',
        linkText: 'How the scoring works',
      },
      {
        title: 'Tailored CV in three passes',
        example:
          'An XYZ rewrite, then a dual critique that argues with itself, then a clean build exported as a PDF that survives ATS parsing. You read every line before it exists as a file.',
        note: 'Applye drafts. You review, export, and submit.',
      },
      {
        title: 'Pipeline as a kanban',
        example:
          'Drag each role from saved to applied to interview to offer. Stages are auto-dated and overdue applications wear a badge, so nothing quietly goes cold.',
        note: 'Your board, on your machine, not a vendor dashboard.',
      },
      {
        title: 'Bring your own AI',
        example:
          'Plug in a direct API key, or bridge the CLI subscription you already pay for: Claude Code, Codex, or Gemini. Code does the cheap, deterministic work; the model is only asked to judge.',
        note: 'Token-economical by design. A real search costs cents.',
      },
      {
        title: 'Local-first & private',
        example:
          'Everything lives in one SQLite file on your disk. No account to create, no cloud to sync to, no telemetry phoning home. Delete the file and it is gone.',
        note: 'No cloud, no account, no tracking. Ever.',
      },
    ],
  },

  german: {
    eyebrow: 'Built for the German market',
    title: 'Made for the search you are actually running.',
    intro:
      'The DACH job search has rules other tools ignore. Applye treats them as first-class, not a localisation afterthought.',
    points: [
      'Agentur für Arbeit: generate an Eigenbemühungen report of your documented efforts.',
      'German-language output: CVs, cover letters, and prep in DE when the role demands it.',
      'Visa and Blue-Card awareness: guidance that knows your situation matters.',
      'GDPR-aligned by design: because your data never leaves your machine in the first place.',
    ],
  },

  principles: [
    { label: 'Local-first', line: 'One SQLite file on your machine.' },
    { label: 'Privacy by design', line: 'Nothing is collected. No telemetry.' },
    { label: 'Free / MIT', line: 'Open source, free.' },
    { label: 'Bring your own AI', line: 'Your key or your CLI subscription.' },
    { label: 'Augment, not automate', line: 'AI drafts. You decide and submit.' },
  ],

  trust: {
    eyebrow: 'Open source & honest',
    title: 'Your data never leaves your machine.',
    body: 'Applye is MIT-licensed and developed in the open. Read the code, read the data guarantee, run it yourself.',
    repo: 'GitHub repository',
    repoSoon: 'Repository: coming soon',
    guarantee: 'Data sovereignty guarantee',
    useTitle: 'When to use Applye',
    usePoints: [
      'You want fewer, better-targeted applications.',
      'You care where your job-search data lives.',
      'You already pay for an AI subscription or have an API key.',
      'You are job-hunting in Germany or the wider EU.',
    ],
    notTitle: 'What Applye is not',
    notPoints: [
      'Not an auto-apply bot. It never submits for you.',
      'Not a job-board scraper. You paste roles you found.',
      'Not a cloud service: no account, no server, no sync.',
      'Not a way to fake experience. Honesty over inflation.',
    ],
  },

  faq: {
    eyebrow: 'FAQ',
    title: 'Straight answers.',
    items: [
      {
        q: 'How does the scoring work?',
        a: 'You paste a job description; code extracts the requirements and Applye asks your AI to read it the way a recruiter or ATS would: a fit score, the missing keywords, and the red flags. The same job is never scored twice: results are cached against a hash of the text, so you do not pay tokens to re-read it.',
      },
      {
        q: 'Is it really free?',
        a: 'Yes. Applye is MIT-licensed and free: there is no paid tier and no subscription. The only thing you might pay for is your own AI usage, and that is billed by your provider, not by us.',
      },
      {
        q: 'What AI do I need?',
        a: 'Either a direct API key, or a CLI subscription you already have (Claude Code, Codex, or Gemini CLI) bridged so it costs you zero extra API tokens. AI is opt-in: nothing calls a model until you ask it to.',
      },
      {
        q: 'Is my data private?',
        a: 'Completely. Your profile, jobs, and documents live in a local SQLite database on your machine. There is no cloud, no account, and no analytics. The app does not scrape job boards either; you paste in roles you are already looking at.',
      },
      {
        q: 'Does it auto-apply for me?',
        a: 'Never. This is the line the whole app is built around. Applye scores, drafts, and suggests, then hands control back to you. You read every word and you click submit yourself. A recruiter is a person, and the relationship is yours, not a bot’s.',
      },
      {
        q: 'Why is it built for the German market?',
        a: 'Because the DACH job search has rules other tools ignore: an Agentur für Arbeit Eigenbemühungen report, German-language output, visa and Blue-Card awareness, and GDPR-aligned data handling by default. Applye treats those as first-class, not an afterthought.',
      },
    ],
  },
};
