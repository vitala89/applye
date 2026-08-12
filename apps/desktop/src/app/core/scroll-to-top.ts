import { EffectRef, Signal, effect, untracked } from '@angular/core';

/**
 * Put the user back at the top of the scrolling container.
 *
 * This is the DOM half of `WizardNavService.requestScrollTop()`. It lives in
 * the app because the store may not touch the DOM (ADR-0005), and it is a
 * plain function rather than a service because it holds no state.
 */
export function scrollToTop(doc: Document): void {
  // Defer to the next frame so the step's new (shorter/taller) content has
  // rendered before we scroll - otherwise the container clamps against the
  // old scrollHeight and can land mid-page.
  const view = doc.defaultView;
  const doScroll = (): void => {
    const el = doc.querySelector('.content') ?? doc.scrollingElement ?? doc.documentElement;
    el?.scrollTo?.({ top: 0, behavior: 'smooth' });
  };
  if (view?.requestAnimationFrame) {
    view.requestAnimationFrame(doScroll);
  } else {
    doScroll();
  }
}

/**
 * Scroll whenever `tick` moves. The store counts the requests; this turns each
 * new count into one scroll.
 *
 * The starting value is read once, outside the effect, so mounting the page
 * does not scroll it - only a request raised after mount does.
 */
export function scrollOnTick(tick: Signal<number>, doc: Document): EffectRef {
  let prev = untracked(tick);
  return effect(() => {
    const next = tick();
    if (next === prev) return;
    prev = next;
    untracked(() => scrollToTop(doc));
  });
}
