import { openExportedPath, revealExportedPath } from './exported-file-actions';

const invoke = jest.fn(async () => undefined);
jest.mock('@tauri-apps/api/core', () => ({
  invoke: (...args: unknown[]) => invoke(...args),
}));

describe('exported file actions', () => {
  const internals = window as Window & { __TAURI_INTERNALS__?: unknown };

  beforeEach(() => {
    invoke.mockClear();
    internals.__TAURI_INTERNALS__ = {};
  });

  afterEach(() => {
    delete internals.__TAURI_INTERNALS__;
  });

  it('opens and reveals through the guarded shell commands', async () => {
    await openExportedPath('/tmp/cv.pdf');
    await revealExportedPath('/tmp/cv.pdf');

    expect(invoke).toHaveBeenNthCalledWith(1, 'open_file', { path: '/tmp/cv.pdf' });
    expect(invoke).toHaveBeenNthCalledWith(2, 'reveal_in_folder', { path: '/tmp/cv.pdf' });
  });
});
