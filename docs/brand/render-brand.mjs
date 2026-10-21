// Regenerates every Bowser logo file from one path definition (see docs/BRAND.md).
// Usage: node docs/brand/render-brand.mjs   (needs Google Chrome for the PNGs; macOS path below, or set CHROME)
// The geometry here must match app/src/components/brand.tsx.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const BRAND = join(ROOT, 'app/assets/brand');
const IMAGES = join(ROOT, 'app/assets/images');
const CHROME = process.env.CHROME ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

// Mark: a fuel drop (x 22–78, y 10–90) with a down arrow cut out of it: the price is about to drop.
const MARK =
  'M50 10C58 22 78 40 78 62A28 28 0 0 1 22 62C22 40 42 22 50 10Z' +
  'M45.5 42A4.5 4.5 0 0 1 54.5 42V63.14L59.82 57.82A4.5 4.5 0 0 1 66.18 64.18L53.18 77.18A4.5 4.5 0 0 1 46.82 77.18' +
  'L33.82 64.18A4.5 4.5 0 0 1 40.18 57.82L45.5 63.14Z';
const MARK_VB = '9 9 82 82'; // square, mark centred
const MARK_H = 80; // mark height in path units
// "Bowser" as monoline centre-line strokes (cap height 70 incl. stroke 12), so no font is needed
const WORD =
  'M6 64V6H20A14 14 0 0 1 20 34H6M20 34H23A15 15 0 0 1 23 64H6' +
  'M55 46A18 18 0 1 0 91 46A18 18 0 1 0 55 46' +
  'M107 28L118 64L128.5 37L139 64L150 28' +
  'M194 32.32C190 28 186 28 180.5 28C172 28 167 32.32 167 37.72C167 44.2 175 45 180.5 46C187 47 195 49 195 55' +
  'C195 61.12 188 64 180.5 64C173 64 168 61.84 166 58.24' +
  'M211 46H247A18 18 0 1 0 241.73 58.73' +
  'M263 64V28M263 45C263 34 270 28 281 28H283';
const LOCKUP_W = 369, LOCKUP_H = 80;

if (!existsSync(CHROME)) throw new Error(`Chrome not found at ${CHROME}; set CHROME`); // check before writing anything

const AMBER = '#FFB22E', DEEP_AMBER = '#F0A000', CHARCOAL = '#16191C';

const markPath = (fill) => `<path d="${MARK}" fill="${fill}" fill-rule="evenodd"/>`;
const markSvg = (fill) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="156" height="156" viewBox="${MARK_VB}">${markPath(fill)}</svg>\n`;
const lockupSvg = (mark, word) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${LOCKUP_W * 2}" height="${LOCKUP_H * 2}" viewBox="0 0 ${LOCKUP_W} ${LOCKUP_H}">` +
  `<g transform="translate(-22 -10)">${markPath(mark)}</g>` +
  `<path d="${WORD}" transform="translate(79 5)" fill="none" stroke="${word}" stroke-width="12" stroke-linecap="round" stroke-linejoin="round"/></svg>\n`;

writeFileSync(join(BRAND, 'bowser-mark.svg'), markSvg(AMBER));
writeFileSync(join(BRAND, 'bowser-mark-light.svg'), markSvg(DEEP_AMBER));
writeFileSync(join(BRAND, 'bowser-mark-mono.svg'), markSvg('#000000'));
writeFileSync(join(BRAND, 'bowser-wordmark.svg'), lockupSvg(DEEP_AMBER, '#141618'));
writeFileSync(join(BRAND, 'bowser-wordmark-dark.svg'), lockupSvg(AMBER, '#EEF0F2'));

// PNG: a w×h canvas, optional background (and corner radius), the mark `markH` px tall and centred
function png(file, { w, h = w, markH, fill, bg, radius = 0 }) {
  const s = markH / MARK_H;
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">` +
    (bg ? `<rect width="${w}" height="${h}" rx="${radius}" fill="${bg}"/>` : '') +
    `<g transform="translate(${w / 2} ${h / 2}) scale(${s}) translate(-50 -50)">${markPath(fill)}</g></svg>`;
  const dir = mkdtempSync(join(tmpdir(), 'bowser-'));
  const html = join(dir, 'p.html');
  writeFileSync(html, `<html><body style="margin:0;background:transparent">${svg}</body></html>`);
  execFileSync(CHROME, [
    '--headless', '--disable-gpu', '--hide-scrollbars', '--force-device-scale-factor=1',
    '--default-background-color=00000000', `--window-size=${w},${h}`, `--screenshot=${file}`, `file://${html}`,
  ], { stdio: 'ignore' });
  rmSync(dir, { recursive: true });
}

png(join(IMAGES, 'icon.png'), { w: 1024, markH: 560, fill: AMBER, bg: CHARCOAL });
png(join(IMAGES, 'android-icon-foreground.png'), { w: 512, markH: 250, fill: AMBER }); // inside the 66/108 safe circle
png(join(IMAGES, 'android-icon-background.png'), { w: 512, markH: 0, fill: 'none', bg: CHARCOAL });
png(join(IMAGES, 'android-icon-monochrome.png'), { w: 432, markH: 210, fill: '#FFFFFF' });
png(join(IMAGES, 'splash-icon.png'), { w: 684, h: 639, markH: 600, fill: AMBER });
png(join(IMAGES, 'favicon.png'), { w: 48, markH: 36, fill: AMBER, bg: CHARCOAL, radius: 10 });
png(join(BRAND, 'widget-mark.png'), { w: 96, markH: 92, fill: AMBER });
console.log('Bowser brand files written');
