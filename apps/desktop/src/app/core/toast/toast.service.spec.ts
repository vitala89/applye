import { TestBed } from '@angular/core/testing';
import { TranslateService } from '@applye/i18n';
import { ToastService } from './toast.service';

describe('ToastService', () => {
  let svc: ToastService;

  beforeEach(() => {
    jest.useFakeTimers();
    TestBed.configureTestingModule({ providers: [ToastService, TranslateService] });
    svc = TestBed.inject(ToastService);
  });

  afterEach(() => {
    jest.clearAllTimers();
    jest.useRealTimers();
  });

  it('adds a toast and returns an id', () => {
    const id = svc.error('boom');
    expect(svc.toasts().length).toBe(1);
    expect(svc.toasts()[0]).toMatchObject({ id, kind: 'error', message: 'boom' });
  });

  it('passes an unknown key through as a raw string', () => {
    svc.error('TypeError: x is undefined');
    expect(svc.toasts()[0].message).toBe('TypeError: x is undefined');
  });

  it('resolves a known i18n key', () => {
    svc.success('nav.settings');
    expect(svc.toasts()[0].message).toBe('Settings');
  });

  it('auto-dismisses info after 4s and error after 7s', () => {
    svc.info('a');
    svc.error('b');
    jest.advanceTimersByTime(4000);
    expect(svc.toasts().map((t) => t.message)).toEqual(['b']);
    jest.advanceTimersByTime(3000);
    expect(svc.toasts().length).toBe(0);
  });

  it('pause stops the timer; resume restarts it', () => {
    const id = svc.info('a');
    jest.advanceTimersByTime(3000);
    svc.pause(id);
    jest.advanceTimersByTime(10000);
    expect(svc.toasts().length).toBe(1);
    svc.resume(id);
    jest.advanceTimersByTime(4000);
    expect(svc.toasts().length).toBe(0);
  });

  it('dedupes identical kind+message within 1s', () => {
    const a = svc.error('same');
    const b = svc.error('same');
    expect(a).toBe(b);
    expect(svc.toasts().length).toBe(1);
  });

  it('caps at 5 toasts, dropping the oldest', () => {
    for (let i = 0; i < 6; i++) svc.info(`m${i}`);
    const msgs = svc.toasts().map((t) => t.message);
    expect(msgs.length).toBe(5);
    expect(msgs).toEqual(['m1', 'm2', 'm3', 'm4', 'm5']);
  });

  it('dismiss removes a toast by id', () => {
    const id = svc.info('a');
    svc.dismiss(id);
    expect(svc.toasts().length).toBe(0);
  });
});
