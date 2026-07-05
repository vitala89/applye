import { ChangeDetectionStrategy, Component, inject, signal, OnInit } from '@angular/core';
import { FileText, LucideAngularModule } from 'lucide-angular';
import { ActivatedRoute } from '@angular/router';
import { TranslateService } from '@applye/i18n';
import { CvListComponent } from './cv-list/cv-list.component';
import { CoverLetterListComponent } from './cover-letter-list/cover-letter-list.component';

type DocumentsTab = 'cv' | 'cover_letter';

// Documents (ROADMAP §16): CV | Cover Letter tab switch.
@Component({
  selector: 'app-documents',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [LucideAngularModule, CvListComponent, CoverLetterListComponent],
  templateUrl: './documents.component.html',
  styleUrl: './documents.component.scss',
})
export class DocumentsComponent implements OnInit {
  private readonly i18n = inject(TranslateService);
  private readonly route = inject(ActivatedRoute);
  protected readonly t = this.i18n.t;

  protected readonly icons = { empty: FileText };

  readonly tab = signal<DocumentsTab>('cv');

  ngOnInit(): void {
    const tabParam = this.route.snapshot.queryParamMap.get('tab');
    if (tabParam === 'cover_letter' || tabParam === 'cover-letter') {
      this.tab.set('cover_letter');
    }
  }

  setTab(tab: DocumentsTab): void {
    this.tab.set(tab);
  }
}
