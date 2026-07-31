import * as fs from 'fs';
import * as path from 'path';

// Augmentation-boundary guard for follow-up drafting (mirrors the
// portal-answers guard): Applye drafts and caches a follow-up email locally,
// then hands it to the user's OWN mail client via `mailto:` - Applye must
// never contain a code path that sends or transmits the draft itself. This
// test statically scans the follow-up source files for forbidden
// send/transmit APIs so a future change can't silently add one.

const WORKSPACE_ROOT = path.join(__dirname, '..', '..', '..');

// `followup-draft.service.ts` holds the drafting and the mailto: hand-off; the
// modal component is still listed because it owns the surrounding UI and must
// not grow a transmit path of its own either.
const FOLLOWUP_SERVICE = path.join(
  WORKSPACE_ROOT,
  'apps/desktop/src/app/pages/pipeline/quick-view-modal/followup-draft.service.ts',
);

const FOLLOWUP_FILES = [
  FOLLOWUP_SERVICE,
  path.join(
    WORKSPACE_ROOT,
    'apps/desktop/src/app/pages/pipeline/quick-view-modal/quick-view-modal.component.ts',
  ),
  path.join(WORKSPACE_ROOT, 'apps/desktop/src-tauri/src/commands/followup_drafts.rs'),
  path.join(WORKSPACE_ROOT, 'libs/skills/src/followup/followup.md'),
];

// Any of these appearing in the follow-up source would mean a transmit path
// exists. `mailto:` itself is fine - it hands off to the OS mail client,
// which is the one thing allowed to send.
const FORBIDDEN_PATTERNS = [
  /\bsmtp/i,
  /nodemailer/i,
  /sendgrid/i,
  /\bsend[-_]?mail\b/i,
  /\bsend[-_]?email\b/i,
  /\baxios\b/i,
  /XMLHttpRequest/,
  /\bfetch\(/,
  /reqwest::/,
  /https?:\/\//,
];

describe('followup drafting never transmits', () => {
  for (const file of FOLLOWUP_FILES) {
    it(`${path.relative(WORKSPACE_ROOT, file)} contains no send/transmit code path`, () => {
      const content = fs.readFileSync(file, 'utf-8');
      for (const pattern of FORBIDDEN_PATTERNS) {
        expect(content).not.toMatch(pattern);
      }
    });
  }

  it('the follow-up service only ever opens a mailto: link, never sends directly', () => {
    const content = fs.readFileSync(FOLLOWUP_SERVICE, 'utf-8');
    expect(content).toMatch(/openUrl\(`mailto:/);
  });
});
