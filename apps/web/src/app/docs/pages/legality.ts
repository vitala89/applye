import { ChangeDetectionStrategy, Component } from '@angular/core';

@Component({
  standalone: true,
  template: `
    <h1 class="docs__h1" id="legality">Source legality</h1>
    <p class="docs__lede">Applye is a tool you point at jobs you are already looking at.</p>
    <section class="docs__section">
      <h2 id="how" class="docs__h2">No scraping</h2>
      <p>
        It does not scrape closed job boards, bypass logins, or harvest postings at scale. Discover
        reads machine-readable sources that are published for exactly this purpose - public JSON
        APIs such as Greenhouse, Lever and Ashby, plus RSS feeds and the built-in remote boards -
        never HTML scraped out from behind a login. So there is no terms-of-service violation and no
        anti-bot risk. Anything those sources do not cover, you paste in yourself.
      </p>
    </section>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Legality {}
