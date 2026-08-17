import { ChangeDetectionStrategy, Component } from '@angular/core';

@Component({
  standalone: true,
  template: `
    <h1 class="docs__h1" id="judgement">Code vs LLM judgement</h1>
    <p class="docs__lede">
      The core rule: do not call AI where code suffices. Most of the pipeline is plain code at 0
      tokens; the model is invoked only where judgement is needed, and cached by input hash.
    </p>
    <section class="docs__section">
      <h2 id="split" class="docs__h2">What runs where</h2>
      <div class="docs__table" role="table" aria-label="Code vs AI">
        <div class="docs__trow docs__trow--head"><span>Task</span><span>Runs as</span></div>
        <div class="docs__trow">
          <span>Parse pasted job, dedupe</span><span class="zero">code · 0 tokens</span>
        </div>
        <div class="docs__trow">
          <span>Hard filter (location, visa, salary)</span><span class="zero">code · 0 tokens</span>
        </div>
        <div class="docs__trow">
          <span>Legitimacy tier (green / yellow / red)</span
          ><span class="zero">code · 0 tokens</span>
        </div>
        <div class="docs__trow">
          <span>First-pass ATS check (fonts, links, formatting)</span
          ><span class="zero">code · 0 tokens</span>
        </div>
        <div class="docs__trow">
          <span>Overdue follow-up badges, analytics</span><span class="zero">code · 0 tokens</span>
        </div>
        <div class="docs__trow">
          <span>Recruiter rubric score</span><span class="ai">AI · low</span>
        </div>
        <div class="docs__trow">
          <span>Tailoring, cover letter, pitch</span><span class="ai">AI · on demand</span>
        </div>
      </div>
    </section>
    <section class="docs__section">
      <h2 id="cache" class="docs__h2">Caching</h2>
      <p class="docs__quote">
        Search is code, not AI. Code collects; AI evaluates. "Auto-search jobs by prompt" is a
        costly myth.
      </p>
    </section>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Judgement {}
