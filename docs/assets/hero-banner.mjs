// Applye README hero banner compositor.
//
// Deliberately not wired into the workspace: it runs a handful of times a year,
// when the dashboard is recaptured, and sharp is a heavy native dependency that
// nothing else here needs. Install it for the run and throw it away:
//
//   mkdir -p /tmp/applye-hero && cd /tmp/applye-hero && npm init -y && npm i sharp
//   cp <repo>/docs/assets/hero-banner.mjs .
//   node hero-banner.mjs ~/Desktop/dashboard.png <repo>/docs/assets
//
// Copy the script rather than running it in place: Node resolves the bare
// `sharp` specifier from the script's own directory upward, so it has to sit
// next to the throwaway node_modules.
//
// The source screenshot is the desktop app on the Dashboard, dark theme, a 16:10
// window captured at 2x (2880x1800), seeded with the persona in ASSETS_BRIEF.md.
// Output: hero-banner.png (composite) and hero-banner-plate.png (backdrop with
// the shadow but no window, reusable for the social preview and video thumb).
import sharp from 'sharp';
import path from 'node:path';

const SRC = process.argv[2];
const OUT = process.argv[3] ?? '.';
if (!SRC) {
  console.error('usage: node hero-banner.mjs <screenshot.png> <out-dir>');
  process.exit(1);
}

const CANVAS_W = 1600;
const CANVAS_H = 900;
// 1344 is not arbitrary: at WIN_Y=170 it puts the canvas edge on source row
// y=1564, the gap between the Cindertree and Vantaform rows, so the bleed reads
// as "there is more below" instead of as a half-sliced line of text.
const WIN_W = 1344;
const WIN_X = Math.round((CANVAS_W - WIN_W) / 2);
const WIN_Y = 170;
const RADIUS = 12;
const CROP_KEEP = 1160 / 1250; // drop the empty band at the bottom of the shot

const src = sharp(SRC);
const meta = await src.metadata();
const cropH = Math.round(meta.height * CROP_KEEP);

const winBuf = await sharp(SRC)
  .extract({ left: 0, top: 0, width: meta.width, height: cropH })
  .resize({ width: WIN_W })
  .png()
  .toBuffer();
const WIN_H = (await sharp(winBuf).metadata()).height;

// --- window: rounded top corners, hairline edge, inner top highlight ----------
const topRoundedPath = `M0,${RADIUS} a${RADIUS},${RADIUS} 0 0 1 ${RADIUS},-${RADIUS} h${WIN_W - 2 * RADIUS} a${RADIUS},${RADIUS} 0 0 1 ${RADIUS},${RADIUS} v${WIN_H - RADIUS} h-${WIN_W} z`;

const maskSvg = `<svg width="${WIN_W}" height="${WIN_H}" xmlns="http://www.w3.org/2000/svg"><path d="${topRoundedPath}" fill="#fff"/></svg>`;

const edgeSvg = `<svg width="${WIN_W}" height="${WIN_H}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="sideFade" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#fff" stop-opacity="0.10"/>
      <stop offset="0.30" stop-color="#fff" stop-opacity="0"/>
    </linearGradient>
  </defs>
  <path d="${topRoundedPath}" fill="none" stroke="#45423a" stroke-width="1"/>
  <path d="M${RADIUS + 1},1.5 h${WIN_W - 2 * RADIUS - 2}" stroke="#ffffff" stroke-opacity="0.10" stroke-width="1" fill="none"/>
  <rect x="0.5" y="${RADIUS}" width="1" height="${Math.round(WIN_H * 0.3)}" fill="url(#sideFade)"/>
  <rect x="${WIN_W - 1.5}" y="${RADIUS}" width="1" height="${Math.round(WIN_H * 0.3)}" fill="url(#sideFade)"/>
</svg>`;

const window = await sharp(winBuf)
  .composite([
    { input: Buffer.from(maskSvg), blend: 'dest-in' },
    { input: Buffer.from(edgeSvg), blend: 'over' },
  ])
  .png()
  .toBuffer();

// --- background plate ---------------------------------------------------------
const plateSvg = `<svg width="${CANVAS_W}" height="${CANVAS_H}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <radialGradient id="indigo" gradientUnits="userSpaceOnUse" cx="800" cy="234" r="880">
      <stop offset="0" stop-color="#4F5BFF" stop-opacity="0.18"/>
      <stop offset="0.55" stop-color="#4F5BFF" stop-opacity="0.06"/>
      <stop offset="1" stop-color="#4F5BFF" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="cyan" gradientUnits="userSpaceOnUse" cx="1320" cy="770" r="620">
      <stop offset="0" stop-color="#24C8DB" stop-opacity="0.05"/>
      <stop offset="1" stop-color="#24C8DB" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="gridFade" gradientUnits="userSpaceOnUse" cx="800" cy="450" r="900">
      <stop offset="0" stop-color="#fff" stop-opacity="1"/>
      <stop offset="0.62" stop-color="#fff" stop-opacity="1"/>
      <stop offset="1" stop-color="#fff" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="vig" gradientUnits="userSpaceOnUse" cx="800" cy="450" r="980">
      <stop offset="0.55" stop-color="#000" stop-opacity="0"/>
      <stop offset="1" stop-color="#000" stop-opacity="0.15"/>
    </radialGradient>
    <pattern id="grid" width="32" height="32" patternUnits="userSpaceOnUse">
      <path d="M32,0 H0 V32" fill="none" stroke="#ffffff" stroke-opacity="0.03" stroke-width="1"/>
    </pattern>
    <mask id="gridMask"><rect width="${CANVAS_W}" height="${CANVAS_H}" fill="url(#gridFade)"/></mask>
  </defs>
  <rect width="${CANVAS_W}" height="${CANVAS_H}" fill="#131211"/>
  <rect width="${CANVAS_W}" height="${CANVAS_H}" fill="url(#grid)" mask="url(#gridMask)"/>
  <rect width="${CANVAS_W}" height="${CANVAS_H}" fill="url(#indigo)"/>
  <rect width="${CANVAS_W}" height="${CANVAS_H}" fill="url(#cyan)"/>
  <rect width="${CANVAS_W}" height="${CANVAS_H}" fill="url(#vig)"/>
</svg>`;

const plate = await sharp(Buffer.from(plateSvg)).png().toBuffer();

// --- two-layer shadow, painted on the plate so it can be reused ---------------
async function shadowLayer({ yOffset, sigma, alpha }) {
  const svg = `<svg width="${CANVAS_W}" height="${CANVAS_H}" xmlns="http://www.w3.org/2000/svg">
    <rect x="${WIN_X}" y="${WIN_Y + yOffset}" width="${WIN_W}" height="${WIN_H}" rx="${RADIUS}" fill="#000" fill-opacity="${alpha}"/>
  </svg>`;
  return sharp(Buffer.from(svg)).blur(sigma).png().toBuffer();
}

const plateWithShadow = await sharp(plate)
  .composite([
    { input: await shadowLayer({ yOffset: 48, sigma: 70, alpha: 0.5 }) },
    { input: await shadowLayer({ yOffset: 10, sigma: 14, alpha: 0.4 }) },
  ])
  .png()
  .toBuffer();

// --- grain --------------------------------------------------------------------
const noise = Buffer.alloc(CANVAS_W * CANVAS_H * 4);
let seed = 42;
for (let i = 0; i < CANVAS_W * CANVAS_H; i++) {
  seed = (seed * 1103515245 + 12345) & 0x7fffffff; // deterministic, reproducible builds
  const v = seed % 256;
  noise[i * 4] = v;
  noise[i * 4 + 1] = v;
  noise[i * 4 + 2] = v;
  noise[i * 4 + 3] = 5; // ~2%
}
const grain = await sharp(noise, {
  raw: { width: CANVAS_W, height: CANVAS_H, channels: 4 },
})
  .png()
  .toBuffer();

async function finish(base, file) {
  await sharp(base)
    .composite([{ input: grain, blend: 'over' }])
    .png({ compressionLevel: 9 })
    .toFile(path.join(OUT, file));
}

await finish(plateWithShadow, 'hero-banner-plate.png');

const composite = await sharp(plateWithShadow)
  .composite([{ input: window, left: WIN_X, top: WIN_Y }])
  .png()
  .toBuffer();
await finish(composite, 'hero-banner.png');

console.log(
  `source ${meta.width}x${meta.height} -> crop ${meta.width}x${cropH} -> window ${WIN_W}x${WIN_H}`,
);
console.log(`window at ${WIN_X},${WIN_Y}; bleeds ${WIN_Y + WIN_H - CANVAS_H}px off the bottom`);
