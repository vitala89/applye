import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';

@Component({
  standalone: true,
  imports: [RouterLink],
  template: `
    <h1 class="docs__h1" id="data">Your data: where it lives and how to move it</h1>
    <p class="docs__lede">
      Local-first is only a real promise if you can find, copy, and destroy your data yourself. Here
      is exactly where it is.
    </p>

    <section class="docs__section">
      <h2 id="files" class="docs__h2">What is on disk</h2>
      <ul class="docs__list">
        <li>
          <strong>applye.db</strong> - one SQLite file holding your profile, jobs, applications,
          documents, and every cached AI result. It runs in WAL mode, so you may also see
          <code>applye.db-wal</code> and <code>applye.db-shm</code> next to it.
        </li>
        <li>
          <strong>API keys</strong> - never in the database. They live in your operating system's
          keychain / credential manager, under the app identifier <code>dev.applye.app</code>.
        </li>
        <li>
          <strong>Exported documents</strong> - wherever you chose to save them in the native
          dialog. Applye does not keep a second copy.
        </li>
      </ul>
      <p>The database sits in the standard per-user app-data directory for your OS:</p>
      <ul class="docs__list">
        <li><strong>macOS</strong> - <code>~/Library/Application Support/dev.applye.app/</code></li>
        <li><strong>Windows</strong> - <code>%APPDATA%\\dev.applye.app\\</code></li>
        <li>
          <strong>Linux</strong> - <code>~/.local/share/dev.applye.app/</code> (or your
          <code>$XDG_DATA_HOME</code> equivalent)
        </li>
      </ul>
    </section>

    <section class="docs__section">
      <h2 id="backup" class="docs__h2">Backing up and moving machines</h2>
      <ol class="docs__list docs__list--ol">
        <li>Quit Applye, so the write-ahead log is checkpointed cleanly.</li>
        <li>Copy the whole app-data folder, not just the <code>.db</code> file.</li>
        <li>
          On the new machine, install Applye, launch it once so the folder exists, quit, and put the
          copy in place.
        </li>
        <li>
          Re-enter your API key: keychain entries deliberately do not travel with a file copy.
        </li>
      </ol>
      <p>
        That folder is also the whole answer to "what does a backup tool need to include". Any
        ordinary encrypted-backup setup covers Applye by covering that directory.
      </p>
    </section>

    <section class="docs__section">
      <h2 id="delete" class="docs__h2">Deleting everything</h2>
      <p>
        Settings has a two-step <strong>Delete all data</strong> action: it wipes the local database
        and removes your keys from the keychain. Deleting your data here is deleting a file - there
        is no server copy to request, chase, or wait 30 days for. If you prefer, delete the app-data
        folder by hand; the result is identical.
      </p>
      <p>
        What Applye cannot delete is data your AI provider retained on their side. That is governed
        by their terms, which is one reason
        <a routerLink="/docs/ai">bringing your own AI</a> is a deliberate choice rather than a
        hidden default.
      </p>
    </section>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DataAndBackup {}
