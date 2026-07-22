import { Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ConsentService } from './analytics/consent.service';

/**
 * The full disclosure page behind the consent bar: what analytics collects,
 * what it does not, and a live control to change the decision.
 */
@Component({
  selector: 'app-cookies',
  standalone: true,
  imports: [RouterLink],
  template: `
    <div class="docs__page shell shell--narrow">
      <header class="docs__head">
        <p class="applye-eyebrow">Cookies &amp; analytics</p>
        <h1 class="docs__h1">What this website measures.</h1>
        <p class="docs__lede">
          The Applye app collects nothing, ever. This website is the one place where a single,
          optional measurement tool exists - and it stays switched off until you say otherwise.
        </p>
      </header>

      <div class="prose">
        <h2 class="docs__h2">Your current choice</h2>
        <p>
          @switch (consent.consent()) {
            @case ('granted') {
              Analytics is <strong>on</strong>. Anonymous page views are counted.
            }
            @case ('denied') {
              Analytics is <strong>off</strong>. Nothing is loaded and nothing is sent.
            }
            @default {
              You have not decided yet. Until you do, analytics is off.
            }
          }
        </p>
        <p class="cookies__controls">
          @if (consent.consent() !== 'granted') {
            <button type="button" class="btn btn--primary" (click)="consent.grant()">
              Allow analytics
            </button>
          }
          @if (consent.consent() !== 'denied') {
            <button type="button" class="btn btn--ghost" (click)="consent.deny()">
              Turn analytics off
            </button>
          }
          @if (consent.consent() !== 'unset') {
            <button type="button" class="btn btn--ghost" (click)="consent.revoke()">
              Reset and ask me again
            </button>
          }
        </p>

        <h2 class="docs__h2">Strictly necessary storage</h2>
        <p>
          Two values live in your browser's local storage, never in a cookie, and never leave your
          device:
        </p>
        <ul class="docs__list">
          <li><code>applye-theme</code> - whether you chose the dark or light site theme.</li>
          <li><code>applye-analytics-consent</code> - the choice you made on this page.</li>
        </ul>
        <p>
          These are not tracking. They exist so the site does not forget your preference on every
          visit, and they are readable only by this site.
        </p>

        <h2 class="docs__h2">Optional analytics</h2>
        <p>
          If, and only if, you allow it, the site loads Google Analytics 4. Before that moment no
          request is made to Google, no analytics cookie is written, and no identifier is created.
        </p>
        <p>What it records once enabled:</p>
        <ul class="docs__list">
          <li>Which page was viewed, and which page referred you.</li>
          <li>Approximate country, from a truncated IP address (IP anonymisation is forced on).</li>
          <li>Device class, browser, and language.</li>
          <li>A few named interactions: download clicks and the consent decision itself.</li>
        </ul>
        <p>What it never records:</p>
        <ul class="docs__list">
          <li>Your name, email, CV, profile, jobs, or anything you type into the app.</li>
          <li>
            Advertising signals. Google Signals and ad personalisation are both explicitly disabled,
            so this data is not used to build an advertising profile of you.
          </li>
          <li>Anything at all from the desktop app. It has no telemetry and never phones home.</li>
        </ul>

        <h2 class="docs__h2">Why measure anything at all</h2>
        <p>
          One person builds Applye. Knowing which docs pages are read and which are ignored decides
          what gets written next. That is the whole purpose - not growth dashboards, and certainly
          not selling anything. If that trade does not appeal to you, decline: the site works
          identically either way, and nothing is withheld.
        </p>

        <h2 class="docs__h2">Related</h2>
        <p>
          The app's own data guarantees are in <a routerLink="/privacy">Privacy</a>, with the
          technical detail in <a routerLink="/docs/privacy">the privacy docs</a>.
        </p>
      </div>
    </div>
  `,
})
export class Cookies {
  readonly consent = inject(ConsentService);
}
