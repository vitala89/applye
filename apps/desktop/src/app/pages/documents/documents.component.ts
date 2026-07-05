import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FileText, LucideAngularModule } from 'lucide-angular';
import { TranslateService } from '@applye/i18n';
import { CvListComponent } from './cv-list/cv-list.component';

type DocumentsTab = 'cv' | 'cover_letter';

// Documents (ROADMAP §16): CV | Cover Letter tab switch. The Cover Letter
// tab is a placeholder until 1c ships its split editor.
@Component({
  selector: 'app-documents',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [LucideAngularModule, CvListComponent],
  templateUrl: './documents.component.html',
  styleUrl: './documents.component.scss',
})
export class DocumentsComponent {
  private readonly i18n = inject(TranslateService);
  protected readonly t = this.i18n.t;

  protected readonly icons = { empty: FileText };

  readonly tab = signal<DocumentsTab>('cv');

  setTab(tab: DocumentsTab): void {
    this.tab.set(tab);
  }
}
