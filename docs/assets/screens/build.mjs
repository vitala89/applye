// Builds docs/assets/screens/*.png for the README's screenshot table.
//
// Nothing here is captured: every frame already exists under
// apps/web/public/guide/, shot from the running desktop app against the seeded
// demo persona for the documentation site. Recapturing them for the README
// would produce a second set that drifts from the first, so the README reuses
// the guide's and this script only prepares them: pick the frame, scale to a
// common width, strip the metadata.
//
// Two of the six have no still in the guide - the pipeline board and the
// tailoring review appear there only as recordings - so those come out of the
// MP4s with ffmpeg, at a timestamp chosen for a clean, complete state.
//
// Run it the same way as the other media scripts:
//
//   mkdir -p /tmp/applye-screens && cd /tmp/applye-screens
//   npm init -y && npm i sharp
//   cp <repo>/docs/assets/screens/build.mjs .
//   node build.mjs <repo>
//
// Needs ffmpeg on PATH for the two video frames.
import sharp from 'sharp';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const REPO = process.argv[2] ?? process.cwd();
const GUIDE = path.join(REPO, 'apps/web/public/guide');
const OUT = path.join(REPO, 'docs/assets/screens');

// 1440 wide is the README's stated size and half of the 2880px captures, so the
// downscale is an exact 2:1 with no resampling artefacts. Height is left to the
// source: two of these frames are not 16:10, and cropping them to match would
// cut the weekly chart off the analytics screen and the save controls off the
// Discover feed. A markdown table scales every cell to the column width anyway.
const WIDTH = 1440;

const SCREENS = [
  { out: 'dashboard.png', from: 'dashboard-full.png' },
  { out: 'discover.png', from: 'discover-badges.png' },
  { out: 'job-detail.png', from: 'score-result.png' },
  // The board is only ever shown mid-drag in the guide. 1.2s is before the card
  // detail opens over it and dims the columns.
  { out: 'pipeline.png', video: 'pipeline-drag.mp4', at: 1.2 },
  // 35s is the wizard's last step with both documents generated and the final
  // checks listed; earlier timestamps catch it half-rendered.
  { out: 'tailoring.png', video: 'tailor-wizard.mp4', at: 35 },
  { out: 'analytics.png', from: 'analytics.png' },
];

fs.mkdirSync(OUT, { recursive: true });
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'applye-frames-'));

for (const screen of SCREENS) {
  let source;
  if (screen.video) {
    source = path.join(tmp, screen.out);
    execFileSync('ffmpeg', [
      '-v',
      'error',
      '-ss',
      String(screen.at),
      '-i',
      path.join(GUIDE, screen.video),
      '-frames:v',
      '1',
      '-y',
      source,
    ]);
  } else {
    source = path.join(GUIDE, screen.from);
  }

  const target = path.join(OUT, screen.out);
  await sharp(source)
    .resize({ width: WIDTH, withoutEnlargement: true })
    .png({ compressionLevel: 9 })
    .toFile(target);

  const meta = await sharp(target).metadata();
  const origin = screen.video ? `${screen.video} @${screen.at}s` : screen.from;
  console.log(`${screen.out.padEnd(16)} ${meta.width}x${meta.height}  <- ${origin}`);
}

fs.rmSync(tmp, { recursive: true, force: true });
