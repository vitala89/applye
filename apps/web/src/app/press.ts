import { ChangeDetectionStrategy, Component } from '@angular/core';
import { AUTHOR, CONTACT_EMAIL } from './site';
import { SourceLink } from './ui/source-link';

@Component({
  selector: 'app-press',
  standalone: true,
  imports: [SourceLink],
  templateUrl: './press.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Press {
  readonly author = AUTHOR;
  readonly contactEmail = CONTACT_EMAIL;

  readonly facts = [
    { label: 'Name', value: 'Applye' },
    {
      label: 'What it is',
      value:
        'Applye Desktop today: open-source, local-first job search. A Career Intelligence web platform is in development and not available yet',
    },
    { label: 'Platforms', value: 'Windows, macOS, Linux (Tauri 2)' },
    {
      label: 'License',
      value: 'Desktop core: MIT-licensed and free; optional hosted services may be paid',
    },
    {
      label: 'Privacy',
      value:
        'Desktop: local SQLite, no account required; web/hosted data uses an explicit separate boundary',
    },
    {
      label: 'AI model',
      value:
        'Bring your own: an API key (Anthropic Claude or DeepSeek) or a bridged CLI subscription (Claude Code or Codex)',
    },
    {
      label: 'Markets',
      value:
        'Works anywhere; handles market-specific paperwork where it exists (German Eigenbemühungen report, per-market CV conventions, visa and Blue Card awareness)',
    },
    { label: 'Author', value: 'Vitalii Kasap, frontend engineer, Germany' },
    { label: 'Started', value: '2026, during the author’s own job search' },
  ];
}
