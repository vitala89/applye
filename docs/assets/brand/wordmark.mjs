// Applye wordmark generator. Emits wordmark-light.svg and wordmark-dark.svg.
//
// The lockup is not designed here, it is transcribed: the mark, the gap, the
// face, the weight and the tracking all come from `.brand` in the site's
// app.html and styles.scss. A wordmark drawn by hand would drift from the
// header it is supposed to be the same logo as, and nobody would notice until
// they were side by side.
//
// Like hero-banner.mjs, this is not wired into the workspace - it runs when the
// brand changes, which is close to never:
//
//   mkdir -p /tmp/applye-wordmark && cd /tmp/applye-wordmark
//   npm init -y && npm i opentype.js
//   curl -sLO https://github.com/JetBrains/JetBrainsMono/releases/download/v2.304/JetBrainsMono-2.304.zip
//   unzip -q JetBrainsMono-2.304.zip
//   cp <repo>/docs/assets/brand/wordmark.mjs .
//   node wordmark.mjs fonts/ttf/JetBrainsMono-Medium.ttf <repo>/docs/assets/brand
//
// JetBrains Mono is SIL OFL 1.1, which permits the outlines this emits: the
// glyphs are converted to paths and embedded, the font itself is not
// redistributed, and the result is not sold as a font.
import opentype from 'opentype.js';
import fs from 'node:fs';
import path from 'node:path';

const FONT = process.argv[2];
const OUT = process.argv[3] ?? '.';

const CANVAS_W = 250;
const CANVAS_H = 56;
// Sized to fill the 250x56 box the READMEs reserve, rather than sized first and
// floated in it: at 30px the lockup used 59% of the width and read as a small
// image with a lot of margin baked into the file.
const FONT_SIZE = 40;
const TRACKING = -0.02 * FONT_SIZE; // .brand letter-spacing: -0.02em
const GAP = 12; // .brand gap: var(--space-3)
const TEXT = 'applye';
const INDIGO = '#4F5BFF';

const font = opentype.parse(fs.readFileSync(FONT).buffer);

// Outlines, not <text>: a <text> wordmark falls back to whatever monospace the
// viewer has, because GitHub serves README SVGs through <img>, which blocks
// webfonts entirely.
//
// Laid out glyph by glyph rather than with font.getPath: opentype.js runs the
// font's ccmp lookups on a whole string and JetBrains Mono uses a substitution
// format it does not implement. Six lowercase letters need no shaping - the
// font's ligatures are all symbol pairs - so stepping the advance by hand is
// equivalent here and does not touch the failing path.
const scale = FONT_SIZE / font.unitsPerEm;
const glyphPath = new opentype.Path();
let penX = 0;
for (const ch of TEXT) {
  const glyph = font.charToGlyph(ch);
  glyphPath.extend(glyph.getPath(penX, 0, FONT_SIZE));
  penX += glyph.advanceWidth * scale + TRACKING;
}
const textW = penX - TRACKING; // the last letter carries no trailing tracking
const bbox = glyphPath.getBoundingBox();

// The mark is the app header's: a slash in the text colour, an indigo bar. The
// header sets it to 1.05em of the type size and centres it on the line.
const MARK = FONT_SIZE * 1.05;
const markScale = MARK / 64;

const totalW = MARK + GAP + textW;
const originX = (CANVAS_W - totalW) / 2;
const markY = (CANVAS_H - MARK) / 2;
// Optical centring on the lowercase letters rather than the em box: "applye"
// has one descender and no ascender, so centring the em box would ride high.
const baselineY = (CANVAS_H - (bbox.y2 - bbox.y1)) / 2 - bbox.y1;

function svg({ ink }) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${CANVAS_W}" height="${CANVAS_H}" viewBox="0 0 ${CANVAS_W} ${CANVAS_H}" fill="none" role="img" aria-label="Applye">
  <title>Applye</title>
  <g transform="translate(${originX.toFixed(2)} ${markY.toFixed(2)}) scale(${markScale.toFixed(5)})">
    <polygon points="37,10 45,10 15,54 7,54" fill="${ink}"/>
    <rect x="50" y="10" width="8" height="44" fill="${INDIGO}"/>
  </g>
  <path transform="translate(${(originX + MARK + GAP).toFixed(2)} ${baselineY.toFixed(2)})" d="${glyphPath.toPathData(2)}" fill="${ink}"/>
</svg>
`;
}

fs.mkdirSync(OUT, { recursive: true });
fs.writeFileSync(path.join(OUT, 'wordmark-light.svg'), svg({ ink: '#1c1b19' }));
fs.writeFileSync(path.join(OUT, 'wordmark-dark.svg'), svg({ ink: '#f4f2ed' }));

console.log(
  `mark ${MARK.toFixed(1)}px + gap ${GAP} + text ${textW.toFixed(1)}px = ${totalW.toFixed(1)}px on ${CANVAS_W}x${CANVAS_H}`,
);
console.log(
  `glyph bbox y ${bbox.y1.toFixed(1)}..${bbox.y2.toFixed(1)}, baseline ${baselineY.toFixed(2)}`,
);
