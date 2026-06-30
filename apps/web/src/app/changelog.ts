import { DOCUMENT, isPlatformBrowser } from '@angular/common';
import { afterNextRender, Component, inject, PLATFORM_ID, signal } from '@angular/core';
import { REPO } from './site';

interface Section {
  name: string;
  items: string[];
}
interface Release {
  heading: string;
  date: string | null;
  link: string | null;
  sections: Section[];
}

@Component({
  selector: 'app-changelog',
  standalone: true,
  templateUrl: './changelog.html',
})
export class Changelog {
  private readonly doc = inject(DOCUMENT);
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  readonly repo = REPO;
  readonly releasesUrl = `${REPO}/releases`;
  readonly releases = signal<Release[]>([]);
  readonly status = signal<'loading' | 'ready' | 'error'>('loading');

  constructor() {
    afterNextRender(() => this.load());
  }

  private async load(): Promise<void> {
    if (!this.isBrowser) return;
    try {
      const res = await fetch('CHANGELOG.md', { cache: 'no-cache' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      this.releases.set(this.parse(await res.text()));
      this.status.set('ready');
    } catch {
      this.status.set('error');
    }
  }

  /** Minimal parse of our Keep a Changelog subset. */
  private parse(md: string): Release[] {
    const releases: Release[] = [];
    let rel: Release | null = null;
    let sec: Section | null = null;

    for (const raw of md.split('\n')) {
      const line = raw.trimEnd();
      const rh = line.match(/^## \[(.+?)\](?:\s*-\s*(.+))?$/);
      if (rh) {
        rel = { heading: rh[1], date: rh[2] ?? null, link: null, sections: [] };
        sec = null;
        releases.push(rel);
        continue;
      }
      const sh = line.match(/^### (.+)$/);
      if (sh && rel) {
        sec = { name: sh[1], items: [] };
        rel.sections.push(sec);
        continue;
      }
      const li = line.match(/^- (.+)$/);
      if (li && sec) {
        sec.items.push(this.inline(li[1]));
        continue;
      }
      const ref = line.match(/^\[(.+?)\]:\s*(\S+)$/);
      if (ref) {
        const target = releases.find((r) => r.heading === ref[1]);
        if (target) target.link = ref[2];
      }
    }
    return releases;
  }

  /** Escape, then render the inline markdown we actually use. */
  private inline(s: string): string {
    let h = s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    h = h.replace(/`([^`]+)`/g, '<code>$1</code>');
    h = h.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    h = h.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
    return h;
  }
}
