import { TestBed } from '@angular/core/testing';
import { Landing } from './landing';

describe('Landing', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [Landing] }).compileComponents();
  });

  it('renders the augmentation hero line', async () => {
    const fixture = TestBed.createComponent(Landing);
    await fixture.whenStable();
    const text =
      (fixture.nativeElement as HTMLElement).querySelector('.hero__title')?.textContent ?? '';
    expect(text).toContain('Drafting is automated');
    expect(text).toContain('Submitting is not');
  });

  it('toggles a FAQ item', () => {
    const fixture = TestBed.createComponent(Landing);
    const c = fixture.componentInstance;
    c.toggleFaq(0);
    expect(c.openFaq()).toBeNull();
    c.toggleFaq(2);
    expect(c.openFaq()).toBe(2);
  });
});
