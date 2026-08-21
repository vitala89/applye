import { PRINT_PATH_CLASS, markPrintPath } from './wysiwyg-print';

/**
 * What is left of the print protocol after both editors moved to the Rust
 * export: the marking of the printed sheet's ancestors, which is the one thing
 * the stylesheet cannot express on its own.
 */
describe('wysiwyg print', () => {
  beforeEach(() => {
    document.getElementById('wysiwyg-page-rule')?.remove();
    document.body.classList.remove('printing-cv');
  });

  afterEach(() => {
    document.getElementById('wysiwyg-page-rule')?.remove();
    document.body.classList.remove('printing-cv');
  });

  // `B4`, the half that survived two attempts at the margins. The print
  // stylesheet hid the app with `visibility: hidden`, which reveals without
  // reclaiming - the property is defined to preserve layout. While the sheet
  // was pinned out of flow that cost nothing; once the flow was unclipped so
  // the page margins could reach every page, every hidden sibling above the
  // sheet added its height to the first page's top inset.
  describe("marking the sheet's ancestors", () => {
    function build(): HTMLElement {
      document.body.innerHTML = `
        <div class="shell">
          <div class="sidebar"></div>
          <div class="main">
            <div class="content">
              <div class="editor-column"></div>
              <lib-paginated-sheet><div class="page-card"></div></lib-paginated-sheet>
            </div>
          </div>
        </div>`;
      return document.querySelector('.content') as HTMLElement;
    }

    it('marks every ancestor from the sheet up to the body', () => {
      build();

      markPrintPath();

      for (const sel of ['.content', '.main', '.shell']) {
        expect(document.querySelector(sel)?.classList.contains(PRINT_PATH_CLASS)).toBe(true);
      }
      expect(document.body.classList.contains(PRINT_PATH_CLASS)).toBe(true);
    });

    // The siblings are what the rule exists to drop; marking them would defeat
    // it as surely as marking nothing.
    it('marks no sibling of the path, and not the sheet itself', () => {
      build();

      markPrintPath();

      expect(document.querySelector('.sidebar')?.classList.contains(PRINT_PATH_CLASS)).toBe(false);
      expect(document.querySelector('.editor-column')?.classList.contains(PRINT_PATH_CLASS)).toBe(
        false,
      );
      expect(
        document.querySelector('lib-paginated-sheet')?.classList.contains(PRINT_PATH_CLASS),
      ).toBe(false);
    });

    it('hands back an undo that leaves the document as it found it', () => {
      build();

      markPrintPath()();

      expect(document.querySelectorAll(`.${PRINT_PATH_CLASS}`).length).toBe(0);
    });

    // A print path that cannot find its subtree must leave the page alone: the
    // stylesheet drops everything off the marked chain, so marking nothing with
    // a sheet absent would blank the export rather than fail it.
    it('marks nothing when there is no sheet to print', () => {
      document.body.innerHTML = '<div class="shell"><div class="main"></div></div>';

      markPrintPath();

      expect(document.querySelectorAll(`.${PRINT_PATH_CLASS}`).length).toBe(0);
    });
  });
});
