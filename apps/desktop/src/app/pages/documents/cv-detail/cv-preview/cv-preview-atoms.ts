import type { TemplateRef } from '@angular/core';
import type { CvSection, PhotoPlacement } from '@applye/core';
import { sectionLabelKey } from '@applye/core';
import type { SheetAtom } from '@applye/ui';

/** Everything the atom list is built from. Passed explicitly rather than read
 * off the component, which is what makes this testable without a fixture. */
export interface CvAtomContext {
  sections: readonly CvSection[];
  includePhoto: boolean;
  photoDataUri: string | null;
  photoPlacement: PhotoPlacement;
  t: (key: string) => string;
  tpl: {
    headerTpl: TemplateRef<unknown>;
    summaryTpl: TemplateRef<unknown>;
    sectionTitleTpl: TemplateRef<unknown>;
    skillsTpl: TemplateRef<unknown>;
    expHeadTpl: TemplateRef<unknown>;
    expBulletTpl: TemplateRef<unknown>;
    eduEntryTpl: TemplateRef<unknown>;
    languagesTpl: TemplateRef<unknown>;
  };
}

/**
 * Flattens the visible sections, in order, into the page atoms
 * `<lib-paginated-sheet>` paginates. `photo` has no atom of its own - it folds
 * into the header atom's render, mirroring the CSS float it always relied on.
 *
 * Split out of `cv-preview.component.ts` (ADR-0005, level three) as a pure
 * function rather than a service: it reads thirteen signals off the component
 * and returns a list, so passing them in is both smaller than a `bind()` and
 * the only shape that can be asserted without mounting the preview.
 */
export function buildCvAtoms(ctx: CvAtomContext): SheetAtom[] {
  const out: SheetAtom[] = [];
  const t = ctx.t;
  const photoUri = ctx.includePhoto ? ctx.photoDataUri : null;

  for (const section of ctx.sections) {
    switch (section.key) {
      case 'personal_details':
        out.push({
          id: 'header',
          tpl: ctx.tpl.headerTpl,
          ctx: { $implicit: section, photoUri, placement: ctx.photoPlacement },
        });
        break;
      case 'summary':
        if (section.text) {
          out.push({ id: 'summary', tpl: ctx.tpl.summaryTpl, ctx: { $implicit: section } });
        }
        break;
      case 'skills':
        if (section.groups.length) {
          out.push({ id: 'skills', tpl: ctx.tpl.skillsTpl, ctx: { $implicit: section } });
        }
        break;
      case 'languages':
        if (section.items.length) {
          out.push({ id: 'languages', tpl: ctx.tpl.languagesTpl, ctx: { $implicit: section } });
        }
        break;
      case 'experience': {
        if (!section.entries.length) break;
        const label = t(sectionLabelKey('experience'));
        out.push({
          id: 'sec:experience:title',
          tpl: ctx.tpl.sectionTitleTpl,
          ctx: { $implicit: label, key: 'experience' },
          glueToNext: true,
        });
        section.entries.forEach((entry, i) => {
          const bullets = entry.bullets ?? [];
          // Head glued to its first bullet so a heading never sits alone at a
          // page bottom; the remaining bullets are free to flow to the next
          // page, filling the current one instead of jumping the whole entry.
          out.push({
            id: `sec:experience:e${i}:head`,
            tpl: ctx.tpl.expHeadTpl,
            ctx: { $implicit: entry, key: 'experience', first: i === 0, i, section },
            glueToNext: bullets.length > 0,
          });
          bullets.forEach((bullet, b) =>
            out.push({
              id: `sec:experience:e${i}:b${b}`,
              tpl: ctx.tpl.expBulletTpl,
              ctx: { $implicit: bullet, key: 'experience', i, b, section },
            }),
          );
        });
        break;
      }
      case 'education': {
        if (!section.entries.length) break;
        const label = t(sectionLabelKey('education'));
        out.push({
          id: 'sec:education:title',
          tpl: ctx.tpl.sectionTitleTpl,
          ctx: { $implicit: label, key: 'education' },
          glueToNext: true,
        });
        section.entries.forEach((entry, i) =>
          out.push({
            id: `sec:education:e${i}`,
            tpl: ctx.tpl.eduEntryTpl,
            ctx: { $implicit: entry, key: 'education', i, section },
          }),
        );
        break;
      }
      // 'photo' folds into the header render - no standalone atom.
    }
  }
  return out;
}
