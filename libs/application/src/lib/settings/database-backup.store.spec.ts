import { TestBed } from '@angular/core/testing';
import { SystemGateway } from '@applye/data';

import { DatabaseBackupStore, suggestBackupFilename } from './database-backup.store';

describe('suggestBackupFilename', () => {
  it('uses a filesystem-safe local timestamp and the sqlite extension', () => {
    const name = suggestBackupFilename(new Date(2026, 9, 6, 7, 5));
    expect(name).toBe('applye-backup-2026-10-06-0705.sqlite');
  });
});

describe('DatabaseBackupStore', () => {
  let store: DatabaseBackupStore;
  let gateway: {
    backupDatabase: jest.Mock;
    prepareDatabaseRestore: jest.Mock;
    takeDatabaseRestoreNotice: jest.Mock;
  };

  beforeEach(() => {
    gateway = {
      backupDatabase: jest.fn().mockResolvedValue(undefined),
      prepareDatabaseRestore: jest.fn().mockResolvedValue(undefined),
      takeDatabaseRestoreNotice: jest.fn().mockResolvedValue(null),
    };
    TestBed.configureTestingModule({
      providers: [DatabaseBackupStore, { provide: SystemGateway, useValue: gateway }],
    });
    store = TestBed.inject(DatabaseBackupStore);
  });

  afterEach(() => TestBed.resetTestingModule());

  it('backs up through the backup command and clears a previous error', async () => {
    store.errorKey.set('settings.backup_failed');
    await expect(store.backup('/tmp/applye.sqlite')).resolves.toBe(true);
    expect(gateway.backupDatabase).toHaveBeenCalledWith('/tmp/applye.sqlite');
    expect(gateway.prepareDatabaseRestore).not.toHaveBeenCalled();
    expect(store.errorKey()).toBeNull();
    expect(store.backingUp()).toBe(false);
  });

  it('records a backup failure without throwing', async () => {
    gateway.backupDatabase.mockRejectedValue(new Error('backup_failed'));
    await expect(store.backup('/tmp/applye.sqlite')).resolves.toBe(false);
    expect(store.errorKey()).toBe('settings.backup_failed');
  });

  it('does not prepare a restore until the user confirms', async () => {
    store.requestRestore('/tmp/backup.sqlite');
    expect(store.confirmOpen()).toBe(true);
    expect(gateway.prepareDatabaseRestore).not.toHaveBeenCalled();

    store.cancelRestore();
    expect(store.confirmOpen()).toBe(false);
    await expect(store.confirmRestore()).resolves.toBe(false);
    expect(gateway.prepareDatabaseRestore).not.toHaveBeenCalled();
  });

  it('prepares a restore only through the restore command', async () => {
    store.requestRestore('/tmp/backup.sqlite');
    await expect(store.confirmRestore()).resolves.toBe(true);
    expect(gateway.prepareDatabaseRestore).toHaveBeenCalledWith('/tmp/backup.sqlite');
    expect(gateway.backupDatabase).not.toHaveBeenCalled();
    expect(store.confirmOpen()).toBe(false);
  });

  it('maps a rejected restore to a translation key and does not leave the confirm open', async () => {
    store.requestRestore('/tmp/notes.sqlite');
    gateway.prepareDatabaseRestore.mockRejectedValue('restore_newer');
    await expect(store.confirmRestore()).resolves.toBe(false);
    expect(store.errorKey()).toBe('settings.restore_newer');
    expect(store.confirmOpen()).toBe(false);
  });

  it('maps the startup notice and ignores an empty one', async () => {
    gateway.takeDatabaseRestoreNotice.mockResolvedValueOnce('restored');
    await expect(store.consumeNotice()).resolves.toBe('settings.restored');

    gateway.takeDatabaseRestoreNotice.mockResolvedValueOnce('failed:restore_corrupt');
    await expect(store.consumeNotice()).resolves.toBe('settings.restore_corrupt');

    gateway.takeDatabaseRestoreNotice.mockResolvedValueOnce(null);
    await expect(store.consumeNotice()).resolves.toBeNull();
  });
});
