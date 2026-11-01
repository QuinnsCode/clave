// src/lib/collab/strokeCodec.ts
// Binary stroke format — no JSON, ~10x smaller than object arrays.
//
// Header (8 bytes):
//   [0-3]  color  u32  — packed RGBA
//   [4]    tool   u8   — 0=pencil 1=marker 2=brush
//   [5]    width  u8   — 1-255px
//   [6-7]  count  u16  — number of x,y pairs
//
// Points (8 bytes each):
//   [0-3]  x  f32
//   [4-7]  y  f32

export type StrokeTool = 0 | 1 | 2; // pencil | marker | brush

export interface Stroke {
  id:     string;
  color:  number;      // packed RGBA u32
  tool:   StrokeTool;
  width:  number;      // 1-255
  points: Float32Array; // interleaved x,y pairs
}

export function encodeStroke(stroke: Stroke): ArrayBuffer {
  const buf  = new ArrayBuffer(8 + stroke.points.length * 4);
  const view = new DataView(buf);
  const f32  = new Float32Array(buf, 8);

  view.setUint32(0, stroke.color, false);
  view.setUint8 (4, stroke.tool);
  view.setUint8 (5, Math.max(1, Math.min(255, stroke.width)));
  view.setUint16(6, stroke.points.length / 2, false);
  f32.set(stroke.points);

  return buf;
}

export function decodeStroke(id: string, buf: ArrayBuffer): Stroke {
  const view  = new DataView(buf);
  const count = view.getUint16(6, false);
  const f32   = new Float32Array(buf, 8, count * 2);

  return {
    id,
    color:  view.getUint32(0, false),
    tool:   view.getUint8(4) as StrokeTool,
    width:  view.getUint8(5),
    points: f32.slice(), // copy so original buffer can be GC'd
  };
}

// ── Color helpers ─────────────────────────────────────────────────────────────

export function rgbaToU32(r: number, g: number, b: number, a = 255): number {
  return (((r & 0xff) << 24) | ((g & 0xff) << 16) | ((b & 0xff) << 8) | (a & 0xff)) >>> 0;
}

export function u32ToRgba(u32: number): [number, number, number, number] {
  return [
    (u32 >>> 24) & 0xff,
    (u32 >>> 16) & 0xff,
    (u32 >>>  8) & 0xff,
     u32         & 0xff,
  ];
}

export function u32ToCss(u32: number): string {
  const [r, g, b, a] = u32ToRgba(u32);
  return `rgba(${r},${g},${b},${a / 255})`;
}

export function hexToU32(hex: string, a = 255): number {
  const clean = hex.replace("#", "");
  const r = parseInt(clean.slice(0, 2), 16);
  const g = parseInt(clean.slice(2, 4), 16);
  const b = parseInt(clean.slice(4, 6), 16);
  return rgbaToU32(r, g, b, a);
}

export function u32ToHex(u32: number): string {
  const [r, g, b] = u32ToRgba(u32);
  return `#${r.toString(16).padStart(2,"0")}${g.toString(16).padStart(2,"0")}${b.toString(16).padStart(2,"0")}`;
}