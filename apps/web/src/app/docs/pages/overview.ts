import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';

const CAREER_OPS = 'https://career-ops.org';

/* ---------------------------------------------------------------- Overview */
@Component({
  standalone: true,
  imports: [RouterLink],
  template: `
    <h1 class="docs__h1" id="overview">Overview</h1>
    <p class="docs__lede">
      The honest version of how Applye works. What runs as plain code, where the AI is allowed to
      judge, what stays on your machine, and what is still a TODO. Written for people who want to
      know what a tool does before they run it.
    </p>
    <section class="docs__section">
      <h2 id="what" class="docs__h2">What Applye is</h2>
      <p>
        Applye is a free, open-source, local-first desktop app for an AI-powered job search in 2026.
        It is inspired by the methodology of
        <a href="${CAREER_OPS}" target="_blank" rel="noopener">career-ops.org</a> (a CLI), rebuilt
        as a graphical desktop app so the same pipeline is usable without a terminal. You paste a
        job, it gives a blunt recruiter and ATS check, drafts a tailored CV you review, and tracks
        the role across a kanban. The AI advises; you decide and submit.
      </p>
    </section>
    <section class="docs__section">
      <h2 id="next" class="docs__h2">Where to start</h2>
      <p>
        New here? Read <a routerLink="/docs/requirements">Requirements</a> and
        <a routerLink="/docs/install">Install</a>. Want the scoring internals? See the
        <a routerLink="/methodology">methodology</a>.
      </p>
    </section>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Overview {}
