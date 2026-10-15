/* ---------------------------------- generate-icons.js ----------------------------------
 *
 * Dependency-free PWA icon generator. Writes valid 8-bit truecolor PNGs using only
 * Node's built-in `zlib` (deflate) plus a hand-rolled CRC32 — no sharp/canvas/image
 * packages required, so `npm install` stays lean and the build works anywhere.
 *
 * Motif: Iron Log's brand-green tile with a simple cream barbell (shaft + two plates).
 * Runs automatically via the `prebuild` script and can also be run manually:
 *
 *   node scripts/generate-icons.js
 * ------------------------------------------------------------------------------------ */

import { deflateSync } from "node:zlib";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = join(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = join(rootDir, "public");

/* Brand palette (mirrors the CSS variables in ironlog.jsx) */
const GREEN = [0x3f, 0x5c, 0x4a]; // --accent
const CREAM = [0xfa, 0xf9, 0xf6]; // --bg

/* ---------------------------------- minimal PNG encoder ---------------------------------- */

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(bytes) {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) {
    c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, "ascii");
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crc]);
}

/**
 * pixelAt(x, y) must return [r, g, b] — 0..255 each.
 */
function encodePng(size, pixelAt) {
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); // width
  ihdr.writeUInt32BE(size, 4); // height
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // color type: truecolor RGB (no alpha, fully opaque tiles)
  ihdr[10] = 0; // compression method
  ihdr[11] = 0; // filter method
  ihdr[12] = 0; // interlace: none

  // One filter byte (0 = None) per scanline, then RGB triplets.
  const raw = Buffer.alloc(size * (1 + size * 3));
  for (let y = 0; y < size; y++) {
    const rowStart = y * (1 + size * 3);
    raw[rowStart] = 0;
    for (let x = 0; x < size; x++) {
      const [r, g, b] = pixelAt(x, y);
      const o = rowStart + 1 + x * 3;
      raw[o] = r;
      raw[o + 1] = g;
      raw[o + 2] = b;
    }
  }

  return Buffer.concat([
    sig,
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", deflateSync(raw)),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
}

/* ---------------------------------- barbell motif ---------------------------------- */

/**
 * Returns [r, g, b] for a pixel at normalized (nx, ny) in [0,1]x[0,1].
 * When `maskable`, the motif is scaled into the central ~72% safe zone so a
 * launcher's circular/rounded masks never clip it.
 */
function barbellPixel(nx, ny, maskable) {
  let x = nx;
  let y = ny;
  if (maskable) {
    const s = 0.72;
    x = (nx - 0.5) / s + 0.5;
    y = (ny - 0.5) / s + 0.5;
  }

  const inside = (px, py, cx, cy, rad) => {
    const dx = px - cx;
    const dy = py - cy;
    return dx * dx + dy * dy <= rad * rad;
  };

  // Barbell geometry (normalized).
  const shaftHalfH = 0.033; // shaft thickness (±)
  const shaftX1 = 0.21;
  const shaftX2 = 0.79;
  const plateOuter = 0.165;
  const plateInner = 0.085;
  const plateCx = [0.21, 0.79];

  // Shaft.
  if (x >= shaftX1 && x <= shaftX2 && y >= 0.5 - shaftHalfH && y <= 0.5 + shaftHalfH) {
    return CREAM;
  }
  // Plates (annuli). The hole lets the green background show through.
  for (const cx of plateCx) {
    if (inside(x, y, cx, 0.5, plateOuter)) {
      return inside(x, y, cx, 0.5, plateInner) ? GREEN : CREAM;
    }
  }
  return GREEN;
}

/* ---------------------------------- output ---------------------------------- */

const CONFIGS = [
  { file: "icon-192.png", size: 192, maskable: false },
  { file: "icon-512.png", size: 512, maskable: false },
  { file: "icon-maskable-512.png", size: 512, maskable: true },
  { file: "apple-touch-icon.png", size: 180, maskable: false },
];

mkdirSync(outDir, { recursive: true });

for (const { file, size, maskable } of CONFIGS) {
  const png = encodePng(size, (x, y) => barbellPixel(x / size, y / size, maskable));
  writeFileSync(join(outDir, file), png);
  console.log(`✓ generated ${file} (${size}×${size})`);
}

console.log(`→ icons written to ${outDir}`);