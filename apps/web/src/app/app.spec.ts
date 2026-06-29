import { TestBed } from '@angular/core/testing';
import { App } from './app';

describe('App (landing)', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [App],
    }).compileComponents();
  });

  it('renders the augmentation hero line', async () => {
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    const text =
      (fixture.nativeElement as HTMLElement).querySelector('.hero__title')?.textContent ?? '';
    expect(text).toContain('Drafting is automated');
    expect(text).toContain('Submitting is not');
  });

  it('defaults to the dark theme', () => {
    const fixture = TestBed.createComponent(App);
    expect(fixture.componentInstance.theme()).toBe('dark');
  });

  it('toggles the theme', () => {
    const fixture = TestBed.createComponent(App);
    fixture.componentInstance.toggleTheme();
    expect(fixture.componentInstance.theme()).toBe('light');
  });
});
