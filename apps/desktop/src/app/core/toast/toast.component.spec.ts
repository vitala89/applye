import { TestBed } from '@angular/core/testing';
import { TranslateService } from '@applye/i18n';
import { Toast } from './toast.model';
import { ToastComponent } from './toast.component';
import { ToastService } from './toast.service';

function make(kind: Toast['kind']): Toast {
  return { id: 1, kind, message: 'hello', createdAt: 0 };
}

describe('ToastComponent', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ToastComponent],
      providers: [ToastService, TranslateService],
    }).compileComponents();
  });

  it('renders the message and role=alert for errors', () => {
    const f = TestBed.createComponent(ToastComponent);
    f.componentRef.setInput('toast', make('error'));
    f.detectChanges();
    const el: HTMLElement = f.nativeElement;
    expect(el.textContent).toContain('hello');
    expect(el.querySelector('[role="alert"]')).toBeTruthy();
  });

  it('uses role=status for non-error kinds', () => {
    const f = TestBed.createComponent(ToastComponent);
    f.componentRef.setInput('toast', make('success'));
    f.detectChanges();
    expect(f.nativeElement.querySelector('[role="status"]')).toBeTruthy();
  });

  it('dismisses on close click', () => {
    const svc = TestBed.inject(ToastService);
    const spy = jest.spyOn(svc, 'dismiss');
    const f = TestBed.createComponent(ToastComponent);
    f.componentRef.setInput('toast', make('info'));
    f.detectChanges();
    f.nativeElement.querySelector('button.toast__close').click();
    expect(spy).toHaveBeenCalledWith(1);
  });
});
