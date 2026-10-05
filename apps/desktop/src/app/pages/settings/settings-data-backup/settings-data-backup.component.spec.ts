import { ComponentFixture, TestBed } from '@angular/core/testing';
import { DatabaseBackupStore, ToastService } from '@applye/application';
import { TranslateService } from '@applye/i18n';

import { SettingsDataBackupComponent } from './settings-data-backup.component';

describe('SettingsDataBackupComponent', () => {
  let fixture: ComponentFixture<SettingsDataBackupComponent>;
  let store: {
    backingUp: jest.Mock;
    restoring: jest.Mock;
    confirmOpen: jest.Mock;
    errorKey: jest.Mock;
    backup: jest.Mock;
    requestRestore: jest.Mock;
    cancelRestore: jest.Mock;
    confirmRestore: jest.Mock;
  };
  let toast: { success: jest.Mock; error: jest.Mock };

  function buttons(): HTMLButtonElement[] {
    return Array.from(fixture.nativeElement.querySelectorAll('button'));
  }

  beforeEach(() => {
    store = {
      backingUp: jest.fn().mockReturnValue(false),
      restoring: jest.fn().mockReturnValue(false),
      confirmOpen: jest.fn().mockReturnValue(false),
      errorKey: jest.fn().mockReturnValue(null),
      backup: jest.fn().mockResolvedValue(true),
      requestRestore: jest.fn(),
      cancelRestore: jest.fn(),
      confirmRestore: jest.fn().mockResolvedValue(true),
    };
    toast = { success: jest.fn(), error: jest.fn() };
    TestBed.configureTestingModule({
      imports: [SettingsDataBackupComponent],
      providers: [
        TranslateService,
        { provide: DatabaseBackupStore, useValue: store },
        { provide: ToastService, useValue: toast },
      ],
    });
    fixture = TestBed.createComponent(SettingsDataBackupComponent);
    fixture.detectChanges();
  });

  it('shows backup and restore as ordinary actions, not danger-zone controls', () => {
    const labels = buttons().map((button) => button.textContent ?? '');
    expect(labels.some((label) => label.includes('Back up database'))).toBe(true);
    expect(labels.some((label) => label.includes('Restore database'))).toBe(true);
    for (const button of buttons()) {
      expect(button.classList.contains('btn--danger')).toBe(false);
      expect(button.classList.contains('btn--danger-solid')).toBe(false);
    }
    expect(fixture.nativeElement.querySelector('.confirm')).toBeNull();
    expect(fixture.nativeElement.textContent).toContain('operating-system keychain');
  });

  it('treats a cancelled save dialog as silence', async () => {
    await fixture.componentInstance.finishBackup(null);
    expect(store.backup).not.toHaveBeenCalled();
    expect(toast.error).not.toHaveBeenCalled();
    expect(toast.success).not.toHaveBeenCalled();
  });

  it('toasts success only after the backup command accepts the path', async () => {
    await fixture.componentInstance.finishBackup('/tmp/applye.sqlite');
    expect(store.backup).toHaveBeenCalledWith('/tmp/applye.sqlite');
    expect(toast.success).toHaveBeenCalledWith('settings.backup_created');
    expect(toast.error).not.toHaveBeenCalled();
  });

  it('toasts the store failure and does not claim success', async () => {
    store.backup.mockResolvedValue(false);
    store.errorKey.mockReturnValue('settings.backup_failed');
    await fixture.componentInstance.finishBackup('/tmp/applye.sqlite');
    expect(toast.error).toHaveBeenCalledWith('settings.backup_failed');
    expect(toast.success).not.toHaveBeenCalled();
  });

  it('opens confirm for a chosen file and ignores a cancelled picker', async () => {
    await fixture.componentInstance.finishRestore(null);
    expect(store.requestRestore).not.toHaveBeenCalled();

    await fixture.componentInstance.finishRestore('/tmp/backup.sqlite');
    expect(store.requestRestore).toHaveBeenCalledWith('/tmp/backup.sqlite');
    expect(store.confirmRestore).not.toHaveBeenCalled();
  });

  it('relaunches only after restore preparation succeeds', async () => {
    const relaunch = jest.spyOn(fixture.componentInstance, 'relaunch').mockResolvedValue(undefined);
    await fixture.componentInstance.confirmRestore();
    expect(store.confirmRestore).toHaveBeenCalled();
    expect(relaunch).toHaveBeenCalled();
    expect(toast.error).not.toHaveBeenCalled();
  });

  it('does not relaunch when preparation is rejected', async () => {
    store.confirmRestore.mockResolvedValue(false);
    store.errorKey.mockReturnValue('settings.restore_corrupt');
    const relaunch = jest.spyOn(fixture.componentInstance, 'relaunch');
    await fixture.componentInstance.confirmRestore();
    expect(relaunch).not.toHaveBeenCalled();
    expect(toast.error).toHaveBeenCalledWith('settings.restore_corrupt');
  });
});
