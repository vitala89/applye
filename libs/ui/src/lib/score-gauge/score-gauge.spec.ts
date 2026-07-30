import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ScoreGauge, ScoreGaugeSize } from './score-gauge';

describe('ScoreGauge', () => {
  let component: ScoreGauge;
  let fixture: ComponentFixture<ScoreGauge>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ScoreGauge],
    }).compileComponents();

    fixture = TestBed.createComponent(ScoreGauge);
    component = fixture.componentInstance;
  });

  /** Sets the score before the component's first effect run, which is the path
   * that snaps rather than animating (see `from` on the component: null means
   * snap on mount, tween only on later changes).
   *
   * The band and geometry assertions below are about threshold and sizing logic,
   * so they must not also depend on where a 700ms tween happens to be. An
   * earlier version of this spec set the score in `beforeEach` and then changed
   * it inside each test, which made every band assertion a race against the
   * animation - invisible only because zone.js patches `requestAnimationFrame`
   * in the test environment while both apps run zoneless. */
  async function mountWith(score: number, size?: ScoreGaugeSize): Promise<HTMLElement> {
    fixture.componentRef.setInput('score', score);
    if (size) fixture.componentRef.setInput('size', size);
    await fixture.whenStable();
    return fixture.nativeElement as HTMLElement;
  }

  /** Drives real animation frames until the gauge shows `expected`, so the tween
   * is observed rather than assumed. Bounded so a broken tween fails the test
   * instead of hanging the suite. */
  async function settleAt(el: HTMLElement, expected: string): Promise<void> {
    const number = (): string | undefined =>
      el.querySelector('.score-gauge__number')?.textContent?.trim();
    const deadline = Date.now() + 3_000;
    while (number() !== expected) {
      if (Date.now() > deadline) {
        throw new Error(`gauge stalled at ${number()} instead of reaching ${expected}`);
      }
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      fixture.detectChanges();
    }
  }

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('renders the score number', async () => {
    const el = await mountWith(82);
    expect(el.querySelector('.score-gauge__number')?.textContent?.trim()).toBe('82');
  });

  it('defaults to the large size (132px diameter)', async () => {
    const el = await mountWith(82);
    const root = el.querySelector('.score-gauge') as HTMLElement;
    expect(root.style.width).toBe('132px');
  });

  it('renders the small size when requested', async () => {
    const el = await mountWith(82, 'sm');
    const root = el.querySelector('.score-gauge') as HTMLElement;
    expect(root.style.width).toBe('76px');
  });

  it('bands the score correctly at the high threshold', async () => {
    const el = await mountWith(82);
    expect(el.querySelector('.score-gauge--high')).toBeTruthy();
  });

  it('bands a mid-range score as mid', async () => {
    const el = await mountWith(60);
    expect(el.querySelector('.score-gauge--mid')).toBeTruthy();
  });

  it('bands a low score as low', async () => {
    const el = await mountWith(15);
    expect(el.querySelector('.score-gauge--low')).toBeTruthy();
  });

  it('snaps on mount rather than counting up from zero', async () => {
    const el = await mountWith(82);
    // Without this, a gauge that always animated up from 0 would still satisfy
    // every assertion above once its tween happened to finish.
    expect(el.querySelector('.score-gauge__number')?.textContent?.trim()).toBe('82');
    expect(el.querySelector('.score-gauge--high')).toBeTruthy();
  });

  it('counts up to a later score change instead of snapping, and rebands as it goes', async () => {
    const el = await mountWith(82);

    fixture.componentRef.setInput('score', 20);
    fixture.detectChanges();

    // Still high: the gauge animates over 700ms, so the new band is not visible
    // on the frame the input changed. This is the behaviour production has, and
    // the assertion the old spec had backwards.
    expect(el.querySelector('.score-gauge--high')).toBeTruthy();
    expect(el.querySelector('.score-gauge--low')).toBeNull();

    await settleAt(el, '20');
    expect(el.querySelector('.score-gauge--low')).toBeTruthy();
  });
});
