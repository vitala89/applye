import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  signal,
  TemplateRef,
  viewChild,
} from '@angular/core';
import { NgStyle } from '@angular/common';
import {
  formatLetterDate,
  stripSubjectLabel,
  type CoverLetterBlockKey,
  type CoverLetterContent,
  type CoverLetterStyle,
} from '@applye/core';
import { TranslateService } from '@applye/i18n';
import { PaginatedSheetComponent, type SheetAtom, type SheetGeometry } from '@applye/ui';
import {
  effectiveCoverLetterBlockStyle,
  effectiveCoverLetterParagraphStyle,
  resolvePageSettings,
} from '../cv-content.util';

/**
 * The cover letter's rendered page view — the single render shared by the
 * editor (`app-cover-letter-detail`) and the silent PDF export's print route
 * (`app-cover-letter-print`). Both consume this component, so the exported PDF
 * IS the editor's render and cannot drift from it. Mirrors `app-cv-preview`.
 *
 * Owns its own overflow warning; the parent does not mirror it.
 */
@Component({
  selector: 'app-cover-letter-preview',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [NgStyle, PaginatedSheetComponent],
  templateUrl: './cover-letter-preview.component.html',
  styleUrl: './cover-letter-preview.component.scss',
})
export class CoverLetterPreviewComponent {
  private readonly i18n = inject(TranslateService);
  protected readonly t = this.i18n.t;

  readonly content = input.required<CoverLetterContent>();
  readonly style = input.required<CoverLetterStyle>();
  /** The document's language, used only for German date conventions. Optional
   * so an embedder that has no language still renders. */
  readonly language = input<string>('en');

  /** px per mm at 96dpi — fixes the on-screen sheet to real page proportions. */
  private static readonly PX_PER_MM = 96 / 25.4;

  /** Preview page geometry (px) — real A4/Letter proportions plus margins,
   * consumed by `<lib-paginated-sheet>`, which owns pagination/measurement.
   * Mirrors `geometry` on `CvPreviewComponent`. */
  readonly geometry = computed<SheetGeometry>(() => {
    const r = resolvePageSettings(this.style().page);
    const px = CoverLetterPreviewComponent.PX_PER_MM;
    return {
      pageWidthPx: r.widthMm * px,
      pageHeightPx: r.heightMm * px,
      marginTopPx: r.margin.top * px,
      marginRightPx: r.margin.right * px,
      marginBottomPx: r.margin.bottom * px,
      marginLeftPx: r.margin.left * px,
    };
  });

  /** True when any single atom is taller than one usable page — set from
   * `<lib-paginated-sheet>`'s `(blockOverflow)` output. */
  protected readonly overflow = signal(false);

  protected onBlockOverflow(value: boolean): void {
    this.overflow.set(value);
  }

  // Atom templates for the paginated sheet — declared in the HTML.
  readonly addressTpl = viewChild.required<TemplateRef<unknown>>('addressTpl');
  readonly dateTpl = viewChild.required<TemplateRef<unknown>>('dateTpl');
  readonly subjectTpl = viewChild.required<TemplateRef<unknown>>('subjectTpl');
  readonly greetingTpl = viewChild.required<TemplateRef<unknown>>('greetingTpl');
  readonly bodyTpl = viewChild.required<TemplateRef<unknown>>('bodyTpl');
  readonly closingTpl = viewChild.required<TemplateRef<unknown>>('closingTpl');
  readonly signatureTpl = viewChild.required<TemplateRef<unknown>>('signatureTpl');
  readonly attachmentsTpl = viewChild.required<TemplateRef<unknown>>('attachmentsTpl');

  /** Flattens the letter's fixed block order into ordered page atoms for
   * `<lib-paginated-sheet>`. The letter has no section titles, so no atom
   * ever carries `glueToNext`. */
  readonly atoms = computed<SheetAtom[]>(() => {
    const c = this.content();
    const out: SheetAtom[] = [];
    out.push({ id: 'address', tpl: this.addressTpl(), ctx: { $implicit: c.address } });
    out.push({
      id: 'date',
      tpl: this.dateTpl(),
      ctx: { $implicit: formatLetterDate(c.date, this.language()) },
    });
    // DIN 5008 abolished the "Betreff:" label; the subject stands on its own.
    const subject = stripSubjectLabel(c.subject);
    if (subject) {
      out.push({ id: 'subject', tpl: this.subjectTpl(), ctx: { $implicit: subject } });
    }
    out.push({ id: 'greeting', tpl: this.greetingTpl(), ctx: { $implicit: c.greeting } });
    (c.bodyParagraphs || []).forEach((p, i) =>
      out.push({ id: `body:${i}`, tpl: this.bodyTpl(), ctx: { $implicit: p, index: i } }),
    );
    out.push({ id: 'closing', tpl: this.closingTpl(), ctx: { $implicit: c.closing } });
    out.push({ id: 'signature', tpl: this.signatureTpl(), ctx: { $implicit: c.signature } });
    const attachments = (c.attachments ?? '').trim();
    if (attachments) {
      out.push({
        id: 'attachments',
        tpl: this.attachmentsTpl(),
        ctx: { $implicit: attachments },
      });
    }
    return out;
  });

  /** `t()` has no interpolation support, so page captions substitute `{i}`/
   * `{n}` manually. */
  readonly captionFn = (page: number, total: number): string =>
    this.t()('documents.preview_page_of')
      .replace('{i}', String(page))
      .replace('{n}', String(total));

  /** Effective font/size/weight/colour for a block — its override merged over
   * the document-wide style. */
  effBlockStyle(key: CoverLetterBlockKey) {
    return effectiveCoverLetterBlockStyle(this.style(), key);
  }

  /** Bindable style object for a preview block's font/size/weight. */
  blockCss(key: CoverLetterBlockKey): Record<string, string> {
    return this.cssOf(this.effBlockStyle(key));
  }

  /** Effective style / bindable CSS for a single body paragraph (its
   * `body_<i>` override → `body` block → document-wide). */
  effParaStyle(index: number) {
    return effectiveCoverLetterParagraphStyle(this.style(), index);
  }

  paraCss(index: number): Record<string, string> {
    return this.cssOf(this.effParaStyle(index));
  }

  private cssOf(s: {
    fontFamily: string;
    fontSizePt: number;
    fontWeight: number;
  }): Record<string, string> {
    return {
      'font-family': s.fontFamily,
      'font-size': `${s.fontSizePt}pt`,
      'font-weight': String(s.fontWeight),
    };
  }
}
