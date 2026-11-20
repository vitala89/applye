import { afterNextRender, ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { TranslateService } from '@applye/i18n';
import { ChangelogService } from './changelog.service';
import { REPO, SOURCE_PUBLIC } from './site';
import { SourceLink } from './ui/source-link';

@Component({
  selector: 'app-changelog',
  standalone: true,
  imports: [SourceLink],
  providers: [ChangelogService],
  templateUrl: './changelog.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Changelog {
  protected readonly changelog = inject(ChangelogService);
  protected readonly copy = inject(TranslateService).tFor('en');

  constructor() {
    afterNextRender(() => {
      void this.changelog.loadRecent();
    });
  }

  protected notesHref(path: string): string {
    return SOURCE_PUBLIC ? `${REPO}${path}` : '/CHANGELOG.md';
  }

  protected onArchiveToggle(disclosure: HTMLDetailsElement): void {
    if (disclosure.open && this.changelog.archive().status === 'idle') {
      void this.changelog.loadArchive();
    }
  }
}
