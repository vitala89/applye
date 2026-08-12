import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { scrollOnTick, scrollToTop } from './scroll-to-top';

/** A Document stand-in that records what was scrolled, and how. */
function fakeDoc(opts: { content?: boolean; raf?: boolean } = {}) {
  const scrolled: string[] = [];
  const target = (name: string) => ({ scrollTo: () => scrolled.push(name) });
  const doc = {
    defaultView: opts.raf ? { requestAnimationFrame: (fn: () => void) => fn() } : null,
    querySelector: () => (opts.content === false ? null : target('.content')),
    scrollingElement: target('scrollingElement'),
    documentElement: target('documentElement'),
  } as unknown as Document;
  return { doc, scrolled };
}

describe('scrollToTop', () => {
  it('scrolls the page container when it is on screen', () => {
    const { doc, scrolled } = fakeDoc();

    scrollToTop(doc);

    expect(scrolled).toEqual(['.content']);
  });

  it('falls back to the scrolling element when there is no page container', () => {
    const { doc, scrolled } = fakeDoc({ content: false });

    scrollToTop(doc);

    expect(scrolled).toEqual(['scrollingElement']);
  });

  it('defers to the next frame when the view offers one', () => {
    const { doc, scrolled } = fakeDoc({ raf: true });

    scrollToTop(doc);

    expect(scrolled).toEqual(['.content']);
  });
});

describe('scrollOnTick', () => {
  it('does not scroll on mount, only on a request raised afterwards', () => {
    const { doc, scrolled } = fakeDoc();
    const tick = signal(3);

    TestBed.runInInjectionContext(() => scrollOnTick(tick, doc));
    TestBed.tick();

    expect(scrolled).toEqual([]);
  });

  it('scrolls once per request', () => {
    const { doc, scrolled } = fakeDoc();
    const tick = signal(0);

    TestBed.runInInjectionContext(() => scrollOnTick(tick, doc));
    TestBed.tick();

    tick.set(1);
    TestBed.tick();
    tick.set(2);
    TestBed.tick();

    expect(scrolled).toEqual(['.content', '.content']);
  });
});
