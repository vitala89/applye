import { Component } from '@angular/core';
import { AUTHOR } from './site';
import { SourceLink } from './ui/source-link';

@Component({
  selector: 'app-press',
  standalone: true,
  imports: [SourceLink],
  templateUrl: './press.html',
})
export class Press {
  readonly author = AUTHOR;

  readonly facts = [
    { label: 'Name', value: 'Applye' },
    {
      label: 'What it is',
      value: 'Open-source, local-first desktop app for an AI-powered job search',
    },
    { label: 'Platforms', value: 'Windows, macOS, Linux (Tauri 2)' },
    { label: 'License', value: 'MIT, free, no paid tier' },
    { label: 'Privacy', value: 'No account, no telemetry, no cloud; data in local SQLite' },
    {
      label: 'AI model',
      value:
        'Bring your own: API keys (Anthropic Claude, OpenAI, Google Gemini, DeepSeek) or a local AI CLI bridge',
    },
    {
      label: 'Market focus',
      value: 'German/EU job search first (Eigenbemühungen, DE documents, Blue Card awareness)',
    },
    { label: 'Author', value: 'Vitalii Kasap, frontend engineer, Germany' },
    { label: 'Started', value: '2026, during the author’s own job search' },
  ];
}
