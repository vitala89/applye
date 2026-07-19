import { Component, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { COMING_SOON, DATA_CONTRACT, RELEASES, REPO } from './site';

interface Feature {
  title: string;
  example: string;
  note: string;
  link?: { to: string; text: string };
}

interface Faq {
  q: string;
  a: string;
}

@Component({
  selector: 'app-landing',
  standalone: true,
  imports: [RouterLink],
  templateUrl: './landing.html',
})
export class Landing {
  readonly repo = REPO;
  readonly releases = RELEASES;
  readonly dataContract = DATA_CONTRACT;
  readonly comingSoon = COMING_SOON;

  readonly openFaq = signal<number | null>(0);

  readonly features: Feature[] = [
    {
      title: 'Blunt recruiter check',
      example:
        'Paste a job and get an honest fit score, the keywords you are missing, the red flags a screener would catch, and a plain ATS pass/fail, the way a recruiter actually reads in the first ten seconds.',
      note: 'No encouragement. Just signal.',
      link: { to: '/methodology', text: 'How the scoring works' },
    },
    {
      title: 'Tailored CV in three passes',
      example:
        'An XYZ rewrite, then a dual critique that argues with itself, then a clean build exported as a PDF that survives ATS parsing. You read every line before it exists as a file. Tailored applications get more replies, so the work goes into fit, not volume.',
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
  ];

  readonly principles = [
    { label: 'Local-first', line: 'One SQLite file on your machine.' },
    { label: 'Privacy by design', line: 'Nothing is collected. No telemetry.' },
    { label: 'Free / MIT', line: 'Open source, free.' },
    { label: 'Bring your own AI', line: 'Your key or your CLI subscription.' },
    { label: 'Augment, not automate', line: 'AI drafts. You decide and submit.' },
  ];

  readonly faqs: Faq[] = [
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
  ];

  toggleFaq(index: number): void {
    this.openFaq.set(this.openFaq() === index ? null : index);
  }
}
