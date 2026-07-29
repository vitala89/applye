// Builds docs/assets/walkthrough-thumb.png: the README's clickable poster for
// the first-run tour published at applye.dev/docs/guide/tour/.
//
// Same backdrop language as hero-banner.mjs, at half the scale, plus a play
// affordance - the image is a link, and a still frame alone does not say so.
//
//   mkdir -p /tmp/applye-thumb && cd /tmp/applye-thumb && npm init -y && npm i sharp
//   cp <repo>/docs/assets/walkthrough-thumb.mjs .
//   node walkthrough-thumb.mjs <repo>
//
// Needs ffmpeg on PATH.
//
// The frame is 44s - the targeting step - and the choice is not only aesthetic.
// The obvious pick, the welcome screen around 3s, cannot be used: its
// environment check prints the capturing machine's export path, which contains
// a real home directory name. The tour video ships that frame today; this file
// does not add a second, still, indexable copy of it.
import sharp from 'sharp';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const REPO = process.argv[2] ?? process.cwd();
const SOURCE = path.join(REPO, 'apps/web/public/guide/tour-walkthrough.mp4');
const OUT = path.join(REPO, 'docs/assets/walkthrough-thumb.png');
const AT = 44;

const CANVAS_W = 800;
const CANVAS_H = 450;
const WIN_W = 660;
const WIN_X = Math.round((CANVAS_W - WIN_W) / 2);
const WIN_Y = 60;
const RADIUS = 8;

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'applye-thumb-'));
const frame = path.join(tmp, 'frame.png');
execFileSync('ffmpeg', [
  '-v',
  'error',
  '-ss',
  String(AT),
  '-i',
  SOURCE,
  '-frames:v',
  '1',
  '-y',
  frame,
]);

const winBuf = await sharp(frame).resize({ width: WIN_W }).png().toBuffer();
const WIN_H = (await sharp(winBuf).metadata()).height;

const topRounded = `M0,${RADIUS} a${RADIUS},${RADIUS} 0 0 1 ${RADIUS},-${RADIUS} h${WIN_W - 2 * RADIUS} a${RADIUS},${RADIUS} 0 0 1 ${RADIUS},${RADIUS} v${WIN_H - RADIUS} h-${WIN_W} z`;

const window = await sharp(winBuf)
  .composite([
    {
      input: Buffer.from(
        `<svg width="${WIN_W}" height="${WIN_H}" xmlns="http://www.w3.org/2000/svg"><path d="${topRounded}" fill="#fff"/></svg>`,
      ),
      blend: 'dest-in',
    },
    {
      input: Buffer.from(
        `<svg width="${WIN_W}" height="${WIN_H}" xmlns="http://www.w3.org/2000/svg">
           <path d="${topRounded}" fill="none" stroke="#45423a" stroke-width="1"/>
           <path d="M${RADIUS + 1},1.5 h${WIN_W - 2 * RADIUS - 2}" stroke="#ffffff" stroke-opacity="0.10" stroke-width="1"/>
           <rect width="${WIN_W}" height="${WIN_H}" fill="#000" fill-opacity="0.18"/>
         </svg>`,
      ),
      blend: 'over',
    },
  ])
  .png()
  .toBuffer();

const plate = await sharp(
  Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${CANVAS_W}" height="${CANVAS_H}">
  <defs>
    <radialGradient id="indigo" gradientUnits="userSpaceOnUse" cx="400" cy="117" r="440">
      <stop offset="0" stop-color="#4F5BFF" stop-opacity="0.18"/>
      <stop offset="0.55" stop-color="#4F5BFF" stop-opacity="0.06"/>
      <stop offset="1" stop-color="#4F5BFF" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="cyan" gradientUnits="userSpaceOnUse" cx="660" cy="385" r="310">
      <stop offset="0" stop-color="#24C8DB" stop-opacity="0.05"/>
      <stop offset="1" stop-color="#24C8DB" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="gridFade" gradientUnits="userSpaceOnUse" cx="400" cy="225" r="450">
      <stop offset="0.62" stop-color="#fff" stop-opacity="1"/>
      <stop offset="1" stop-color="#fff" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="vig" gradientUnits="userSpaceOnUse" cx="400" cy="225" r="490">
      <stop offset="0.55" stop-color="#000" stop-opacity="0"/>
      <stop offset="1" stop-color="#000" stop-opacity="0.15"/>
    </radialGradient>
    <pattern id="grid" width="16" height="16" patternUnits="userSpaceOnUse">
      <path d="M16,0 H0 V16" fill="none" stroke="#ffffff" stroke-opacity="0.03" stroke-width="1"/>
    </pattern>
    <mask id="gridMask"><rect width="${CANVAS_W}" height="${CANVAS_H}" fill="url(#gridFade)"/></mask>
  </defs>
  <rect width="${CANVAS_W}" height="${CANVAS_H}" fill="#131211"/>
  <rect width="${CANVAS_W}" height="${CANVAS_H}" fill="url(#grid)" mask="url(#gridMask)"/>
  <rect width="${CANVAS_W}" height="${CANVAS_H}" fill="url(#indigo)"/>
  <rect width="${CANVAS_W}" height="${CANVAS_H}" fill="url(#cyan)"/>
  <rect width="${CANVAS_W}" height="${CANVAS_H}" fill="url(#vig)"/>
</svg>`),
)
  .png()
  .toBuffer();

async function shadow({ yOffset, sigma, alpha }) {
  return sharp(
    Buffer.from(
      `<svg xmlns="http://www.w3.org/2000/svg" width="${CANVAS_W}" height="${CANVAS_H}"><rect x="${WIN_X}" y="${WIN_Y + yOffset}" width="${WIN_W}" height="${WIN_H}" rx="${RADIUS}" fill="#000" fill-opacity="${alpha}"/></svg>`,
    ),
  )
    .blur(sigma)
    .png()
    .toBuffer();
}

// The play button sits over the window's optical centre, not the canvas centre:
// the window bleeds off the bottom, so the two are not the same point.
const playY = Math.round(WIN_Y + Math.min(WIN_H, CANVAS_H - WIN_Y) / 2);
const play =
  Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${CANVAS_W}" height="${CANVAS_H}">
  <circle cx="400" cy="${playY}" r="42" fill="#4F5BFF"/>
  <circle cx="400" cy="${playY}" r="42" fill="none" stroke="#ffffff" stroke-opacity="0.22" stroke-width="1"/>
  <path d="M386,${playY - 20} L418,${playY} L386,${playY + 20} Z" fill="#ffffff"/>
</svg>`);

const noise = Buffer.alloc(CANVAS_W * CANVAS_H * 4);
let seed = 42;
for (let i = 0; i < CANVAS_W * CANVAS_H; i++) {
  seed = (seed * 1103515245 + 12345) & 0x7fffffff;
  const v = seed % 256;
  noise[i * 4] = v;
  noise[i * 4 + 1] = v;
  noise[i * 4 + 2] = v;
  noise[i * 4 + 3] = 5;
}
const grain = await sharp(noise, { raw: { width: CANVAS_W, height: CANVAS_H, channels: 4 } })
  .png()
  .toBuffer();

await sharp(plate)
  .composite([
    { input: await shadow({ yOffset: 24, sigma: 35, alpha: 0.5 }) },
    { input: await shadow({ yOffset: 5, sigma: 7, alpha: 0.4 }) },
    { input: window, left: WIN_X, top: WIN_Y },
    { input: play },
    { input: grain, blend: 'over' },
  ])
  .png({ compressionLevel: 9 })
  .toFile(OUT);

fs.rmSync(tmp, { recursive: true, force: true });
console.log(
  `frame @${AT}s -> window ${WIN_W}x${WIN_H} at ${WIN_X},${WIN_Y} on ${CANVAS_W}x${CANVAS_H}`,
);
