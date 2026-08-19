import { ComponentFixture, TestBed } from '@angular/core/testing';
import { DocumentsGateway, JobsGateway, ProfileSettingsGateway, SystemGateway } from '@applye/data';
import { TranslateService } from '@applye/i18n';
import { BootGateStore } from '@applye/application';
import { FirstLaunchComponent, type FirstLaunchDismiss } from './first-launch.component';

/**
 * **Written before the file was split, deliberately.** The welcome screen had no
 * spec of any kind, and a split verified only by the tests written after it
 * describes the result rather than checking it. Every assertion here is against
 * the rendered DOM and the two gateway writes - what the screen puts on screen
 * and what it records - so the same assertions hold whether the template and
 * styles live inside the `.ts` or beside it.
 */
describe('FirstLaunchComponent', () => {
  let fixture: ComponentFixture<FirstLaunchComponent>;
  let updateSettings: jest.Mock;

  const el = (selector: string): HTMLElement | null =>
    fixture.nativeElement.querySelector(selector);
  const all = (selector: string): HTMLElement[] =>
    Array.from(fixture.nativeElement.querySelectorAll(selector));
  const text = (selector: string): string => (el(selector)?.textContent ?? '').trim();

  /** Resolves after the click handler's awaited `dismiss` has settled. */
  const settle = async (): Promise<void> => {
    await fixture.whenStable();
    fixture.detectChanges();
  };

  function mount(dismissFails = false): void {
    updateSettings = jest.fn(() =>
      dismissFails ? Promise.reject(new Error('disk full')) : Promise.resolve(),
    );
    // One stub object, several tokens - `SystemGateway` serves the shared
    // operations and `ProfileSettingsGateway` the settings row. The migration is
    // finished, so every token here names a domain gateway.
    const dbStub = {
      updateSettings,
      healthCheck: jest.fn(() => Promise.resolve({ items: [] })),
    };
    TestBed.configureTestingModule({
      imports: [FirstLaunchComponent],
      providers: [
        TranslateService,
        { provide: ProfileSettingsGateway, useValue: dbStub },
        { provide: JobsGateway, useValue: dbStub },
        { provide: DocumentsGateway, useValue: dbStub },
        { provide: SystemGateway, useValue: dbStub },
      ],
    });
    fixture = TestBed.createComponent(FirstLaunchComponent);
    fixture.detectChanges();
  }

  afterEach(() => TestBed.resetTestingModule());

  describe('the choreographed welcome', () => {
    beforeEach(() => mount());

    it('draws the logo lockup: mark, slash, bar, ripple and cursor', () => {
      expect(el('.welcome__logo')?.getAttribute('aria-label')).toBe('Applye');
      expect(el('.welcome__logo')?.getAttribute('role')).toBe('img');
      expect(el('svg.welcome__mark')).not.toBeNull();
      expect(el('polygon.welcome__slash')).not.toBeNull();
      expect(el('rect.welcome__bar')).not.toBeNull();
      expect(el('.welcome__ripple')).not.toBeNull();
      expect(el('svg.welcome__cursor')).not.toBeNull();
      expect(text('.welcome__wordmark')).toBe('applye');
    });

    it('hides every decorative part of the lockup from assistive technology', () => {
      for (const selector of ['.welcome__mark', '.welcome__ripple', '.welcome__cursor']) {
        expect(el(selector)?.getAttribute('aria-hidden')).toBe('true');
      }
      expect(el('.welcome__caret')?.getAttribute('aria-hidden')).toBe('true');
      expect(el('.welcome__divider')?.getAttribute('aria-hidden')).toBe('true');
    });

    it('greets with the translated title, caret, tagline and hint', () => {
      const t = TestBed.inject(TranslateService).t();
      expect(text('.welcome__title')).toContain(t('health.welcome_title'));
      expect(el('.welcome__title .welcome__caret')).not.toBeNull();
      expect(text('.welcome__tagline')).toBe(t('health.welcome_tagline'));
      expect(text('.welcome__hint')).toBe(t('health.recommend_onboarding'));
      expect(text('.welcome__check-label')).toBe(t('health.welcome_subtitle'));
    });

    it('offers exactly two actions, the tour first and skipping second', () => {
      const buttons = all('.welcome__actions button');
      const t = TestBed.inject(TranslateService).t();
      expect(buttons.length).toBe(2);
      expect(buttons[0].textContent?.trim()).toBe(t('health.cta_onboarding'));
      expect(buttons[1].textContent?.trim()).toBe(t('health.cta_skip'));
    });

    /** The health check is embedded without its own continue button: this screen
     *  owns the two ways forward, and a third would be a second exit. */
    it('embeds the health check panel with no continue button of its own', async () => {
      await settle();

      expect(el('.welcome__check app-health-check-panel .health-panel')).not.toBeNull();
      expect(el('app-health-check-panel .row')).not.toBeNull();
      expect(all('app-health-check-panel .row button').length).toBe(1);
      expect(el('app-health-check-panel .btn--primary')).toBeNull();
    });

    /** `prefers-reduced-motion` stands the whole sequence down through one
     *  `[data-anim]` selector, so a node that animates without the attribute
     *  would keep moving for a user who asked it not to. */
    it('marks every animated node with data-anim', () => {
      const animated = [
        '.welcome__mark',
        '.welcome__slash',
        '.welcome__bar',
        '.welcome__ripple',
        '.welcome__cursor',
        '.welcome__wordmark',
        '.welcome__title',
        '.welcome__caret',
        '.welcome__tagline',
        '.welcome__actions',
        '.welcome__hint',
        '.welcome__divider',
        '.welcome__check-label',
        '.welcome__check',
      ];
      for (const selector of animated) {
        expect(el(selector)?.hasAttribute('data-anim')).toBe(true);
      }
      expect(all('[data-anim]').length).toBe(animated.length);
    });
  });

  describe('dismissing it', () => {
    /** Collects what the screen handed back, in order. */
    function listen(): FirstLaunchDismiss[] {
      const seen: FirstLaunchDismiss[] = [];
      fixture.componentInstance.dismissed.subscribe((e) => seen.push(e));
      return seen;
    }

    it('starting the tour records only that the welcome was seen', async () => {
      mount();
      const seen = listen();

      all('.welcome__actions button')[0].click();
      await settle();

      expect(updateSettings).toHaveBeenCalledWith({ healthCheckSeen: true });
      expect(seen).toEqual([{ startOnboarding: true }]);
    });

    it('setting up alone also records onboarding as seen, so it never auto-opens', async () => {
      mount();
      const seen = listen();

      all('.welcome__actions button')[1].click();
      await settle();

      expect(updateSettings).toHaveBeenCalledWith({
        healthCheckSeen: true,
        onboardingSeen: true,
      });
      expect(seen).toEqual([{ startOnboarding: false }]);
    });

    /** Augmentation principle: a failed write informs, it never traps the user
     *  on this screen. */
    it('still lets the user through when the write fails', async () => {
      mount(true);
      const seen = listen();

      all('.welcome__actions button')[0].click();
      await settle();

      expect(fixture.debugElement.injector.get(BootGateStore).error()).not.toBe('');
      expect(seen).toEqual([{ startOnboarding: true }]);
    });
  });
});
