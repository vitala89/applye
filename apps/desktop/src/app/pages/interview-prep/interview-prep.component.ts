import { ChangeDetectionStrategy, Component, inject, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { ListOrdered, MoreHorizontal, LucideAngularModule, Target, Trash2 } from 'lucide-angular';
import { InterviewPrepStore } from '@applye/application';
import { TranslateService } from '@applye/i18n';
import { ButtonDirective } from '@applye/ui';
import { ToastService } from '@applye/application';

// Interview Prep list: every application that has at least one stage,
// sorted soonest-upcoming first. CRUD home for stages - the Pipeline board
// and its quick-view only show a read-only summary and link here.
//
// The list, the row menu and the delete confirmation are `InterviewPrepStore`'s
// (ADR-0005, amendment twenty-nine). What stays here is what the store is not
// allowed to do: navigate, translate, and toast.
@Component({
  selector: 'app-interview-prep',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ButtonDirective, LucideAngularModule],
  providers: [InterviewPrepStore],
  templateUrl: './interview-prep.component.html',
  styleUrl: './interview-prep.component.scss',
})
export class InterviewPrepComponent implements OnInit {
  private readonly router = inject(Router);
  private readonly i18n = inject(TranslateService);
  private readonly toast = inject(ToastService);
  protected readonly t = this.i18n.t;
  protected readonly prep = inject(InterviewPrepStore);

  protected readonly icons = {
    menu: MoreHorizontal,
    timeline: ListOrdered,
    trash: Trash2,
    empty: Target,
  };

  async ngOnInit(): Promise<void> {
    if (!(await this.prep.load())) this.toast.error(this.prep.error());
  }

  open(applicationId: number): void {
    void this.router.navigate(['/interview-prep', applicationId]);
  }

  /** Same destination as clicking the row, reached from inside the row menu. */
  openFromMenu(applicationId: number, event: Event): void {
    event.stopPropagation();
    this.prep.closeMenus();
    this.open(applicationId);
  }

  toggleMenu(id: number, event: Event): void {
    event.stopPropagation();
    this.prep.toggleMenu(id);
  }

  askRemove(id: number, event: Event): void {
    event.stopPropagation();
    this.prep.askRemove(id);
  }

  /** Remove an application from Interview Prep = delete every stage it has.
   * The application/job itself stays in My Jobs and Pipeline. */
  async confirmRemove(): Promise<void> {
    if (await this.prep.confirmRemove()) {
      this.toast.success(this.t()('interview.removed'));
      return;
    }
    // Empty when the store refused rather than failed - nothing confirmed, or a
    // removal already running. Nothing to tell the user in that case.
    const message = this.prep.error();
    if (message) this.toast.error(message);
  }

  /** Presentation, and therefore the page's: the store keeps `nextAt` as the
   * stored ISO string and this turns it into something readable. */
  formatDate(iso?: string | null): string {
    if (!iso) return '·';
    return new Date(iso).toLocaleDateString('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  }
}
