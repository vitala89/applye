import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { App } from './app';

describe('App (shell)', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [App],
      providers: [provideRouter([])],
    }).compileComponents();
  });

  it('renders the brand wordmark', async () => {
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    const text = (fixture.nativeElement as HTMLElement).querySelector('.brand')?.textContent ?? '';
    expect(text).toContain('applye');
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
