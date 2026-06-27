import { Component } from '@angular/core';

@Component({
  selector: 'app-root',
  standalone: true,
  template: `
    <main class="landing">
      <header class="landing__header">
        <span class="logo">Applye</span>
        <a class="gh-link" href="https://github.com/vkasap/applye" target="_blank" rel="noopener">
          GitHub →
        </a>
      </header>

      <section class="hero">
        <h1 class="hero__title">Your job search.<br>Your data. Your AI.</h1>
        <p class="hero__sub">
          A free, local-first desktop app for AI-powered job search.<br>
          Augmentation, not automation. No cloud. No subscriptions. MIT licensed.
        </p>
        <p class="hero__coming">
          <strong>Coming soon</strong> — follow on
          <a href="https://github.com/vkasap/applye" target="_blank" rel="noopener">GitHub</a>
          for updates.
        </p>
      </section>

      <section class="features">
        <div class="feature">
          <h3>Paste. Score. Apply.</h3>
          <p>Paste any job. Get a blunt recruiter-style score. Tailor your CV. Submit manually — always.</p>
        </div>
        <div class="feature">
          <h3>Local-first.</h3>
          <p>All data stays on your machine in a SQLite file. No account, no telemetry, no cloud sync.</p>
        </div>
        <div class="feature">
          <h3>Bring your own AI.</h3>
          <p>Use your Claude/Codex/Gemini CLI subscription or paste your own API key. You control the tokens.</p>
        </div>
      </section>
    </main>
  `,
  styleUrl: './app.scss',
})
export class App {}
