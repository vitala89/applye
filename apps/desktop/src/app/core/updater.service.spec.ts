import { TestBed } from '@angular/core/testing';
import {
  UPDATE_BACKEND,
  UpdaterService,
  UpdaterUnavailableError,
  type PendingUpdate,
  type UpdateBackend,
} from './updater.service';

/**
 * Every state the About block can render is reachable here, which is the point
 * of the backend seam: the previous updater called the Tauri plugin directly,
 * so the only thing a test could prove was that it did nothing in a browser.
 */
describe('UpdaterService', () => {
  let check: jest.Mock;
  let relaunch: jest.Mock;
  let install: jest.Mock;

  function make(backend: Partial<UpdateBackend> = {}): UpdaterService {
    TestBed.configureTestingModule({
      providers: [{ provide: UPDATE_BACKEND, useValue: { check, relaunch, ...backend } }],
    });
    return TestBed.inject(UpdaterService);
  }

  function pending(version = '0.30.0'): PendingUpdate {
    return { version, install };
  }

  beforeEach(() => {
    TestBed.resetTestingModule();
    install = jest.fn().mockResolvedValue(undefined);
    relaunch = jest.fn().mockResolvedValue(undefined);
    check = jest.fn().mockResolvedValue(null);
  });

  it('starts idle, before anything has been checked', () => {
    const svc = make();

    expect(svc.state()).toBe('idle');
    expect(svc.updateAvailable()).toBe(false);
  });

  it('reports the current build when the backend finds nothing', async () => {
    const svc = make();
    await svc.check();

    expect(svc.state()).toBe('current');
    expect(svc.newVersion()).toBeNull();
    expect(svc.updateAvailable()).toBe(false);
  });

  it('names the version on offer when one exists', async () => {
    check.mockResolvedValue(pending());
    const svc = make();
    await svc.check();

    expect(svc.state()).toBe('available');
    expect(svc.newVersion()).toBe('0.30.0');
    expect(svc.updateAvailable()).toBe(true);
  });

  // The failure this whole design exists for: a check that dies must say so,
  // because silence is indistinguishable from "you are up to date".
  it('surfaces the reason a check failed instead of reporting current', async () => {
    check.mockRejectedValue(new Error('network unreachable'));
    const svc = make();
    await svc.check();

    expect(svc.state()).toBe('error');
    expect(svc.error()).toContain('network unreachable');
  });

  it('is unavailable, not failed, outside the desktop app', async () => {
    check.mockRejectedValue(new UpdaterUnavailableError());
    const svc = make();
    await svc.check();

    expect(svc.state()).toBe('unavailable');
    expect(svc.error()).toBeNull();
  });

  it('installs the pending update and restarts into it', async () => {
    check.mockResolvedValue(pending());
    const svc = make();
    await svc.check();
    await svc.install();

    expect(install).toHaveBeenCalled();
    expect(relaunch).toHaveBeenCalled();
    expect(svc.state()).toBe('installing');
  });

  it('does nothing on install when no update was found', async () => {
    const svc = make();
    await svc.check();
    await svc.install();

    expect(install).not.toHaveBeenCalled();
    expect(relaunch).not.toHaveBeenCalled();
  });

  // A failed install must leave the offer standing, not strand the user in a
  // state with no button and no explanation.
  it('returns to available with the reason when the install fails', async () => {
    check.mockResolvedValue(pending());
    install.mockRejectedValue(new Error('disk full'));
    const svc = make();
    await svc.check();
    await svc.install();

    expect(svc.state()).toBe('available');
    expect(svc.error()).toContain('disk full');
    expect(relaunch).not.toHaveBeenCalled();
  });

  it('drops a second check while one is in flight', async () => {
    let release = (): void => undefined;
    check.mockImplementation(() => new Promise<null>((resolve) => (release = () => resolve(null))));
    const svc = make();

    const first = svc.check();
    await svc.check();
    expect(check).toHaveBeenCalledTimes(1);

    release();
    await first;
    expect(svc.state()).toBe('current');
  });
});
