import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { AnalyticsService } from './analytics.service';
import { ConsentService } from './consent.service';

const gaScripts = () => document.querySelectorAll('script[src*="googletagmanager"]').length;

describe('analytics consent gating', () => {
  beforeEach(() => {
    localStorage.clear();
    document.querySelectorAll('script[src*="googletagmanager"]').forEach((s) => s.remove());
    TestBed.configureTestingModule({ providers: [provideRouter([])] });
  });

  it('loads nothing before a decision is made', () => {
    TestBed.inject(AnalyticsService);
    expect(TestBed.inject(ConsentService).consent()).toBe('unset');
    expect(gaScripts()).toBe(0);
  });

  it('loads nothing when the visitor declines', () => {
    TestBed.inject(AnalyticsService);
    TestBed.inject(ConsentService).deny();
    TestBed.tick();
    expect(gaScripts()).toBe(0);
  });

  it('still loads nothing on consent while the measurement ID is a placeholder', () => {
    TestBed.inject(AnalyticsService);
    TestBed.inject(ConsentService).grant();
    TestBed.tick();
    // site.ts ships G-PLACEHOLDER; a junk property must never be contacted.
    expect(gaScripts()).toBe(0);
  });

  it('remembers the decision across service instances', () => {
    TestBed.inject(ConsentService).deny();
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ providers: [provideRouter([])] });
    expect(TestBed.inject(ConsentService).consent()).toBe('denied');
  });
});
