# Feature brief: local database backup and restore

- **Status**: in review
- **Owner**: System and Settings. This is supporting infrastructure, not a new business aggregate.
- **Privacy**: the backup is a copy of the local SQLite database. It stays on the machine the user picks.

## Problem

The desktop app is in daily use while features are tested. There was a WAL-consistent `VACUUM INTO`
command and no way to use it, and no way to put that copy back without risking the open database.

## What a backup contains

Included: rows stored in the local Applye database.

Not included:

- API keys in the operating-system keychain
- files the user already exported
- anything else on disk

A restore does not read, copy, clear, or replace keychain values. On the same computer those values
stay as they were.

## Behaviour

Backup opens the native save dialog and writes `applye-backup-YYYY-MM-DD-HHmm.sqlite` with
`VACUUM INTO`, so the copy includes committed WAL frames. The live `applye.db` file is not copied
directly.

Restore opens the native file picker, then asks for confirmation. The selected file is copied into
app data and checked before the live database is touched:

- regular file with a SQLite header
- `PRAGMA quick_check`
- Applye tables `_sqlx_migrations`, `settings`, and `profile`
- migration versions are a prefix of this build, with matching checksums

An older backup is accepted. After relaunch, the embedded migrations move it forward. A newer
version, a checksum mismatch, a corrupt file, or a non-Applye SQLite file is rejected and the
current database stays in place.

The checked copy is installed on the next process start, before the shared pool opens. The previous
database, including its `-wal` and `-shm` files, is held aside until the restored file opens. If
that open fails, the previous files are put back. The user's selected backup is not modified.
Temporary copies in app data are removed after a successful open.

Relaunch uses the existing process plugin. A webview reload is not a restore.

## Out of scope

Career Evidence, a new SQL migration, backup encryption, cloud upload, and any keychain export.
