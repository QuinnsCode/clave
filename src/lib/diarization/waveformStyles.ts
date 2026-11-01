// src/lib/diarization/waveformStyles.ts
//
// Pluggable waveform renderers. Each style is a registered object with a
// `draw` function. The component dispatches by id — no conditionals scattered
// across the rendering code. New styles can be added by appending to STYLES.
//
// Naming: "style" refers to a visual rendering mode for the waveform canvas
// (bars / glow / whispy / shimmer / etc). NOT to be confused with CSS styles.
//
// Architecture decisions baked in:
//   - Pure functions. No DOM, no React. Take a context + amplitudes + color,
//     draw bars/lines into the given canvas. Trivially testable.
//   - Each style has its own params type. Defaults are part of the registration
//     so the component just calls drawWaveform(id, ctx) — no need to pass params
//     unless overriding.
//   - `baseColor` is resolved by the caller from CSS vars and passed in. The
//     renderer doesn't know about theming — that stays in the component layer.
//
// CHANGED (tracks pass) — default style switched back to "bars". The main
// waveform pairs with the tracks view below; honest amplitude bars are
// easiest to read alongside the multitrack lanes. Whispy + shimmer remain
// in the registry for users to opt into per session/preference later.
//
// CHANGED (tracks pass) — added "shimmer" style with the user-locked Perlin
// config. Includes inline 1D Perlin + octave noise helpers.

// ── Public types ────────────────────────────────────────────────────────────

export type WaveformStyleId = "bars" | "glow" | "whispy" | "shimmer";

export interface DrawContext {
  ctx:        CanvasRenderingContext2D;
  w:          number;          // logical width (CSS pixels, not bitmap)
  h:          number;          // logical height
  amplitudes: number[];        // 0..1 per bucket — caller already normalized
  baseColor:  string;          // resolved hex color from --purple or fallback
}

// Each style's params shape is exported in case future code wants to tune them.
export interface BarsParams {
  barWidth:  number;
  gap:       number;
  minHeight: number;
}

export interface GlowParams {
  blur:    number;
  alpha:   number;
  magenta: number;
}

export interface WhispyParams {
  layers:        number;
  baseFreq:      number;
  freqStep:      number;
  phaseStep:     number;
  wiggle:        number;
  primaryWidth:  number;
  tailWidth:     number;
  primaryBlur:   number;
  tailBlur:      number;
  decay:         number;
  glow:          number;
  glowBlur:      number;
  magenta:       number;
  monochrome:    boolean;
}

export interface ShimmerParams {
  noiseFreq:    number;
  octaves:      number;
  lacunarity:   number;
  persistence:  number;
  basePart:     number;
  variance:     number;
  layers:       number;
  layerJitter:  number;
  layerOpacity: number;
  lineWidth:    number;
  mirrored:     boolean;
  glow:         number;
  glowBlur:     number;
  magenta:      number;
  monochrome:   boolean;
}

// ── Shared helpers ──────────────────────────────────────────────────────────

// Cosine-interpolated sample of `amps` at fractional position t (0..1).
// Used by curve-based renderers so the line is smooth between buckets,
// not staircased. Buckets are wide (1s at default pps), so without smoothing
// the curves look like step functions.
function sampleAmp(amps: number[], t: number): number {
  const n = amps.length;
  if (n === 0) return 0;
  const f = Math.max(0, Math.min(n - 1, t * (n - 1)));
  const i = Math.floor(f);
  const a = amps[i];
  const b = amps[Math.min(i + 1, n - 1)];
  const frac = f - i;
  const smooth = (1 - Math.cos(frac * Math.PI)) / 2;
  return a * (1 - smooth) + b * smooth;
}

// Build the vertical gradient used by glow + whispy + shimmer (when not monochrome).
// magentaMix 0..1: 0 = pure base color, 1 = leans toward magenta at the top.
function makeGradient(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  baseColor: string,
  magentaMix: number,
): CanvasGradient {
  let r = 0x9b, g = 0x6c, b = 0xff;
  const m = baseColor.match(/^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i);
  if (m) {
    r = parseInt(m[1], 16);
    g = parseInt(m[2], 16);
    b = parseInt(m[3], 16);
  }

  const mix = magentaMix;
  const tR = Math.round(r + (255 - r) * mix * 0.7);
  const tG = Math.round(g + (60  - g) * mix * 0.7);
  const tB = b;
  const mR = r, mG = g, mB = b;
  const bR = Math.round(r - r * mix * 0.3);
  const bG = g;
  const bB = b;

  const grad = ctx.createLinearGradient(0, 0, 0, h);
  grad.addColorStop(0,   `rgba(${tR}, ${tG}, ${tB}, 0.95)`);
  grad.addColorStop(0.5, `rgba(${mR}, ${mG}, ${mB}, 0.95)`);
  grad.addColorStop(1,   `rgba(${bR}, ${bG}, ${bB}, 0.95)`);
  return grad;
}

// ── 1D Perlin noise (for shimmer) ───────────────────────────────────────────
// Standard implementation. Adjacent samples are correlated → smooth curves.
// Range: roughly [-1, 1]. Deterministic given the seed.

function makePerlin1D(seed: number): (x: number) => number {
  // Simple LCG for deterministic shuffle. Different seeds yield independent channels.
  let s = seed | 0;
  const rand = (): number => {
    s = (s * 1664525 + 1013904223) | 0;
    return ((s >>> 0) / 0xFFFFFFFF);
  };

  const p = new Uint8Array(256);
  for (let i = 0; i < 256; i++) p[i] = i;
  for (let i = 255; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    const tmp = p[i]; p[i] = p[j]; p[j] = tmp;
  }
  const perm = new Uint8Array(512);
  for (let i = 0; i < 512; i++) perm[i] = p[i & 255];

  const grad = (hash: number): number => {
    return ((hash & 1) === 0 ? 1 : -1) * (0.5 + (hash & 0x0E) / 30);
  };

  // Quintic smoothstep — standard Perlin
  const fade = (t: number): number => t * t * t * (t * (t * 6 - 15) + 10);
  const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

  return function noise1D(x: number): number {
    const xi = Math.floor(x) & 255;
    const xf = x - Math.floor(x);
    const u  = fade(xf);
    const a  = grad(perm[xi]);
    const b  = grad(perm[xi + 1]);
    return lerp(a * xf, b * (xf - 1), u) * 2;   // *2 to roughly hit [-1, 1]
  };
}

// Fractal Perlin — sum multiple octaves at increasing freq + decreasing amp.
function octaveNoise(
  noiseFn:     (x: number) => number,
  x:           number,
  octaves:     number,
  lacunarity:  number,
  persistence: number,
): number {
  let total    = 0;
  let amp      = 1;
  let freq     = 1;
  let maxValue = 0;
  for (let i = 0; i < octaves; i++) {
    total    += noiseFn(x * freq) * amp;
    maxValue += amp;
    amp      *= persistence;
    freq     *= lacunarity;
  }
  return total / maxValue;
}

// Three pre-built noise channels with stable seeds. Different seeds produce
// uncorrelated patterns — used by shimmer's layer stacking so layers aren't
// just shifted copies of the same curve.
const NOISE_A = makePerlin1D(1337);
const NOISE_B = makePerlin1D(2718);
const NOISE_C = makePerlin1D(9001);
const NOISE_CHANNELS = [NOISE_A, NOISE_B, NOISE_C];

// ── Style: BARS ─────────────────────────────────────────────────────────────
// Mirrored vertical pills. Highest data-per-pixel fidelity. Best for stacked
// per-speaker tracks where you want clear "who spoke when" readability.

const BARS_DEFAULTS: BarsParams = {
  barWidth:  3,
  gap:       1,
  minHeight: 2,
};

function drawBars(d: DrawContext, p: BarsParams): void {
  const { ctx, w, h, amplitudes, baseColor } = d;
  ctx.clearRect(0, 0, w, h);

  const pxPerBar      = p.barWidth + p.gap;
  const barCount      = Math.max(1, Math.floor(w / pxPerBar));
  const bucketsPerBar = amplitudes.length / barCount;

  const centerY = h / 2;
  const maxHalf = h / 2 - 4;
  const offset  = (pxPerBar - p.barWidth) / 2;

  ctx.fillStyle = baseColor;
  for (let i = 0; i < barCount; i++) {
    const start = Math.floor(i * bucketsPerBar);
    const end   = Math.floor((i + 1) * bucketsPerBar);
    let peak = 0;
    for (let j = start; j < end && j < amplitudes.length; j++) {
      if (amplitudes[j] > peak) peak = amplitudes[j];
    }
    // Guard: if start === end (rare, when bucketsPerBar < 1), grab the one bucket.
    if (start === end && start < amplitudes.length) peak = amplitudes[start];

    const halfH = Math.max(p.minHeight / 2, peak * maxHalf);
    const x     = i * pxPerBar + offset;

    ctx.beginPath();
    if ((ctx as any).roundRect) {
      (ctx as any).roundRect(x, centerY - halfH, p.barWidth, halfH * 2, p.barWidth / 2);
      ctx.fill();
    } else {
      ctx.fillRect(x, centerY - halfH, p.barWidth, halfH * 2);
    }
  }
}

// ── Style: GLOW ─────────────────────────────────────────────────────────────
// Filled mirrored polygon with a blurred outer halo. The reference-image
// base look. Reads as ambient + soft.

const GLOW_DEFAULTS: GlowParams = {
  blur:    14,
  alpha:   0.55,
  magenta: 0.6,
};

function drawGlow(d: DrawContext, p: GlowParams): void {
  const { ctx, w, h, amplitudes, baseColor } = d;
  ctx.clearRect(0, 0, w, h);

  const centerY = h / 2;
  const maxHalf = h / 2 - 10;

  const buildPath = (scale: number) => {
    ctx.beginPath();
    ctx.moveTo(0, centerY);
    for (let x = 0; x <= w; x += 1) {
      const amp = sampleAmp(amplitudes, x / w);
      ctx.lineTo(x, centerY - amp * maxHalf * scale);
    }
    for (let x = w; x >= 0; x -= 1) {
      const amp = sampleAmp(amplitudes, x / w);
      ctx.lineTo(x, centerY + amp * maxHalf * scale);
    }
    ctx.closePath();
  };

  ctx.save();
  ctx.filter      = `blur(${p.blur}px)`;
  ctx.globalAlpha = p.alpha;
  ctx.fillStyle   = makeGradient(ctx, w, h, baseColor, p.magenta);
  buildPath(1.05);
  ctx.fill();
  ctx.restore();

  ctx.save();
  ctx.filter      = "none";
  ctx.globalAlpha = 1;
  ctx.fillStyle   = makeGradient(ctx, w, h, baseColor, p.magenta);
  buildPath(1);
  ctx.fill();
  ctx.restore();
}

// ── Style: WHISPY ───────────────────────────────────────────────────────────
// Stroke-only sine-modulated layers clustered in phase. One bold primary line
// + thinner blurred followers fade behind it. Aesthetic — not strictly
// amplitude-honest, but reads as rich + alive.

const WHISPY_DEFAULTS: WhispyParams = {
  layers:        3,
  baseFreq:      10,
  freqStep:      0.1,
  phaseStep:     1.45,
  wiggle:        0.95,
  primaryWidth:  1,
  tailWidth:     0.9,
  primaryBlur:   0,
  tailBlur:      7,
  decay:         0.55,
  glow:          0.4,
  glowBlur:      11,
  magenta:       0,
  monochrome:    false,
};

function drawWhispy(d: DrawContext, p: WhispyParams): void {
  const { ctx, w, h, amplitudes, baseColor } = d;
  ctx.clearRect(0, 0, w, h);

  const centerY = h / 2;
  const maxHalf = h / 2 - 10;

  const traceLayer = (freq: number, phase: number, mirror: boolean) => {
    ctx.beginPath();
    for (let x = 0; x <= w; x += 1) {
      const t       = x / w;
      const env     = sampleAmp(amplitudes, t);
      const sine    = Math.sin(2 * Math.PI * freq * t + phase);
      const shaping = (1 - p.wiggle) + p.wiggle * sine;
      const y       = centerY + (mirror ? 1 : -1) * env * maxHalf * shaping;
      if (x === 0) ctx.moveTo(x, y);
      else         ctx.lineTo(x, y);
    }
    ctx.stroke();
  };

  const strokeStyle = (): string | CanvasGradient =>
    p.monochrome ? "#ffffff" : makeGradient(ctx, w, h, baseColor, p.magenta);

  if (p.glow > 0) {
    ctx.save();
    ctx.filter      = `blur(${p.glowBlur}px)`;
    ctx.globalAlpha = p.glow;
    ctx.strokeStyle = strokeStyle();
    ctx.lineWidth   = p.primaryWidth * 2.5;
    ctx.lineCap     = "round";
    traceLayer(p.baseFreq, 0, false);
    traceLayer(p.baseFreq, Math.PI, true);
    ctx.restore();
  }

  for (let L = p.layers - 1; L >= 0; L--) {
    const freq   = p.baseFreq + L * p.freqStep;
    const phaseU = L * p.phaseStep;
    const phaseD = L * p.phaseStep + Math.PI / 2;
    const alpha  = Math.pow(p.decay, L);

    const tailFrac = p.layers > 1 ? L / (p.layers - 1) : 0;
    const lineW    = p.primaryWidth + (p.tailWidth - p.primaryWidth) * tailFrac;
    const blurPx   = p.primaryBlur  + (p.tailBlur  - p.primaryBlur)  * tailFrac;

    ctx.save();
    ctx.filter      = blurPx > 0 ? `blur(${blurPx}px)` : "none";
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = strokeStyle();
    ctx.lineWidth   = lineW;
    ctx.lineCap     = "round";
    ctx.lineJoin    = "round";
    traceLayer(freq, phaseU, false);
    traceLayer(freq, phaseD, true);
    ctx.restore();
  }
}

// ── Style: SHIMMER ──────────────────────────────────────────────────────────
// Perlin-noise modulated vertical strokes, scaled by amplitude envelope.
// Silence is silence (env=0 → height=0). Loud regions shimmer with continuous
// noise riding the envelope. WMP-grass aesthetic done honestly.
//
// Multiple noise channels (NOISE_A/B/C) stack as independent parallel hairs.
// User-locked config (from the v5 demo tuning) becomes the default below.

const SHIMMER_DEFAULTS: ShimmerParams = {
  noiseFreq:    0.24,
  octaves:      3,
  lacunarity:   1.9,
  persistence:  0.7,
  basePart:     0.3,
  variance:     0.35,
  layers:       2,
  layerJitter:  10.5,
  layerOpacity: 0.75,
  lineWidth:    1.6,
  mirrored:     true,
  glow:         0.45,
  glowBlur:     24,
  magenta:      0.25,
  monochrome:   true,
};

function drawShimmer(d: DrawContext, p: ShimmerParams): void {
  const { ctx, w, h, amplitudes, baseColor } = d;
  ctx.clearRect(0, 0, w, h);

  const baselineY = p.mirrored ? h / 2 : h - 4;
  const maxHeight = p.mirrored ? h / 2 - 6 : h - 8;

  // Trace one layer's curve. The amplitude envelope (real audio) is multiplied
  // by the Perlin shape — so silent moments (env=0) collapse to baseline.
  const buildPath = (noiseFn: (x: number) => number, offset: number, mirror: boolean) => {
    ctx.beginPath();
    for (let x = 0; x <= w; x += 1) {
      const t   = x / w;
      const env = sampleAmp(amplitudes, t);

      // shape = basePart + variance * n, clipped to >= 0 so noise can't drive
      // strokes below baseline. Then scaled by env so silence = 0 = flat.
      const n     = octaveNoise(noiseFn, x * p.noiseFreq + offset, p.octaves, p.lacunarity, p.persistence);
      const shape = Math.max(0, p.basePart + p.variance * n);
      const height = env * maxHeight * shape;

      const y = mirror ? baselineY + height : baselineY - height;
      if (x === 0) ctx.moveTo(x, baselineY);
      ctx.lineTo(x, y);
    }
    ctx.stroke();
  };

  const strokeStyle: string | CanvasGradient = p.monochrome
    ? "#ffffff"
    : makeGradient(ctx, w, h, baseColor, p.magenta);

  // ── Glow pass (drawn first, behind layers) ──
  if (p.glow > 0) {
    ctx.save();
    ctx.filter      = `blur(${p.glowBlur}px)`;
    ctx.globalAlpha = p.glow;
    ctx.strokeStyle = strokeStyle;
    ctx.lineWidth   = p.lineWidth * 2;
    ctx.lineCap     = "round";
    buildPath(NOISE_A, 0, false);
    if (p.mirrored) buildPath(NOISE_A, 0, true);
    ctx.restore();
  }

  // ── Layer stack ──
  for (let L = 0; L < p.layers; L++) {
    const noiseFn = NOISE_CHANNELS[L % NOISE_CHANNELS.length];
    const offset  = L * p.layerJitter;
    const alpha   = p.layerOpacity * (1 - L * 0.15);

    ctx.save();
    ctx.filter      = "none";
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = strokeStyle;
    ctx.lineWidth   = p.lineWidth;
    ctx.lineCap     = "round";
    ctx.lineJoin    = "round";
    buildPath(noiseFn, offset, false);
    if (p.mirrored) buildPath(noiseFn, offset, true);
    ctx.restore();
  }
}

// ── Registry ────────────────────────────────────────────────────────────────

interface RegisteredStyle {
  id:            WaveformStyleId;
  displayName:   string;
  defaultParams: object;
  draw:          (d: DrawContext, params: any) => void;
}

const STYLES: Record<WaveformStyleId, RegisteredStyle> = {
  bars:    { id: "bars",    displayName: "Bars",    defaultParams: BARS_DEFAULTS,    draw: drawBars    },
  glow:    { id: "glow",    displayName: "Glow",    defaultParams: GLOW_DEFAULTS,    draw: drawGlow    },
  whispy:  { id: "whispy",  displayName: "Whispy",  defaultParams: WHISPY_DEFAULTS,  draw: drawWhispy  },
  shimmer: { id: "shimmer", displayName: "Shimmer", defaultParams: SHIMMER_DEFAULTS, draw: drawShimmer },
};

// ── Public API ──────────────────────────────────────────────────────────────

/**
 * Draw the waveform using the given style. Caller provides the canvas context
 * and the amplitude data; the renderer handles the rest.
 *
 * Override default params by passing a partial object — useful for tuning UIs
 * later. Not used in production today (we just take defaults).
 */
export function drawWaveform(
  styleId:        WaveformStyleId,
  drawContext:    DrawContext,
  paramsOverride?: Partial<object>,
): void {
  const style  = STYLES[styleId];
  const params = paramsOverride
    ? { ...style.defaultParams, ...paramsOverride }
    : style.defaultParams;
  style.draw(drawContext, params);
}

/**
 * List of available style ids — useful if we ever add a UI picker.
 */
export function listStyles(): { id: WaveformStyleId; displayName: string }[] {
  return Object.values(STYLES).map(s => ({ id: s.id, displayName: s.displayName }));
}

/**
 * Default style — the one we ship with. Centralized so we can change it in
 * one place if we want.
 *
 * CHANGED (tracks pass) — back to "bars". The tracks view below the main
 * scrubber benefits from a readable, honest main waveform. Whispy + shimmer
 * remain available as opt-in choices.
 */
export const DEFAULT_WAVEFORM_STYLE: WaveformStyleId = "bars";