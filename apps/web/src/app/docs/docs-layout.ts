import { DOCUMENT, isPlatformBrowser } from '@angular/common';
import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  inject,
  PLATFORM_ID,
  signal,
} from '@angular/core';
import { NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { filter } from 'rxjs';
import { Icon, IconName } from '../ui/icon';
import { MediaLightbox } from '../ui/media-lightbox';

interface NavLeaf {
  text: string;
  to: string;
}
interface NavGroup {
  id: string;
  title: string;
  /** One per group, never per link: 25 icons in a sidebar is noise, 5 is a landmark. */
  icon: IconName;
  links: NavLeaf[];
}
interface TocItem {
  id: string;
  text: string;
  level: 2 | 3;
}

const NAV_STORAGE_KEY = 'applye-docs-nav';

@Component({
  selector: 'app-docs-layout',
  standalone: true,
  imports: [RouterOutlet, RouterLink, RouterLinkActive, Icon, MediaLightbox],
  templateUrl: './docs-layout.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DocsLayout {
  private readonly doc = inject(DOCUMENT);
  private readonly router = inject(Router);
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));
  private observer: IntersectionObserver | null = null;

  readonly groups: NavGroup[] = [
    {
      id: 'start',
      title: 'Quick start',
      icon: 'rocket',
      links: [
        { text: 'Overview', to: '/docs' },
        { text: 'Requirements', to: '/docs/requirements' },
        { text: 'Install & setup', to: '/docs/install' },
      ],
    },
    {
      id: 'guide',
      title: 'User guide',
      icon: 'book-open',
      links: [
        { text: 'First run & tour', to: '/docs/guide/tour' },
        { text: 'The Dashboard', to: '/docs/guide/dashboard' },
        { text: 'Set up your profile', to: '/docs/guide/profile' },
        { text: 'Add your first job', to: '/docs/guide/add-job' },
        { text: 'Score a role', to: '/docs/guide/score' },
        { text: 'Tailor & export PDF', to: '/docs/guide/tailor' },
        { text: 'Discover', to: '/docs/guide/discover' },
        { text: 'Documents library', to: '/docs/guide/documents' },
        { text: 'Pipeline & Tracker', to: '/docs/guide/track' },
        { text: 'Interviews & Analytics', to: '/docs/guide/insights' },
        { text: 'Settings & AI', to: '/docs/guide/settings' },
      ],
    },
    {
      id: 'concepts',
      title: 'Concepts',
      icon: 'lightbulb',
      links: [
        { text: 'The core flow', to: '/docs/flow' },
        { text: 'Code vs LLM judgement', to: '/docs/judgement' },
        { text: 'Bring your own AI', to: '/docs/ai' },
      ],
    },
    {
      id: 'guides',
      title: 'Guides',
      icon: 'compass',
      links: [
        { text: 'Reading the recruiter check', to: '/docs/scoring' },
        { text: 'Local markets', to: '/docs/local-markets' },
      ],
    },
    {
      id: 'reference',
      title: 'Reference',
      icon: 'book-marked',
      links: [
        { text: 'Privacy & transparency', to: '/docs/privacy' },
        { text: 'Your data & backup', to: '/docs/data' },
        { text: 'Troubleshooting & FAQ', to: '/docs/troubleshooting' },
        { text: 'Source legality', to: '/docs/legality' },
        { text: 'Status & roadmap', to: '/docs/status' },
        { text: 'Changelog', to: '/changelog' },
      ],
    },
  ];

  readonly collapsed = signal<Record<string, boolean>>(this.readCollapsed());
  readonly toc = signal<TocItem[]>([]);
  readonly activeId = signal<string>('');

  constructor() {
    // Rebuild the "On this page" TOC after each docs page renders.
    afterNextRender(() => this.rescan());
    this.router.events
      .pipe(filter((e) => e instanceof NavigationEnd))
      .subscribe(() => queueMicrotask(() => this.rescan()));
  }

  isCollapsed(id: string): boolean {
    return !!this.collapsed()[id];
  }

  toggleGroup(id: string): void {
    const next = { ...this.collapsed(), [id]: !this.collapsed()[id] };
    this.collapsed.set(next);
    try {
      this.doc.defaultView?.localStorage.setItem(NAV_STORAGE_KEY, JSON.stringify(next));
    } catch {
      // storage disabled; in-memory only.
    }
  }

  /** Called by router-outlet (activate) so the TOC follows route changes. */
  onActivate(): void {
    queueMicrotask(() => this.rescan());
  }

  /**
   * Jumps to a heading on the current page.
   *
   * Smooth scrolling lives here rather than in a global `scroll-behavior`,
   * because a global rule also animates the router's jump to the top of a new
   * page - which reads as the page sliding away under you. Within one page an
   * animation is the point: it shows the reader they moved rather than that
   * the content was replaced.
   */
  jumpTo(id: string, event: Event): void {
    const target = this.doc.getElementById(id);
    if (!target) return;

    event.preventDefault();
    const win = this.doc.defaultView;
    const reduced = win?.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const before = win?.scrollY ?? 0;

    target.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'start' });

    // Some engines accept `smooth` and then animate nothing, leaving the reader
    // where they were. Landing on the heading matters more than the animation,
    // so check shortly after and jump outright if nothing moved.
    if (!reduced) {
      win?.setTimeout(() => {
        if (Math.abs((win.scrollY ?? 0) - before) < 2) {
          target.scrollIntoView({ behavior: 'auto', block: 'start' });
        }
      }, 250);
    }

    this.activeId.set(id);
    // Keep the address bar in step so the heading stays linkable, without
    // pushing a history entry for every glance at the table of contents.
    this.doc.defaultView?.history.replaceState(null, '', `#${id}`);
  }

  private rescan(): void {
    if (!this.isBrowser) return;
    const center = this.doc.querySelector('.dx__center');
    const heads = center ? Array.from(center.querySelectorAll<HTMLElement>('h2[id], h3[id]')) : [];
    this.toc.set(
      heads.map((h) => ({
        id: h.id,
        text: h.textContent?.trim() ?? '',
        level: h.tagName === 'H3' ? 3 : 2,
      })),
    );
    this.activeId.set(heads[0]?.id ?? '');

    if (center) this.addZoomButtons(center);

    this.observer?.disconnect();
    this.observer = new IntersectionObserver(
      (entries) => {
        for (const e of entries) if (e.isIntersecting) this.activeId.set(e.target.id);
      },
      { rootMargin: '-15% 0px -75% 0px', threshold: 0 },
    );
    for (const h of heads) this.observer.observe(h);
  }

  /**
   * Gives every figure an explicit "enlarge" control.
   *
   * Clicking the picture itself already opens the lightbox, but that is
   * invisible to a keyboard and unannounced to a screen reader, and a video
   * that carries its own controls cannot use it at all - a click there is a
   * scrub. The button is added here rather than written into two dozen figure
   * templates, so a figure added later gets one without being told about it.
   */
  private addZoomButtons(center: Element): void {
    for (const figure of Array.from(center.querySelectorAll<HTMLElement>('.docs__media'))) {
      if (figure.querySelector('.docs__zoom')) continue;
      if (!figure.querySelector('img, video')) continue;

      const button = this.doc.createElement('button');
      button.type = 'button';
      button.className = 'docs__zoom';
      button.setAttribute('aria-label', 'Enlarge this figure');
      button.innerHTML =
        '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" ' +
        'stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
        '<path d="M15 3h6v6"/><path d="M9 21H3v-6"/><path d="M21 3l-7 7"/><path d="M3 21l7-7"/>' +
        '</svg>';
      figure.appendChild(button);
    }
  }

  private readCollapsed(): Record<string, boolean> {
    try {
      const raw = this.doc.defaultView?.localStorage.getItem(NAV_STORAGE_KEY);
      return raw ? JSON.parse(raw) : {};
    } catch {
      return {};
    }
  }
}
