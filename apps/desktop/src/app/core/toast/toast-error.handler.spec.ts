import { TestBed } from '@angular/core/testing';
import { TranslateService } from '@applye/i18n';
import { ToastErrorHandler } from './toast-error.handler';
import { ToastService } from '@applye/application';

describe('ToastErrorHandler', () => {
  let handler: ToastErrorHandler;
  let toast: ToastService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [ToastService, TranslateService, ToastErrorHandler],
    });
    handler = TestBed.inject(ToastErrorHandler);
    toast = TestBed.inject(ToastService);
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  it('shows an error toast and logs to console', () => {
    const spy = jest.spyOn(toast, 'error');
    handler.handleError(new Error('kaboom'));
    expect(spy).toHaveBeenCalledWith('kaboom');
    expect(console.error).toHaveBeenCalled();
  });

  it('handles non-Error throwables', () => {
    const spy = jest.spyOn(toast, 'error');
    handler.handleError('just a string');
    expect(spy).toHaveBeenCalledWith('just a string');
  });
});
