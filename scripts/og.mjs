/**
 * Generates the 1200x630 social card (assets/og.png) with zero dependencies:
 * a hand-rolled PNG encoder (node:zlib for deflate) and a 5x7 pixel font.
 * Aesthetic: film-strip sprocket holes, gold marquee type on near-black.
 */
import zlib from "node:zlib";

const W = 1200;
const H = 630;

// ----- 5x7 pixel font (only the glyphs we need) ------------------------
const FONT = {
  A: ["01110", "10001", "10001", "11111", "10001", "10001", "10001"],
  C: ["01110", "10001", "10000", "10000", "10000", "10001", "01110"],
  D: ["11110", "10001", "10001", "10001", "10001", "10001", "11110"],
  E: ["11111", "10000", "10000", "11110", "10000", "10000", "11111"],
  F: ["11111", "10000", "10000", "11110", "10000", "10000", "10000"],
  G: ["01110", "10001", "10000", "10111", "10001", "10001", "01111"],
  H: ["10001", "10001", "10001", "11111", "10001", "10001", "10001"],
  I: ["11111", "00100", "00100", "00100", "00100", "00100", "11111"],
  K: ["10001", "10010", "10100", "11000", "10100", "10010", "10001"],
  L: ["10000", "10000", "10000", "10000", "10000", "10000", "11111"],
  M: ["10001", "11011", "10101", "10101", "10001", "10001", "10001"],
  N: ["10001", "11001", "10101", "10011", "10001", "10001", "10001"],
  O: ["01110", "10001", "10001", "10001", "10001", "10001", "01110"],
  P: ["11110", "10001", "10001", "11110", "10000", "10000", "10000"],
  R: ["11110", "10001", "10001", "11110", "10100", "10010", "10001"],
  S: ["01111", "10000", "10000", "01110", "00001", "00001", "11110"],
  T: ["11111", "00100", "00100", "00100", "00100", "00100", "00100"],
  V: ["10001", "10001", "10001", "10001", "10001", "01010", "00100"],
  Y: ["10001", "10001", "01010", "00100", "00100", "00100", "00100"],
  ".": ["00000", "00000", "00000", "00000", "00000", "01100", "01100"],
  " ": ["00000", "00000", "00000", "00000", "00000", "00000", "00000"],
};

// ----- tiny raster ------------------------------------------------------
const px = new Uint8Array(W * H * 4);
const put = (x, y, [r, g, b]) => {
  if (x < 0 || y < 0 || x >= W || y >= H) return;
  const i = (y * W + x) * 4;
  px[i] = r; px[i + 1] = g; px[i + 2] = b; px[i + 3] = 255;
};
const rect = (x, y, w, h, c) => {
  for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) put(xx, yy, c);
};
const textWidth = (t, s) => t.length * 6 * s - s;
const drawText = (t, scale, cx, y, color) => {
  let x = Math.round(cx - textWidth(t, scale) / 2);
  for (const ch of t) {
    const glyph = FONT[ch] ?? FONT[" "];
    glyph.forEach((row, gy) => {
      [...row].forEach((bit, gx) => {
        if (bit === "1") rect(x + gx * scale, y + gy * scale, scale, scale, color);
      });
    });
    x += 6 * scale;
  }
};

const BG = [10, 10, 14];
const GOLD = [227, 179, 65];
const DIM = [120, 116, 126];
const LINE = [42, 42, 54];

export function renderOgPng() {
  // background
  rect(0, 0, W, H, BG);

  // film-strip sprocket holes top & bottom
  for (let x = 28; x < W - 28; x += 56) {
    rect(x, 36, 26, 18, LINE);
    rect(x, H - 54, 26, 18, LINE);
  }
  // frame rules
  rect(60, 92, W - 120, 3, LINE);
  rect(60, H - 95, W - 120, 3, LINE);

  // marquee
  drawText("MCP.FILM", 16, W / 2, 190, GOLD);
  drawText("THE MCP DIRECTORY", 5, W / 2, 360, DIM);
  drawText("FOR AI FILMMAKING", 5, W / 2, 410, DIM);
  drawText("CONNECT EVERY TOOL YOUR AGENT NEEDS", 3, W / 2, 488, [80, 77, 88]);

  // ----- PNG encode -----------------------------------------------------
  const crcTable = new Int32Array(256).map((_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c;
  });
  const crc32 = (buf) => {
    let c = -1;
    for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
    return (c ^ -1) >>> 0;
  };
  const chunk = (type, data) => {
    const t = Buffer.from(type, "ascii");
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(Buffer.concat([t, data])));
    return Buffer.concat([len, t, data, crc]);
  };

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(W, 0);
  ihdr.writeUInt32BE(H, 4);
  ihdr[8] = 8;   // bit depth
  ihdr[9] = 6;   // RGBA
  // bytes 10-12: compression, filter, interlace = 0

  // scanlines with filter byte 0
  const raw = Buffer.alloc(H * (W * 4 + 1));
  for (let y = 0; y < H; y++) {
    raw[y * (W * 4 + 1)] = 0;
    Buffer.from(px.buffer, y * W * 4, W * 4).copy(raw, y * (W * 4 + 1) + 1);
  }

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", zlib.deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}
