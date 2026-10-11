import { announceClearFeed } from './announce-clear-feed';

describe('announceClearFeed', () => {
  const toast = { error: jest.fn(), success: jest.fn() };
  const clearDone = (removed: number) => `discover.clear_done:${removed}`;

  beforeEach(() => {
    toast.error.mockClear();
    toast.success.mockClear();
  });

  it('reports how many rows were removed', () => {
    announceClearFeed({ status: 'cleared', removed: 3 }, toast, clearDone);

    expect(toast.success).toHaveBeenCalledWith('discover.clear_done:3');
    expect(toast.error).not.toHaveBeenCalled();
  });

  it('reports a failure and stays quiet when nothing ran', () => {
    announceClearFeed({ status: 'failed', message: 'database is locked' }, toast, clearDone);
    announceClearFeed({ status: 'idle' }, toast, clearDone);

    expect(toast.error).toHaveBeenCalledTimes(1);
    expect(toast.error).toHaveBeenCalledWith('database is locked');
    expect(toast.success).not.toHaveBeenCalled();
  });
});
