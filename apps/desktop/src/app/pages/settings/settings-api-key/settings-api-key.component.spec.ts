import { ComponentFixture, TestBed } from '@angular/core/testing';
import { TranslateService } from '@applye/i18n';
import { SettingsApiKeyComponent } from './settings-api-key.component';

/**
 * The key field is the one control on this screen that handles a secret, so
 * what it renders is worth pinning: the field is empty whether or not a key is
 * stored, because the app cannot read one back out of the keychain.
 */
describe('SettingsApiKeyComponent', () => {
  let fixture: ComponentFixture<SettingsApiKeyComponent>;

  function input(): HTMLInputElement {
    return fixture.nativeElement.querySelector('input');
  }

  function buttons(): HTMLButtonElement[] {
    return Array.from(fixture.nativeElement.querySelectorAll('button'));
  }

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [SettingsApiKeyComponent],
      providers: [TranslateService],
    });
    fixture = TestBed.createComponent(SettingsApiKeyComponent);
    fixture.componentRef.setInput('provider', 'claude');
    fixture.detectChanges();
  });

  it('renders a masked field that is never prefilled', () => {
    fixture.componentRef.setInput('stored', true);
    fixture.detectChanges();

    expect(input().type).toBe('password');
    expect(input().value).toBe('');
    expect(input().getAttribute('autocomplete')).toBe('off');
  });

  it('offers only Save until a key is stored, then Replace and Remove', () => {
    expect(buttons().length).toBe(1);

    fixture.componentRef.setInput('stored', true);
    fixture.detectChanges();
    expect(buttons().length).toBe(2);
  });

  it('will not save an empty or whitespace-only key', () => {
    fixture.componentRef.setInput('draft', '   ');
    fixture.detectChanges();
    expect(buttons()[0].disabled).toBe(true);

    fixture.componentRef.setInput('draft', 'sk-ant-abc');
    fixture.detectChanges();
    expect(buttons()[0].disabled).toBe(false);
  });

  it('names the provider the key belongs to', () => {
    expect(fixture.nativeElement.querySelector('.cap').textContent).toContain('claude');
  });
});
