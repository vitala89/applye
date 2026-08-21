/**
 * The contact line and the resolved page box - the two pieces of a CV that are
 * about the page rather than its content.
 *
 * Split out of `cv-content.util.ts` for the reason recorded there. Both are
 * pure: `buildContactLine` renders the reference-order single line, and
 * `resolvePageSettings` normalises a stored margin - new four-side object,
 * legacy preset string, or absent - into clamped millimetres plus the
 * resolution-independent percentages the preview pads with.
 */
import type { CvPersonalDetailsSection } from '../models/cv-content.model';
import type { PageMargins, PageSettings } from '../models/page-settings.model';

/** Reference-order single-line contact string: location · phone · email ·
 * website · linkedin, then optionally birthdate/marital. Empty fields drop out
 * with no dangling ` | `. */
export function buildContactLine(
  p: CvPersonalDetailsSection,
  opts: { includeBirthdate: boolean; includeMaritalStatus: boolean },
): string {
  return [
    p.address,
    p.phone,
    p.email,
    p.website,
    p.linkedin,
    opts.includeBirthdate ? p.birthDate : undefined,
    opts.includeMaritalStatus ? p.maritalStatus : undefined,
  ]
    .filter((v): v is string => !!v && v.trim().length > 0)
    .join(' | ');
}

/** Contact fields addressable as individual inline-edit leaves - the same
 * fields, same order, as `buildContactLine`. */
export type CvContactFieldKey =
  'address' | 'phone' | 'email' | 'website' | 'linkedin' | 'birthDate' | 'maritalStatus';

export interface CvContactFieldLeaf {
  field: CvContactFieldKey;
  value: string;
}

/** The contact fields that currently render in `buildContactLine`'s output,
 * as individually addressable leaves (same order). The five base fields
 * (address/phone/email/website/linkedin) only become a leaf once they already
 * carry a value - matching what's actually visible in the resting contact
 * line, since this task doesn't add an "add a new contact field" affordance.
 * `birthDate`/`maritalStatus` become a leaf whenever their toggle is on, value
 * or not - mirroring the sidebar editor, which shows the input as soon as the
 * toggle is enabled so the user can fill it in for the first time. */
export function visiblePersonalContactFields(
  p: CvPersonalDetailsSection,
  opts: { includeBirthdate: boolean; includeMaritalStatus: boolean },
): CvContactFieldLeaf[] {
  const hasText = (v: string | undefined): v is string => !!v && v.trim().length > 0;
  const out: CvContactFieldLeaf[] = [];
  if (hasText(p.address)) out.push({ field: 'address', value: p.address });
  if (hasText(p.phone)) out.push({ field: 'phone', value: p.phone });
  if (hasText(p.email)) out.push({ field: 'email', value: p.email });
  if (hasText(p.website)) out.push({ field: 'website', value: p.website });
  if (hasText(p.linkedin)) out.push({ field: 'linkedin', value: p.linkedin });
  if (opts.includeBirthdate) out.push({ field: 'birthDate', value: p.birthDate ?? '' });
  if (opts.includeMaritalStatus) {
    out.push({ field: 'maritalStatus', value: p.maritalStatus ?? '' });
  }
  return out;
}

export interface ResolvedPage {
  widthMm: number;
  heightMm: number;
  /** Clamped 4-side margins in mm. */
  margin: { top: number; right: number; bottom: number; left: number };
  /** Each side as a % of the relevant page dimension - resolution-independent
   * padding for the preview (top/bottom of height, left/right of width). */
  marginPct: { top: number; right: number; bottom: number; left: number };
}

const PRESET_MM: Record<string, number> = { narrow: 12.7, normal: 20, wide: 30 };
const clampMm = (v: number): number => Math.min(50, Math.max(0, Number.isFinite(v) ? v : 20));

/** Normalises the stored margin (new 4-side object, legacy preset string, or
 * absent) into clamped 4-side mm. */
function normalizeMargins(margin: unknown): {
  top: number;
  right: number;
  bottom: number;
  left: number;
} {
  if (typeof margin === 'string') {
    const mm = PRESET_MM[margin] ?? 20;
    return { top: mm, right: mm, bottom: mm, left: mm };
  }
  if (margin && typeof margin === 'object') {
    const m = margin as Partial<PageMargins>;
    return {
      top: clampMm(m.top ?? 20),
      right: clampMm(m.right ?? 20),
      bottom: clampMm(m.bottom ?? 20),
      left: clampMm(m.left ?? 20),
    };
  }
  return { top: 20, right: 20, bottom: 20, left: 20 };
}

/** Resolves `PageSettings` (new or legacy) to concrete mm + %. Single source of
 * truth for the preview; the Rust `resolve_page` mirrors these numbers for
 * DOCX export. */
/**
 * Points per CSS pixel in the print pipeline, measured from exported PDFs
 * rather than assumed.
 *
 * WKWebView writes every text-drawing matrix in an exported CV as
 * `0.8 0 0 -0.8 x y cm`. **The factor does not move when the page box does**:
 * two exports of the same document, one with 20mm margins and one with none,
 * carry `0.8000236` and `0.8008075` - a tenth of a percent apart, while the
 * printable box changed by 40mm in each direction. So it is a fixed CSS-px to
 * point mapping and not a shrink-to-fit, which is the distinction that decides
 * whether this can be fixed by a constant at all.
 */
export const PRINT_PT_PER_PX = 0.8;

/**
 * CSS pixels per millimetre, as the **print** pipeline counts them.
 *
 * `72 / 25.4` points per millimetre, divided by `PRINT_PT_PER_PX`: 3.5433, or
 * 90 CSS pixels to the inch. The previews used `96 / 25.4` - the display
 * convention, and the obvious choice - which models every page **6.67% larger
 * than the sheet it prints on**.
 *
 * That single ratio is `B4`. It made the measured column 642.5px wide where the
 * printable area is 602, so text wrapped differently in the export than in the
 * preview; and it packed 971.3px of content into a card where only 910.75px
 * could be printed, so the bottom of every card was **clipped away** - the
 * exported PDF was missing text, not merely mis-margined. Four earlier attempts
 * moved the margins between layers and none of them touched this, because the
 * margins were only ever the thing the eye noticed.
 *
 * **Measured on macOS**, which is the only platform with a print path today
 * (`macos_print_to_pdf` in `commands/print.rs`). A webview that maps pixels to
 * points differently would need this to become a per-platform value; the
 * comment above says how to measure it from an exported file.
 */
export const PRINT_PX_PER_MM = 72 / 25.4 / PRINT_PT_PER_PX;

export function resolvePageSettings(page: PageSettings | undefined): ResolvedPage {
  const size = page?.size === 'letter' ? 'letter' : 'a4';
  const [widthMm, heightMm] = size === 'letter' ? [215.9, 279.4] : [210, 297];
  const margin = normalizeMargins(page?.margin);
  return {
    widthMm,
    heightMm,
    margin,
    marginPct: {
      top: (margin.top / heightMm) * 100,
      bottom: (margin.bottom / heightMm) * 100,
      left: (margin.left / widthMm) * 100,
      right: (margin.right / widthMm) * 100,
    },
  };
}
