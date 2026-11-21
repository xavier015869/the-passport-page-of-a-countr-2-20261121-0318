// The Passport Page of a Country That Isn't There — make.fun entry.
// Renders one open passport spread (1024x1024 PNG) of the invented
// Republic of Ostmara to /output/entry.png. Zero dependencies: the PNG
// encoder, rasteriser, stroke typeface, portrait, guilloche work and
// border stamps are all drawn by this program, deterministically.
import { deflateSync } from "node:zlib";
import { mkdirSync, writeFileSync } from "node:fs";

// ---------------------------------------------------------------- PRNG
// Seeded so the two grader runs produce byte-identical output.
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = mulberry32(20261121);

// ---------------------------------------------------------------- PNG
const CRC_TABLE: number[] = (() => {
  const t: number[] = [];
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t.push(c >>> 0);
  }
  return t;
})();
function crc32(buf: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function pngChunk(type: string, data: Uint8Array): Uint8Array {
  const out = new Uint8Array(12 + data.length);
  const dv = new DataView(out.buffer);
  dv.setUint32(0, data.length);
  for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i);
  out.set(data, 8);
  const crcData = new Uint8Array(4 + data.length);
  for (let i = 0; i < 4; i++) crcData[i] = type.charCodeAt(i);
  crcData.set(data, 4);
  dv.setUint32(8 + data.length, crc32(crcData));
  return out;
}
function encodePNG(w: number, h: number, rgb: Uint8Array): Uint8Array {
  const ihdr = new Uint8Array(13);
  const dv = new DataView(ihdr.buffer);
  dv.setUint32(0, w); dv.setUint32(4, h);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // colour type: truecolour
  const raw = new Uint8Array(h * (1 + w * 3));
  for (let y = 0; y < h; y++) {
    raw[y * (1 + w * 3)] = 0; // filter: none
    raw.set(rgb.subarray(y * w * 3, (y + 1) * w * 3), y * (1 + w * 3) + 1);
  }
  const idat = deflateSync(raw, { level: 9 });
  const parts = [
    new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]),
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", new Uint8Array(idat)),
    pngChunk("IEND", new Uint8Array(0)),
  ];
  const total = parts.reduce((s, p) => s + p.length, 0);
  const out = new Uint8Array(total);
  let off = 0;
  for (const p of parts) { out.set(p, off); off += p.length; }
  return out;
}

// ---------------------------------------------------------------- canvas
type RGB = [number, number, number];
const W = 1024, H = 1024;
const px = new Uint8Array(W * H * 3);

function blend(x: number, y: number, c: RGB, a: number): void {
  const xi = Math.round(x), yi = Math.round(y);
  if (xi < 0 || yi < 0 || xi >= W || yi >= H || a <= 0) return;
  if (a > 1) a = 1;
  const i = (yi * W + xi) * 3;
  px[i] = Math.round(px[i] * (1 - a) + c[0] * a);
  px[i + 1] = Math.round(px[i + 1] * (1 - a) + c[1] * a);
  px[i + 2] = Math.round(px[i + 2] * (1 - a) + c[2] * a);
}
function fillAll(c: RGB): void {
  for (let i = 0; i < W * H; i++) { px[i * 3] = c[0]; px[i * 3 + 1] = c[1]; px[i * 3 + 2] = c[2]; }
}
function fillRect(x: number, y: number, w: number, h: number, c: RGB, a = 1): void {
  for (let yy = Math.round(y); yy < Math.round(y + h); yy++)
    for (let xx = Math.round(x); xx < Math.round(x + w); xx++) blend(xx, yy, c, a);
}
function strokeLine(x0: number, y0: number, x1: number, y1: number, c: RGB, width: number, a = 1): void {
  const dx = x1 - x0, dy = y1 - y0;
  const len = Math.max(Math.abs(dx), Math.abs(dy), 1);
  const steps = Math.ceil(len * 2);
  const r = width / 2;
  for (let s = 0; s <= steps; s++) {
    const x = x0 + (dx * s) / steps, y = y0 + (dy * s) / steps;
    for (let oy = -r; oy <= r; oy += 0.5)
      for (let ox = -r; ox <= r; ox += 0.5)
        if (ox * ox + oy * oy <= r * r + 0.3) blend(x + ox, y + oy, c, a);
  }
}
function polyline(pts: number[][], c: RGB, width: number, a = 1, close = false): void {
  for (let i = 0; i + 1 < pts.length; i++) strokeLine(pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1], c, width, a);
  if (close && pts.length > 2) strokeLine(pts[pts.length - 1][0], pts[pts.length - 1][1], pts[0][0], pts[0][1], c, width, a);
}
function fillPoly(pts: number[][], c: RGB, a = 1): void {
  let minY = Infinity, maxY = -Infinity;
  for (const p of pts) { minY = Math.min(minY, p[1]); maxY = Math.max(maxY, p[1]); }
  for (let y = Math.floor(minY); y <= Math.ceil(maxY); y++) {
    const xs: number[] = [];
    for (let i = 0; i < pts.length; i++) {
      const p0 = pts[i], p1 = pts[(i + 1) % pts.length];
      if ((p0[1] <= y && p1[1] > y) || (p1[1] <= y && p0[1] > y))
        xs.push(p0[0] + ((y - p0[1]) / (p1[1] - p0[1])) * (p1[0] - p0[0]));
    }
    xs.sort((m, n) => m - n);
    for (let i = 0; i + 1 < xs.length; i += 2)
      for (let x = Math.floor(xs[i]); x <= Math.ceil(xs[i + 1]); x++) blend(x, y, c, a);
  }
}
function fillEllipse(cx: number, cy: number, rx: number, ry: number, c: RGB, a = 1): void {
  for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++)
    for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
      const d = ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2;
      if (d <= 1) blend(x, y, c, a * (d > 0.92 ? 0.6 : 1));
    }
}
function strokeEllipse(cx: number, cy: number, rx: number, ry: number, c: RGB, width: number, a = 1): void {
  const pts: number[][] = [];
  for (let t = 0; t <= Math.PI * 2 + 0.01; t += 0.05) pts.push([cx + rx * Math.cos(t), cy + ry * Math.sin(t)]);
  polyline(pts, c, width, a);
}
function strokeCircle(cx: number, cy: number, r: number, c: RGB, width: number, a = 1): void {
  strokeEllipse(cx, cy, r, r, c, width, a);
}
function fillCircle(cx: number, cy: number, r: number, c: RGB, a = 1): void {
  fillEllipse(cx, cy, r, r, c, a);
}
// Quadratic bezier as a stroked curve (signature, hair sweeps).
function strokeBezier(p0: number[], p1: number[], p2: number[], c: RGB, width: number, a = 1): void {
  let prev = p0;
  for (let s = 1; s <= 24; s++) {
    const t = s / 24, u = 1 - t;
    const p = [u * u * p0[0] + 2 * u * t * p1[0] + t * t * p2[0], u * u * p0[1] + 2 * u * t * p1[1] + t * t * p2[1]];
    strokeLine(prev[0], prev[1], p[0], p[1], c, width, a);
    prev = p;
  }
}

// ---------------------------------------------------------------- type
// A hand-cut stroke typeface on a 6-wide, 8-cap grid, in the plain
// grotesque manner of real passport lettering. One face at every size
// keeps the document coherent; weight comes from stroke width alone.
type Glyph = number[][][];
const GLYPHS: Record<string, Glyph> = {
  A: [[[0, 8], [3, 0], [6, 8]], [[1.2, 5.2], [4.8, 5.2]]],
  B: [[[0, 0], [0, 8]], [[0, 0], [3.2, 0], [4.7, 1.2], [4.7, 2.7], [3.2, 3.9], [0, 3.9]], [[0, 3.9], [3.8, 3.9], [5.3, 5.2], [5.3, 6.8], [3.8, 8], [0, 8]]],
  C: [[[5.5, 1.7], [4.1, 0.2], [2, 0.2], [0.6, 1.6], [0.6, 6.4], [2, 7.8], [4.1, 7.8], [5.5, 6.3]]],
  D: [[[0, 0], [0, 8]], [[0, 0], [3.4, 0], [5.3, 2.1], [5.3, 5.9], [3.4, 8], [0, 8]]],
  E: [[[5.3, 0], [0, 0], [0, 8], [5.3, 8]], [[0, 4], [4.3, 4]]],
  F: [[[5.3, 0], [0, 0], [0, 8]], [[0, 4], [4.3, 4]]],
  G: [[[5.5, 1.7], [4.1, 0.2], [2, 0.2], [0.6, 1.6], [0.6, 6.4], [2, 7.8], [4.3, 7.8], [5.5, 6.6], [5.5, 4.7], [3.7, 4.7]]],
  H: [[[0, 0], [0, 8]], [[6, 0], [6, 8]], [[0, 4], [6, 4]]],
  I: [[[3, 0], [3, 8]], [[1.3, 0], [4.7, 0]], [[1.3, 8], [4.7, 8]]],
  J: [[[5.4, 0], [5.4, 6.1], [4.1, 7.8], [2.2, 7.8], [0.8, 6.5]]],
  K: [[[0, 0], [0, 8]], [[5.7, 0], [0.7, 4.3]], [[1.8, 3.3], [5.9, 8]]],
  L: [[[0, 0], [0, 8], [5.3, 8]]],
  M: [[[0, 8], [0, 0], [3, 4.8], [6, 0], [6, 8]]],
  N: [[[0, 8], [0, 0], [6, 8], [6, 0]]],
  O: [[[3, 0], [4.9, 0.7], [6, 2.3], [6, 5.7], [4.9, 7.3], [3, 8], [1.1, 7.3], [0, 5.7], [0, 2.3], [1.1, 0.7], [3, 0]]],
  P: [[[0, 8], [0, 0], [3.6, 0], [5.3, 1.4], [5.3, 3.4], [3.6, 4.8], [0, 4.8]]],
  Q: [[[3, 0], [4.9, 0.7], [6, 2.3], [6, 5.7], [4.9, 7.3], [3, 8], [1.1, 7.3], [0, 5.7], [0, 2.3], [1.1, 0.7], [3, 0]], [[3.9, 5.6], [6.3, 8.6]]],
  R: [[[0, 8], [0, 0], [3.6, 0], [5.3, 1.4], [5.3, 3.4], [3.6, 4.8], [0, 4.8]], [[3.3, 4.8], [5.9, 8]]],
  S: [[[5.3, 1.5], [3.9, 0.2], [1.9, 0.2], [0.7, 1.4], [0.9, 2.9], [2.3, 3.9], [4.1, 4.7], [5.3, 5.9], [4.9, 7.2], [3.5, 7.9], [1.5, 7.9], [0.4, 6.8]]],
  T: [[[0.4, 0], [5.6, 0]], [[3, 0], [3, 8]]],
  U: [[[0, 0], [0, 5.7], [1.2, 7.4], [3, 8], [4.8, 7.4], [6, 5.7], [6, 0]]],
  V: [[[0, 0], [3, 8], [6, 0]]],
  W: [[[0, 0], [1.4, 8], [3, 3.2], [4.6, 8], [6, 0]]],
  X: [[[0, 0], [6, 8]], [[6, 0], [0, 8]]],
  Y: [[[0, 0], [3, 3.7], [6, 0]], [[3, 3.7], [3, 8]]],
  Z: [[[0.4, 0], [5.6, 0], [0.4, 8], [5.6, 8]]],
  "Ø": [[[3, 0], [4.9, 0.7], [6, 2.3], [6, 5.7], [4.9, 7.3], [3, 8], [1.1, 7.3], [0, 5.7], [0, 2.3], [1.1, 0.7], [3, 0]], [[0.7, 8], [5.3, 0]]],
  "0": [[[2.7, 0], [4.3, 0.8], [5, 2.5], [5, 5.5], [4.3, 7.2], [2.7, 8], [1.1, 7.2], [0.4, 5.5], [0.4, 2.5], [1.1, 0.8], [2.7, 0]]],
  "1": [[[1.5, 1.7], [3.4, 0], [3.4, 8]], [[1.3, 8], [5.1, 8]]],
  "2": [[[0.6, 1.9], [1.8, 0.3], [3.6, 0.3], [4.9, 1.8], [4.7, 3.5], [0.6, 8], [5.1, 8]]],
  "3": [[[0.8, 1.4], [2.3, 0.2], [3.9, 0.2], [4.9, 1.6], [4.3, 3.2], [2.7, 3.9]], [[2.7, 3.9], [4.3, 4.5], [5, 6], [4.1, 7.6], [2.3, 7.9], [0.7, 6.7]]],
  "4": [[[4.6, 8], [4.6, 0], [0.4, 5.9], [5.7, 5.9]]],
  "5": [[[5, 0], [1.2, 0], [0.9, 3.5], [2.9, 2.9], [4.5, 3.5], [5, 5.4], [4.3, 7.2], [2.5, 7.9], [0.7, 6.9]]],
  "6": [[[4.7, 1.7], [3.3, 0.3], [1.9, 1], [0.9, 3.1], [0.7, 5.6], [1.6, 7.4], [3.1, 7.9], [4.6, 7], [4.9, 5.2], [4.1, 3.9], [2.5, 3.7], [0.9, 4.7]]],
  "7": [[[0.5, 0], [5.3, 0], [2.3, 8]]],
  "8": [[[3, 3.9], [1.7, 3.4], [1, 2.1], [1.5, 0.7], [3, 0.2], [4.5, 0.7], [5, 2.1], [4.3, 3.4], [3, 3.9]], [[3, 3.9], [1.3, 4.6], [0.7, 6.1], [1.5, 7.6], [3, 8], [4.5, 7.6], [5.3, 6.1], [4.7, 4.6], [3, 3.9]]],
  "9": [[[1.3, 6.3], [2.7, 7.7], [4.1, 7], [5.1, 4.9], [5.3, 2.4], [4.4, 0.6], [2.9, 0.1], [1.4, 1], [1.1, 2.8], [1.9, 4.1], [3.5, 4.3], [5.1, 3.3]]],
  ".": [[[2.9, 7.5], [2.9, 7.9]]],
  ",": [[[3, 7.1], [2.3, 8.7]]],
  "-": [[[1.1, 4.1], [4.7, 4.1]]],
  "–": [[[0.5, 4.1], [5.5, 4.1]]],
  "—": [[[0.2, 4.1], [5.8, 4.1]]],
  "/": [[[1.2, 8.2], [4.9, -0.2]]],
  ":": [[[2.9, 2.5], [2.9, 2.9]], [[2.9, 6.7], [2.9, 7.1]]],
  ";": [[[2.9, 2.5], [2.9, 2.9]], [[3, 7.1], [2.3, 8.7]]],
  "(": [[[4.7, 0.5], [2.9, 2.4], [2.9, 5.6], [4.7, 7.5]]],
  ")": [[[1.3, 0.5], [3.1, 2.4], [3.1, 5.6], [1.3, 7.5]]],
  "<": [[[5.1, 1], [1.5, 4.1], [5.1, 7.2]]],
  ">": [[[0.9, 1], [4.5, 4.1], [0.9, 7.2]]],
  "·": [[[2.9, 4], [2.9, 4.4]]],
  "'": [[[3.1, 0.3], [2.5, 2]]],
  "+": [[[3, 1.6], [3, 6.4]], [[0.9, 4], [5.1, 4]]],
  " ": [],
};
const ADV = 6; // glyph grid width
function glyphFor(ch: string): Glyph {
  return GLYPHS[ch] ?? GLYPHS[ch.toUpperCase()] ?? [];
}
function drawGlyph(ch: string, x: number, y: number, scale: number, c: RGB, width: number, a = 1): void {
  for (const line of glyphFor(ch))
    polyline(line.map(([gx, gy]) => [x + gx * scale, y + gy * scale]), c, width, a);
}
// size = cap height in px. tracking = extra px between glyphs.
// Returns the width of the rendered string.
function textWidth(s: string, size: number, tracking: number, mono = false): number {
  const scale = size / 8;
  if (mono) return s.length * (ADV * scale + tracking);
  let w = 0;
  for (const ch of s) w += ADV * scale + tracking;
  return w - (s.length ? tracking : 0);
}
function drawText(s: string, x: number, y: number, size: number, c: RGB, opts: { weight?: number; tracking?: number; align?: "left" | "center" | "right"; alpha?: number; mono?: boolean } = {}): number {
  const tracking = opts.tracking ?? size * 0.08;
  const scale = size / 8;
  const width = Math.max(1.1, (opts.weight ?? 1) * size * 0.115);
  let cx = x;
  if (opts.align === "center") cx = x - textWidth(s, size, tracking, opts.mono) / 2;
  if (opts.align === "right") cx = x - textWidth(s, size, tracking, opts.mono);
  const up = s.toUpperCase();
  for (const ch of up) {
    drawGlyph(ch, cx, y, scale, c, width, opts.alpha ?? 1);
    cx += ADV * scale + tracking;
  }
  return textWidth(s, size, tracking, opts.mono);
}

// ---------------------------------------------------------------- palette
const PAPER: RGB = [246, 241, 227];
const PAPER_R: RGB = [243, 239, 226];
const COVER: RGB = [16, 56, 50];
const INK: RGB = [33, 45, 40];
const LABEL: RGB = [92, 112, 102];
const RULE: RGB = [168, 178, 156];
const TEAL: RGB = [20, 68, 63];
const GOLD: RGB = [169, 126, 47];
const GUIL: RGB = [120, 165, 155];
const BLUE_STAMP: RGB = [43, 76, 154];
const VIOLET_STAMP: RGB = [106, 61, 153];
const RED_STAMP: RGB = [168, 54, 44];
const GREEN_STAMP: RGB = [44, 106, 76];

// ---------------------------------------------------------------- guilloche
// Fine interlaced sine work, printed pale like real security paper.
function guillocheBand(x: number, y: number, w: number, c: RGB, a: number): void {
  for (const [amp, per, ph] of [[3.2, 26, 0], [3.2, 26, Math.PI], [2.1, 17, 1.2]] as const) {
    const pts: number[][] = [];
    for (let dx = 0; dx <= w; dx += 3) pts.push([x + dx, y + amp * Math.sin((dx / per) * Math.PI * 2 + ph)]);
    polyline(pts, c, 0.8, a);
  }
}
function guillocheRosette(cx: number, cy: number, r: number, c: RGB, a: number): void {
  for (const [rr, k, ph] of [[1, 7, 0], [0.82, 9, 0.7], [0.6, 11, 1.9], [0.38, 13, 0.3]] as const) {
    const pts: number[][] = [];
    for (let t = 0; t <= Math.PI * 2 + 0.02; t += 0.03) {
      const rad = r * rr * (1 + 0.13 * Math.sin(k * t + ph));
      pts.push([cx + rad * Math.cos(t), cy + rad * Math.sin(t) * 0.92]);
    }
    polyline(pts, c, 0.8, a);
  }
}

// ---------------------------------------------------------------- emblem
// The arms of Ostmara: a lighthouse over three wave-lines, a star above,
// two sprigs at the sides. Drawn in line, in the deep teal of the cover.
function drawEmblem(x: number, y: number, s: number, c: RGB): void {
  const u = s / 100; // unit
  const P = (pts: number[][], w: number, close = false) =>
    polyline(pts.map(([a, b]) => [x + a * u, y + b * u]), c, Math.max(1.1, 1.7 * u), 0.92, close);
  // shield
  P([[22, 6], [78, 6], [78, 52], [50, 92], [22, 52], [22, 6]], 1.9, true);
  P([[27, 11], [73, 11], [73, 50], [50, 84], [27, 50], [27, 11]], 0.8, true);
  // star above the light
  const star: number[][] = [];
  for (let i = 0; i < 10; i++) {
    const ang = -Math.PI / 2 + (i * Math.PI) / 5;
    const rad = i % 2 === 0 ? 6.5 : 2.7;
    star.push([50 + rad * Math.cos(ang), 21 + rad * Math.sin(ang)]);
  }
  fillPoly(star.map(([a, b]) => [x + a * u, y + b * u]), GOLD, 0.95);
  // lighthouse: tapered tower, gallery, lamp room, beams
  P([[44, 62], [47, 34], [53, 34], [56, 62]], 1.6, true);
  P([[45.5, 48], [54.5, 48]], 1.1);
  P([[46.5, 40], [53.5, 40]], 1.1);
  P([[45, 34], [55, 34], [55, 30], [45, 30], [45, 34]], 1.3, true);
  fillCircle(x + 50 * u, y + 32 * u, 1.8 * u, GOLD, 0.95);
  P([[45, 31], [33, 25]], 1.0); P([[45, 33], [34, 37]], 1.0);
  P([[55, 31], [67, 25]], 1.0); P([[55, 33], [66, 37]], 1.0);
  // waves
  for (const wy of [68, 75, 82]) {
    const pts: number[][] = [];
    for (let dx = 0; dx <= 44; dx += 2.5) pts.push([28 + dx, wy + 2.2 * Math.sin((dx / 44) * Math.PI * 3 + wy)]);
    P(pts, 1.2);
  }
  // side sprigs
  for (const sx of [12, 88]) {
    P([[sx, 78], [sx + (sx < 50 ? 3 : -3), 58], [sx, 38]], 1.1);
    for (const ly of [48, 58, 68]) fillEllipse(x + sx * u, y + ly * u, 2.4 * u, 1.3 * u, c, 0.75);
  }
}

// ---------------------------------------------------------------- layers
// Stamps and the visa sticker are printed into small RGBA layers first,
// then set down rotated, with uneven ink, the way a real stamp lands.
interface Layer { w: number; h: number; d: Uint8Array }
function newLayer(w: number, h: number): Layer { return { w, h, d: new Uint8Array(w * h * 4) }; }
function lBlend(L: Layer, x: number, y: number, c: RGB, a: number): void {
  const xi = Math.round(x), yi = Math.round(y);
  if (xi < 0 || yi < 0 || xi >= L.w || yi >= L.h || a <= 0) return;
  const i = (yi * L.w + xi) * 4;
  const cur = L.d[i + 3] / 255;
  const na = a + cur * (1 - a); // proper source-over
  if (na <= 0) return;
  for (let k = 0; k < 3; k++) L.d[i + k] = Math.round((c[k] * a + L.d[i + k] * cur * (1 - a)) / na);
  L.d[i + 3] = Math.round(na * 255);
}
function lLine(L: Layer, x0: number, y0: number, x1: number, y1: number, c: RGB, width: number, a = 1): void {
  const dx = x1 - x0, dy = y1 - y0;
  const steps = Math.max(Math.ceil(Math.max(Math.abs(dx), Math.abs(dy)) * 2), 1);
  const r = width / 2;
  for (let s = 0; s <= steps; s++) {
    const x = x0 + (dx * s) / steps, y = y0 + (dy * s) / steps;
    for (let oy = -r; oy <= r; oy += 0.5)
      for (let ox = -r; ox <= r; ox += 0.5)
        if (ox * ox + oy * oy <= r * r + 0.3) lBlend(L, x + ox, y + oy, c, a);
  }
}
function lPoly(L: Layer, pts: number[][], c: RGB, width: number, a = 1, close = false): void {
  for (let i = 0; i + 1 < pts.length; i++) lLine(L, pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1], c, width, a);
  if (close && pts.length > 2) lLine(L, pts[pts.length - 1][0], pts[pts.length - 1][1], pts[0][0], pts[0][1], c, width, a);
}
function lEllipse(L: Layer, cx: number, cy: number, rx: number, ry: number, c: RGB, width: number, a = 1): void {
  const pts: number[][] = [];
  for (let t = 0; t <= Math.PI * 2 + 0.01; t += 0.04) pts.push([cx + rx * Math.cos(t), cy + ry * Math.sin(t)]);
  lPoly(L, pts, c, width, a);
}
function lFillRect(L: Layer, x: number, y: number, w: number, h: number, c: RGB, a = 1): void {
  for (let yy = Math.round(y); yy < Math.round(y + h); yy++)
    for (let xx = Math.round(x); xx < Math.round(x + w); xx++) lBlend(L, xx, yy, c, a);
}
function lText(L: Layer, s: string, x: number, y: number, size: number, c: RGB, opts: { weight?: number; tracking?: number; align?: "left" | "center" | "right"; alpha?: number } = {}): void {
  const tracking = opts.tracking ?? size * 0.08;
  const scale = size / 8;
  const width = Math.max(1, (opts.weight ?? 1) * size * 0.115);
  const wpx = textWidth(s, size, tracking);
  let cx = x;
  if (opts.align === "center") cx = x - wpx / 2;
  if (opts.align === "right") cx = x - wpx;
  for (const ch of s.toUpperCase()) {
    for (const line of glyphFor(ch))
      lPoly(L, line.map(([gx, gy]) => [cx + gx * scale, y + gy * scale]), c, width, opts.alpha ?? 1);
    cx += ADV * scale + tracking;
  }
}
function blit(L: Layer, cx: number, cy: number, angleDeg: number, opacity = 1): void {
  const ang = (angleDeg * Math.PI) / 180;
  const cos = Math.cos(ang), sin = Math.sin(ang);
  const hw = L.w / 2, hh = L.h / 2;
  for (let y = 0; y < L.h; y++)
    for (let x = 0; x < L.w; x++) {
      const i = (y * L.w + x) * 4;
      const a0 = L.d[i + 3] / 255;
      if (a0 <= 0.01) continue;
      const dx = x - hw, dy = y - hh;
      const tx = cx + dx * cos - dy * sin, ty = cy + dx * sin + dy * cos;
      const ink = 0.78 + rand() * 0.3; // uneven inking
      blend(tx, ty, [L.d[i], L.d[i + 1], L.d[i + 2]], a0 * opacity * ink);
    }
}

// ---------------------------------------------------------------- portrait
// The holder, drawn as a flat printed portrait: Tomas Eirik Havlund, 38,
// keeper of the Third Light at Vesthavn — greying fair hair, a short
// storm-grey beard, a fisherman's sweater over a collared shirt.
function drawPortrait(x: number, y: number): void {
  const SKIN: RGB = [236, 193, 152];
  const SKIN_D: RGB = [219, 164, 116];
  const SKIN_L: RGB = [246, 214, 176];
  const HAIR: RGB = [110, 100, 88];
  const HAIR_L: RGB = [146, 137, 122];
  const BEARD: RGB = [133, 124, 110];
  const BEARD_D: RGB = [106, 98, 86];
  const SWEATER: RGB = [46, 62, 76];
  const SHIRT: RGB = [216, 212, 200];
  // backdrop: plain studio grey-blue, lighter in the middle
  fillRect(x, y, 148, 188, [198, 208, 205]);
  for (let i = 0; i < 148; i++) {
    const a = Math.abs(i - 74) / 74;
    fillRect(x + i, y, 1, 188, [168, 180, 178], a * 0.35);
  }
  for (let i = 0; i < 40; i++) fillRect(x, y + i, 148, 1, [226, 232, 229], (1 - i / 40) * 0.3);
  const L = (pts: number[][]) => pts.map(([a, b]) => [x + a, y + b]);
  // shoulders and sweater
  fillPoly(L([[6, 188], [14, 146], [30, 126], [52, 116], [96, 116], [118, 126], [134, 146], [142, 188]]), SWEATER);
  for (let i = 0; i < 46; i++) { // knit texture: short diagonal ticks
    const kx = 14 + rand() * 120, ky = 132 + rand() * 50;
    strokeLine(x + kx, y + ky, x + kx + 3.4, y + ky + 2.2, [70, 88, 102], 0.9, 0.35);
  }
  // shirt collar and sweater V
  fillPoly(L([[58, 118], [74, 140], [90, 118], [84, 112], [64, 112]]), SHIRT);
  polyline(L([[58, 118], [74, 140], [90, 118]]), [30, 42, 54], 2.2, 0.8);
  // neck with jaw shadow
  fillPoly(L([[62, 92], [86, 92], [86, 120], [62, 120]]), SKIN_D);
  fillEllipse(x + 74, y + 98, 13, 6, [196, 140, 96], 0.55);
  // ears
  fillEllipse(x + 40, y + 72, 6.5, 10.5, SKIN, 1);
  fillEllipse(x + 108, y + 72, 6.5, 10.5, SKIN, 1);
  fillEllipse(x + 41, y + 73, 3, 6, SKIN_D, 0.7);
  fillEllipse(x + 107, y + 73, 3, 6, SKIN_D, 0.7);
  // face
  fillEllipse(x + 74, y + 64, 33.5, 40, SKIN, 1);
  fillEllipse(x + 88, y + 68, 24, 36, SKIN_D, 0.28); // shade the right plane
  fillEllipse(x + 58, y + 56, 18, 28, SKIN_L, 0.3); // light the left plane
  // beard: jaw and chin, dipping clear of the mouth
  fillPoly(L([[44, 72], [47, 92], [55, 106], [66, 114], [74, 116], [82, 114], [93, 106], [101, 92], [104, 72], [102, 94], [95, 103], [85, 98], [74, 100], [63, 98], [53, 103], [46, 94]]), BEARD);
  for (let i = 0; i < 60; i++) { // beard streaks, fair and dark
    const bx = 50 + rand() * 48, by = 84 + rand() * 26;
    strokeLine(x + bx, y + by, x + bx + (rand() * 2 - 1), y + by + 3 + rand() * 4, rand() > 0.5 ? HAIR_L : BEARD_D, 0.9, 0.5);
  }
  // mouth, just clear of the beard
  strokeLine(x + 65, y + 94, x + 83, y + 94, [150, 96, 78], 1.7, 0.85);
  strokeLine(x + 68, y + 97.4, x + 80, y + 97.4, [196, 140, 116], 1.1, 0.6);
  // moustache
  strokeBezier([x + 59, y + 90], [x + 65, y + 85.5], [x + 73, y + 90.5], BEARD_D, 3.1, 0.95);
  strokeBezier([x + 89, y + 90], [x + 83, y + 85.5], [x + 75, y + 90.5], BEARD_D, 3.1, 0.95);
  strokeBezier([x + 62, y + 88.6], [x + 67, y + 85.8], [x + 72, y + 89], HAIR_L, 1.2, 0.7);
  // nose: bridge light, side shade, nostril shadow
  strokeLine(x + 71, y + 56, x + 70, y + 76, SKIN_L, 2.4, 0.5);
  strokeLine(x + 77.5, y + 62, x + 79.5, y + 79, [206, 148, 102], 2, 0.55);
  strokeBezier([x + 66, y + 84], [x + 70, y + 87.5], [x + 74, y + 85.5], [198, 138, 94], 1.6, 0.7);
  strokeBezier([x + 74, y + 85.5], [x + 79, y + 87.5], [x + 83, y + 84], [198, 138, 94], 1.6, 0.7);
  // eyes: slate-grey, level, unsmiling — a passport face
  for (const ex of [59.5, 88.5]) {
    fillEllipse(x + ex, y + 61, 8.4, 4.4, [240, 236, 226], 1);
    fillCircle(x + ex, y + 61.4, 3.2, [70, 88, 96], 1);
    fillCircle(x + ex, y + 61.4, 1.55, [24, 30, 34], 1);
    fillCircle(x + ex + 1.1, y + 60.2, 0.8, [250, 250, 246], 0.9);
    strokeBezier([x + ex - 8.6, y + 60], [x + ex, y + 55.6], [x + ex + 8.6, y + 60], [84, 62, 44], 1.7, 0.9);
    strokeLine(x + ex - 7, y + 65.8, x + ex + 7, y + 65.8, [206, 156, 112], 1, 0.5);
  }
  // brows, greying and straight
  strokeBezier([x + 49, y + 51.5], [x + 59, y + 48.6], [x + 69.5, y + 50.5], HAIR, 3.6, 0.95);
  strokeBezier([x + 78.5, y + 50.5], [x + 89, y + 48.6], [x + 99, y + 51.5], HAIR, 3.6, 0.95);
  strokeBezier([x + 52, y + 50.6], [x + 59, y + 49], [x + 66, y + 50], HAIR_L, 1.2, 0.7);
  // hair: short, fair going grey, parted on his left
  fillPoly(L([[40, 60], [38, 40], [44, 24], [56, 14], [72, 10], [88, 12], [100, 20], [106, 34], [107, 56], [103, 40], [96, 28], [82, 23], [64, 24], [50, 31], [43, 44]]), HAIR);
  for (let i = 0; i < 26; i++) { // combed strands, kept inside the silhouette
    const hx = 48 + rand() * 46, hy = 17 + rand() * 13;
    strokeBezier([x + hx, y + hy], [x + hx + 4, y + hy + 1.6], [x + hx + 7, y + hy + 5], rand() > 0.45 ? HAIR_L : [88, 80, 68], 1, 0.55);
  }
  strokeLine(x + 41, y + 58, x + 41, y + 44, HAIR, 3, 0.8); // side hair over the ears
  strokeLine(x + 107, y + 58, x + 107, y + 44, HAIR, 3, 0.8);
  // forehead lines, faint
  strokeBezier([x + 56, y + 38], [x + 74, y + 35.4], [x + 92, y + 38], [214, 168, 122], 1.1, 0.4);
  // print grain over the photograph
  for (let i = 0; i < 900; i++) {
    const gx = x + rand() * 148, gy = y + rand() * 188;
    blend(gx, gy, rand() > 0.5 ? [255, 255, 250] : [40, 44, 44], 0.05);
  }
  // photo border
  polyline([[x, y], [x + 148, y], [x + 148, y + 188], [x, y + 188]], [120, 128, 122], 1.2, 0.9, true);
}

// ---------------------------------------------------------------- signature
// A practised hand: "T. Havlund" with a long underline flourish.
function drawSignature(x: number, y: number): void {
  const c: RGB = [38, 52, 96];
  const S = 1.9; // scale: the hand writes large, across the whole row
  const B = (p0: number[], p1: number[], p2: number[], w: number) =>
    strokeBezier([x + p0[0] * S, y + p0[1] * S], [x + p1[0] * S, y + p1[1] * S], [x + p2[0] * S, y + p2[1] * S], c, w, 0.9);
  B([0, 16], [7, -6], [13, 2], 2.1); // T stem
  strokeLine(x + 1 * S, y - 3 * S, x + 13 * S, y - 4.5 * S, c, 1.7, 0.9); // T bar
  B([17, 14], [20, 4], [24, 13], 1.7); // a
  B([26, 6], [29, 15], [33, 7], 1.7); // v
  B([36, -2], [35, 10], [38, 14], 1.7); // l
  B([41, 8], [43, 15], [47, 8], 1.7); // u
  B([50, 14], [52, 5], [57, 9], 1.7); // n
  B([66, -3], [60, 8], [63, 14], 1.7); // d
  B([-3, 21], [30, 17], [72, 20], 1.5); // flourish
}

// ---------------------------------------------------------------- stamps
// Border stamps of the three ferry neighbours. Each is printed into a
// layer, then struck at a slight angle with uneven ink.
function ovalStamp(top: string, mid: string, date: string, bot: string, ink: RGB): Layer {
  const L = newLayer(264, 184);
  lEllipse(L, 132, 92, 124, 84, ink, 4.5, 0.96);
  lEllipse(L, 132, 92, 113, 74, ink, 1.6, 0.9);
  lText(L, top, 132, 34, 20, ink, { weight: 1.5, align: "center" });
  lText(L, mid, 132, 62, 16.5, ink, { weight: 1.2, align: "center" });
  lText(L, date, 132, 92, 23, ink, { weight: 1.7, align: "center" });
  lText(L, bot, 132, 128, 15, ink, { weight: 1.2, align: "center" });
  return L;
}
function rectStamp(top: string, mid: string, date: string, bot: string, ink: RGB): Layer {
  const L = newLayer(272, 168);
  lPoly(L, [[7, 7], [265, 7], [265, 161], [7, 161]], ink, 4.5, 0.96, true);
  lPoly(L, [[16, 16], [256, 16], [256, 152], [16, 152]], ink, 1.5, 0.85, true);
  lText(L, top, 136, 30, 20, ink, { weight: 1.5, align: "center" });
  lText(L, mid, 136, 58, 16, ink, { weight: 1.2, align: "center" });
  lText(L, date, 136, 88, 23, ink, { weight: 1.7, align: "center" });
  lText(L, bot, 136, 124, 14.5, ink, { weight: 1.2, align: "center" });
  return L;
}
function roundStamp(top: string, mid: string, date: string, bot: string, ink: RGB): Layer {
  const L = newLayer(206, 206);
  lEllipse(L, 103, 103, 96, 96, ink, 4.5, 0.96);
  lEllipse(L, 103, 103, 85, 85, ink, 1.6, 0.9);
  lText(L, top, 103, 48, 19, ink, { weight: 1.5, align: "center" });
  lText(L, mid, 103, 74, 15, ink, { weight: 1.2, align: "center" });
  lText(L, date, 103, 100, 20, ink, { weight: 1.7, align: "center" });
  lText(L, bot, 103, 130, 13.5, ink, { weight: 1.2, align: "center" });
  return L;
}
function duesStamp(ink: RGB): Layer {
  const L = newLayer(196, 196);
  lEllipse(L, 98, 98, 91, 91, ink, 4, 0.96);
  lEllipse(L, 98, 98, 71, 71, ink, 1.5, 0.85);
  lText(L, "HARBOUR", 98, 36, 16, ink, { weight: 1.4, align: "center" });
  lText(L, "DUES PAID", 98, 58, 16, ink, { weight: 1.4, align: "center" });
  lText(L, "40 TRN", 98, 86, 21, ink, { weight: 1.7, align: "center" });
  lText(L, "VESTHAVN", 98, 118, 13.5, ink, { weight: 1.2, align: "center" });
  lText(L, "12 SEP 2024", 98, 138, 12.5, ink, { weight: 1.2, align: "center" });
  return L;
}
// The Danvik visa sticker: printed, gummed, placed straight-ish by a clerk.
function visaSticker(): Layer {
  const L = newLayer(430, 216);
  lFillRect(L, 2, 2, 426, 212, [238, 240, 224], 1);
  lPoly(L, [[4, 4], [426, 4], [426, 212], [4, 212]], [51, 82, 63], 4, 1, true);
  lPoly(L, [[12, 12], [418, 12], [418, 204], [12, 204]], [51, 82, 63], 1.4, 0.9, true);
  lFillRect(L, 12, 12, 406, 44, [51, 82, 63], 1);
  lText(L, "KINGDOM OF DANVIK · VISUM", 215, 24, 17.5, [240, 242, 228], { weight: 1.5, align: "center" });
  lText(L, "HAVLUND, TOMAS EIRIK", 24, 74, 18, [40, 48, 44], { weight: 1.4 });
  lText(L, "SERVICE — THIRD LIGHT EXCHANGE", 24, 108, 15, [40, 48, 44], { weight: 1.2 });
  lText(L, "VALID 01 SEP 2024 – 01 MAR 2025", 24, 140, 14.5, [40, 48, 44], { weight: 1.2 });
  lText(L, "FEE: WAIVED (SERVICE TRAVEL)", 24, 172, 14.5, [40, 48, 44], { weight: 1.2 });
  return L;
}

// ---------------------------------------------------------------- MRZ
// ICAO 9303 machine-readable zone with true 7-3-1 check digits.
function mrzCheck(field: string): string {
  const weights = [7, 3, 1];
  let sum = 0;
  for (let i = 0; i < field.length; i++) {
    const ch = field[i];
    let v = 0;
    if (ch >= "0" && ch <= "9") v = ch.charCodeAt(0) - 48;
    else if (ch >= "A" && ch <= "Z") v = ch.charCodeAt(0) - 55;
    sum += v * weights[i % 3];
  }
  return String(sum % 10);
}
function buildMRZ(): [string, string] {
  const line1raw = "P<OSMHAVLUND<<TOMAS<EIRIK";
  const line1 = (line1raw + "<".repeat(44)).slice(0, 44);
  const doc = "47209315<";
  const nat = "OSM";
  const dob = "880314";
  const sex = "M";
  const exp = "310603";
  const personal = "140388221<<<<<";
  const body = doc + mrzCheck(doc) + nat + dob + mrzCheck(dob) + sex + exp + mrzCheck(exp) + personal;
  const composite = mrzCheck(body.slice(0, 10) + body.slice(13, 20) + body.slice(21, 43));
  return [line1, body + composite];
}
// Perforated passport number down the visa page, as dot-matrix holes.
const DOT5: Record<string, string[]> = {
  "0": ["111", "101", "101", "101", "111"], "1": ["010", "010", "010", "010", "010"],
  "2": ["111", "001", "111", "100", "111"], "3": ["111", "001", "111", "001", "111"],
  "4": ["101", "101", "111", "001", "001"], "5": ["111", "100", "111", "001", "111"],
  "6": ["111", "100", "111", "101", "111"], "7": ["111", "001", "001", "010", "010"],
  "8": ["111", "101", "111", "101", "111"], "9": ["111", "101", "111", "001", "111"],
};
function perforate(x: number, y: number, digits: string): void {
  let cy = y;
  for (const dgt of digits) {
    const g = DOT5[dgt];
    for (let r = 0; r < 5; r++)
      for (let c = 0; c < 3; c++)
        if (g[r][c] === "1") fillCircle(x + c * 5.4, cy + r * 5.4, 1.7, [154, 148, 134], 0.85);
    cy += 36;
  }
}

// ---------------------------------------------------------------- pages
function field(x: number, y: number, w: number, label: string, value: string, vsize = 15): void {
  drawText(label, x, y, 8.5, LABEL, { tracking: 0.7 });
  drawText(value, x, y + 13, vsize, INK, { weight: 1.3, tracking: 0.4 });
  strokeLine(x, y + 38, x + w, y + 38, RULE, 0.9, 0.75);
}
function compose(): void {
  fillAll(COVER);
  fillRect(22, 24, 996, 996, [0, 0, 0], 0.35); // the spread's soft shadow
  // page stock
  fillRect(14, 14, 498, 996, PAPER);
  fillRect(512, 14, 498, 996, PAPER_R);
  for (let i = 0; i < 7000; i++) {
    const gx = 14 + rand() * 996, gy = 14 + rand() * 996;
    blend(gx, gy, rand() > 0.5 ? [255, 255, 252] : [120, 116, 96], 0.045);
  }
  polyline([[14, 14], [512, 14], [512, 1010], [14, 1010]], [110, 114, 104], 1.2, 0.5, true);
  polyline([[512, 14], [1010, 14], [1010, 1010], [512, 1010]], [110, 114, 104], 1.2, 0.5, true);
  guillocheRosette(263, 480, 120, GUIL, 0.05);
  guillocheRosette(761, 520, 175, GUIL, 0.045);

  // ------------------------------------------------ left page: the data page
  drawEmblem(46, 34, 68, TEAL);
  drawText("OSTMARA", 128, 42, 30, TEAL, { weight: 1.6, tracking: 3 });
  drawText("REPUBLIC OF OSTMARA · OSTMARA RIKI", 128, 84, 9.5, LABEL, { tracking: 0.8 });
  drawText("PASSPORT", 478, 42, 19, TEAL, { weight: 1.5, align: "right", tracking: 1.6 });
  drawText("VEGABREF", 478, 70, 10.5, LABEL, { align: "right", tracking: 1.2 });
  strokeLine(48, 120, 478, 120, TEAL, 1.6, 0.9);
  guillocheBand(48, 132, 430, GUIL, 0.4);

  drawPortrait(48, 168);
  const FX = 216, FEND = 478;
  // three small columns beside the photograph
  drawText("TYPE", FX, 168, 8.5, LABEL, { tracking: 0.7 });
  drawText("P", FX, 181, 15, INK, { weight: 1.3 });
  strokeLine(FX, 206, FX + 46, 206, RULE, 0.9, 0.75);
  drawText("CODE", 282, 168, 8.5, LABEL, { tracking: 0.7 });
  drawText("OSM", 282, 181, 15, INK, { weight: 1.3 });
  strokeLine(282, 206, 282 + 56, 206, RULE, 0.9, 0.75);
  drawText("PASSPORT NO", 356, 168, 8.5, LABEL, { tracking: 0.5 });
  drawText("47 209 315", 356, 181, 13.5, INK, { weight: 1.3 });
  strokeLine(356, 206, FEND, 206, RULE, 0.9, 0.75);
  field(FX, 215, FEND - FX, "SURNAME / ETTERNAVN", "HAVLUND");
  field(FX, 262, FEND - FX, "GIVEN NAMES / FORNAVN", "TOMAS EIRIK");
  field(FX, 309, FEND - FX, "NATIONALITY / RIKSBORGAR", "OSTMARAN");
  // full-width rows below the photograph
  field(48, 382, 240, "DATE OF BIRTH / FØDSELSDATO", "14 MAR 1988");
  field(330, 382, 148, "SEX / KJØNN", "M");
  field(48, 429, 430, "PLACE OF BIRTH / FØDESTAD", "HAVNSTAD");
  field(48, 476, 430, "PROFESSION / STARF", "LIGHTHOUSE KEEPER");
  field(48, 523, 240, "DATE OF ISSUE / UTGÁFUDAGUR", "03 JUN 2021");
  field(330, 523, 148, "EXPIRY / GILDISTIMI", "03 JUN 2031", 13.5);
  field(48, 570, 430, "AUTHORITY / UTGÁFUYFIRVALD", "HAVNSTAD · NATIONAL REGISTRY", 13);
  // signature
  drawText("HOLDER'S SIGNATURE / UNDIRSKRIFT", 48, 622, 8.5, LABEL, { tracking: 0.7 });
  drawSignature(56, 640);
  strokeLine(48, 676, 478, 676, RULE, 0.9, 0.75);
  // observations: the one telling piece of paperwork
  polyline([[48, 698], [478, 698], [478, 820], [48, 820]], TEAL, 1.2, 0.8, true);
  drawText("OBSERVATIONS · ATHUGASEMDIR", 60, 710, 9, TEAL, { weight: 1.3, tracking: 0.8 });
  const obs: RGB = [52, 62, 56];
  drawText("THE BEARER IS KEEPER OF THE THIRD LIGHT,", 60, 734, 10, obs, { tracking: 0.3 });
  drawText("VESTHAVN. IN STORM SEASON HE TRAVELS ON THE", 60, 754, 10, obs, { tracking: 0.3 });
  drawText("REPUBLIC'S SERVICE AND IS ENTITLED TO FREE", 60, 774, 10, obs, { tracking: 0.3 });
  drawText("PASSAGE ON ALL STATE FERRIES.", 60, 794, 10, obs, { tracking: 0.3 });
  drawText("THIS DOCUMENT CONTAINS 32 PAGES", 263, 848, 8.5, LABEL, { align: "center", tracking: 1 });
  // machine-readable zone
  fillRect(28, 896, 470, 92, [214, 224, 208], 0.4);
  const [m1, m2] = buildMRZ();
  drawText(m1, 263, 910, 12.4, [29, 42, 38], { mono: true, tracking: 1.0, weight: 1.15, align: "center" });
  drawText(m2, 263, 942, 12.4, [29, 42, 38], { mono: true, tracking: 1.0, weight: 1.15, align: "center" });

  // ------------------------------------------------ right page: visas & stamps
  drawText("VISAS", 546, 42, 19, TEAL, { weight: 1.5, tracking: 1.6 });
  drawText("VISIR", 546, 70, 10.5, LABEL, { tracking: 1.2 });
  drawText("7", 976, 46, 15, LABEL, { align: "right" });
  strokeLine(546, 94, 976, 94, TEAL, 1.4, 0.9);
  guillocheBand(546, 105, 430, GUIL, 0.4);
  blit(visaSticker(), 761, 246, -1.2, 0.98);
  // the travel history, in the order it happened
  blit(ovalStamp("OSTMARA", "VESTHAVN", "12 SEP 2024", "UTGANG · EXIT", BLUE_STAMP), 640, 450, 4, 0.92);
  blit(rectStamp("DANVIK", "SKAGENBY", "12 SEP 2024", "INNREISE · ENTRY", VIOLET_STAMP), 858, 452, -3, 0.92);
  blit(rectStamp("DANVIK", "SKAGENBY", "19 SEP 2024", "UTREISE · EXIT", VIOLET_STAMP), 644, 606, 2, 0.92);
  blit(ovalStamp("OSTMARA", "VESTHAVN", "19 SEP 2024", "INNKOMME · ENTRY", BLUE_STAMP), 862, 612, -5, 0.92);
  blit(ovalStamp("OSTMARA", "VESTHAVN", "02 MAY 2026", "UTGANG · EXIT", BLUE_STAMP), 642, 772, 3, 0.92);
  blit(roundStamp("SELAND", "PORT AUREL", "02 MAY 2026", "ARRIVAL", RED_STAMP), 866, 778, -4, 0.92);
  blit(roundStamp("SELAND", "PORT AUREL", "09 MAY 2026", "DEPARTURE", RED_STAMP), 640, 908, 6, 0.92);
  blit(duesStamp(GREEN_STAMP), 866, 912, 8, 0.9);
  perforate(990, 150, "47209315");

  // centre seam shading
  for (let i = 0; i < 18; i++) {
    fillRect(512 - 18 + i, 14, 1, 996, [40, 42, 36], (i / 18) * 0.14);
    fillRect(512 + 17 - i, 14, 1, 996, [40, 42, 36], (i / 18) * 0.1);
  }
}
// One softening pass so the print sits like ink on paper, not pixels.
function soften(): void {
  const src = new Uint8Array(px);
  for (let y = 1; y < H - 1; y++)
    for (let x = 1; x < W - 1; x++) {
      const i = (y * W + x) * 3;
      for (let k = 0; k < 3; k++) {
        const sum = src[i + k] * 4 + src[i - 3 + k] + src[i + 3 + k] + src[i - W * 3 + k] + src[i + W * 3 + k];
        px[i + k] = Math.round(sum / 8);
      }
    }
}

compose();
soften();
mkdirSync("/output", { recursive: true });
const png = encodePNG(W, H, px);
writeFileSync("/output/entry.png", png);
console.log("entry.png bytes:", png.length);
