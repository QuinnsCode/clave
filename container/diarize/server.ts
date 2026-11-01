// container/diarize/server.ts
// v0.6.4 — adds POST /waveform-only for harness regen path
//
// CHANGED in v0.6.4 (from v0.6.3):
//   - Added POST /waveform-only endpoint. Takes a pre-assembled audio.webm
//     in the request body (raw bytes, not multipart) and returns just the
//     waveform.dat bytes via X-Waveform-B64 header.
//   - Same ffmpeg → WAV file → audiowaveform pipeline as /assemble-multipart's
//     phase 5, lifted into a helper function so both endpoints share the
//     waveform code path.
//   - Use case: regen waveform for sessions that have audio.webm already
//     (either from a prior assemble run, or because the original assemble
//     produced no waveform due to the audiowaveform PPS bug).
//
// CHANGED in v0.6.3 (from v0.6.2):
//   - can't have fractional values just always use 1 for waveform sampling
//
// CHANGED in v0.6.2 (from v0.6.1):
//   - Bun's spawn() doesn't support fd-backed ReadableStream as stdin source
//     (https://github.com/oven-sh/bun/issues/8049). The v0.6.1 piping
//     pattern hit that bug at runtime with 500: "Support fd/blob backed
//     ReadableStream in spawn stdin".
//   - Fix: write an intermediate WAV file to tmpfs instead of piping. ffmpeg
//     decodes WebM → mono 8kHz WAV file. audiowaveform reads that file by
//     path. ~50ms slower than piping (one ~2MB tmpfs write), but no Bun bug
//     interaction. Cleaner error surfaces too.
//   - audiowaveform auto-detects WAV by file extension, so we drop the
//     --input-format flag.
//
// CHANGED in v0.6.1 (preserved):
//   - audiowaveform doesn't natively read WebM container — it understands
//     MP3/WAV/FLAC/Ogg/Opus standalone, not WebM-wrapped Opus. So we have
//     to decode through ffmpeg before audiowaveform can see it.
//   - 8kHz mono WAV: plenty for waveform visualization (we bucket down to
//     ~1 sample/sec anyway), keeps the intermediate file tiny.
//
// CHANGED in v0.6.0 (preserved):
//   - Renamed all peaks-named identifiers to waveform-named at the surface.
//     Inside the audiowaveform tool invocation we still talk about "peaks"
//     because that's literally what audiowaveform calls its output bytes.
//   - Renamed R2-bound filename: peaks.dat → waveform.dat
//   - Renamed response headers: X-Peaks-* → X-Waveform-*
//
// Why this approach (v0.4.0 commentary preserved):
//   MediaRecorder emits chunks where ONLY the first chunk contains the EBML
//   init headers. Chunks 1..N are raw cluster data, designed to be
//   byte-appended to chunk 0 (this is what `new Blob(chunks)` does in the
//   browser). Feeding chunks 1..N individually to ffmpeg fails with
//   "Invalid data" because they have no headers.
//
//   So: byte-concat in JS first → ffmpeg sees ONE valid WebM file →
//   re-encode to clean Opus to fix any duration metadata issues nova-3
//   might trip on.

import { spawn } from "bun";
import { mkdir, writeFile, unlink, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

const PORT    = Number(process.env.PORT ?? 8080);
const VERSION = "0.6.4";

// Waveform resolution policy: bucket size by duration.
// These are NAVIGATION-fidelity peaks (the bytes inside the waveform.dat file),
// not DAW-fidelity. Goal: enough detail to see "where I spoke" at a glance,
// tiny files at all session lengths.
const WAVEFORM_PPS = "1";

// ── Server ───────────────────────────────────────────────────────────────────

Bun.serve({
  port: PORT,
  idleTimeout: 240,
  async fetch(req) {
    const url = new URL(req.url);

    if (req.method === "GET" && url.pathname === "/health") {
      return Response.json({ ok: true, version: VERSION });
    }

    if (req.method === "POST" && url.pathname === "/assemble-multipart") {
      return handleAssembleMultipart(req);
    }

    // NEW (v0.6.4) — regen-waveform path for the harness. Takes a
    // pre-assembled audio.webm (raw bytes, not multipart), returns
    // waveform.dat + metadata via the same X-Waveform-* headers as
    // /assemble-multipart. Audio bytes go in the response body.
    if (req.method === "POST" && url.pathname === "/waveform-only") {
      return handleWaveformOnly(req);
    }

    return Response.json({ error: "not found", path: url.pathname }, { status: 404 });
  },
});

console.log(`[diarize-container] listening on :${PORT} — version ${VERSION}`);

// ── /assemble-multipart ──────────────────────────────────────────────────────

async function handleAssembleMultipart(req: Request): Promise<Response> {
  const startedAt = Date.now();

  let form: FormData;
  try {
    form = await req.formData();
  } catch (e: any) {
    return Response.json({ error: `invalid multipart: ${e?.message ?? e}` }, { status: 400 });
  }

  const jobIdRaw = form.get("jobId");
  if (typeof jobIdRaw !== "string" || jobIdRaw.length === 0) {
    return Response.json({ error: "missing jobId field" }, { status: 400 });
  }
  const jobId = jobIdRaw;

  const chunkEntries = form.getAll("chunks");
  if (chunkEntries.length === 0) {
    return Response.json({ error: "missing chunks (form field 'chunks')" }, { status: 400 });
  }

  if (chunkEntries.length > 5000) {
    return Response.json({
      error: `too many chunks (${chunkEntries.length}, max 5000)`,
    }, { status: 413 });
  }

  for (let i = 0; i < chunkEntries.length; i++) {
    if (typeof chunkEntries[i] === "string") {
      return Response.json({ error: `chunks[${i}] is a string, expected file` }, { status: 400 });
    }
  }
  const chunks = chunkEntries as File[];

  const workDir = path.join(tmpdir(), `diarize-${jobId}-${Date.now()}`);
  await mkdir(workDir, { recursive: true });

  const concatPath   = path.join(workDir, "concat.webm");
  const outPath      = path.join(workDir, "assembled.webm");
  const decodedWav   = path.join(workDir, "decoded.wav");
  const waveformPath = path.join(workDir, "waveform.dat");

  try {
    // ── 1. Sort chunks by filename ───────────────────────────────────────
    chunks.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));

    // ── 2. Byte-concat all chunks into one file ──────────────────────────
    const concatStart = Date.now();
    const writer = Bun.file(concatPath).writer();
    let totalBytes = 0;
    for (const file of chunks) {
      const bytes = new Uint8Array(await file.arrayBuffer());
      writer.write(bytes);
      totalBytes += bytes.byteLength;
    }
    await writer.end();
    const concatMs = Date.now() - concatStart;

    console.log(
      `[diarize-container] byte-concat ${chunks.length} chunks → ${totalBytes} bytes (${concatMs}ms)`
    );

    // ── 3. Re-encode through ffmpeg ──────────────────────────────────────
    const ffmpegStart = Date.now();
    const proc = spawn([
      "ffmpeg",
      "-y",
      "-loglevel", "error",
      "-i",        concatPath,
      "-c:a",      "libopus",
      "-b:a",      "32k",
      outPath,
    ], {
      stdout: "pipe",
      stderr: "pipe",
    });

    const exitCode = await proc.exited;
    if (exitCode !== 0) {
      const stderr = await new Response(proc.stderr).text();
      throw new Error(`ffmpeg exit ${exitCode}: ${stderr.trim().slice(0, 1500)}`);
    }
    const ffmpegMs = Date.now() - ffmpegStart;

    // ── 4. Probe duration ────────────────────────────────────────────────
    const { durationSec, probeMs } = await probeDuration(outPath);

    // ── 5. Generate waveform.dat (extracted to helper for reuse) ─────────
    const wf = await generateWaveform({
      audioPath:    outPath,
      decodedWav,
      waveformPath,
      durationSec,
      jobId,
    });

    // ── 6. Read output and return ────────────────────────────────────────
    const assembled = await readFile(outPath);
    const totalMs = Date.now() - startedAt;

    console.log(
      `[diarize-container] OK job=${jobId} ` +
      `chunks=${chunks.length} rawBytes=${totalBytes} outBytes=${assembled.byteLength} ` +
      `duration=${durationSec.toFixed(1)}s waveformBytes=${wf.bytes} waveformPps=${wf.pps} ` +
      `concat=${concatMs}ms ffmpeg=${ffmpegMs}ms probe=${probeMs}ms waveform=${wf.elapsedMs}ms total=${totalMs}ms`
    );

    return new Response(assembled, {
      status: 200,
      headers: {
        "Content-Type":      "audio/webm",
        "X-Chunk-Count":     String(chunks.length),
        "X-Raw-Bytes":       String(totalBytes),
        "X-Concat-Ms":       String(concatMs),
        "X-Ffmpeg-Ms":       String(ffmpegMs),
        "X-Probe-Ms":        String(probeMs),
        "X-Waveform-Ms":     String(wf.elapsedMs),
        "X-Waveform-Pps":    wf.pps,
        "X-Waveform-Bytes":  String(wf.bytes),
        "X-Waveform-B64":    wf.b64,
        "X-Duration-Sec":    String(durationSec),
        "X-Total-Ms":        String(totalMs),
        "X-Assembled-Bytes": String(assembled.byteLength),
      },
    });

  } catch (err: any) {
    const elapsedMs = Date.now() - startedAt;
    const msg = String(err?.message ?? err);
    console.error(`[diarize-container] FAIL job=${jobId} after ${elapsedMs}ms: ${msg}`);
    return Response.json({ error: msg, elapsedMs }, { status: 500 });

  } finally {
    await unlink(concatPath).catch(() => {});
    await unlink(outPath).catch(() => {});
    await unlink(decodedWav).catch(() => {});
    await unlink(waveformPath).catch(() => {});
  }
}

// ── /waveform-only (NEW v0.6.4) ─────────────────────────────────────────────
//
// Regenerate waveform.dat from a pre-assembled audio.webm. Used by the harness
// `waveform` step when assemble didn't run (existing audio, missing waveform).
//
// Request:
//   POST /waveform-only
//   Header: X-Job-Id      (string, for logging — optional, defaults to random)
//   Body:   raw audio.webm bytes (Content-Type: audio/webm)
//
// Response:
//   200 OK, empty body
//   Headers:
//     X-Waveform-Pps     pps used
//     X-Waveform-Bytes   bytes (0 on failure)
//     X-Waveform-B64     waveform.dat base64 (empty on failure)
//     X-Duration-Sec     audio duration probed via ffprobe
//     X-Waveform-Ms      time spent
//     X-Total-Ms         total round-trip
//
// Failure modes:
//   400 — empty body / unreadable
//   500 — ffmpeg or audiowaveform error (with X-* headers showing what got
//         partway done before failing)

async function handleWaveformOnly(req: Request): Promise<Response> {
  const startedAt = Date.now();

  const jobId = req.headers.get("x-job-id") ?? `wfonly-${Date.now()}`;

  // Read raw body to a tmp file. Body is the pre-assembled audio.webm.
  const workDir = path.join(tmpdir(), `wfonly-${jobId}-${Date.now()}`);
  await mkdir(workDir, { recursive: true });

  const audioPath    = path.join(workDir, "audio.webm");
  const decodedWav   = path.join(workDir, "decoded.wav");
  const waveformPath = path.join(workDir, "waveform.dat");

  try {
    // ── 1. Write request body to file ───────────────────────────────────
    const readStart = Date.now();
    const audioBytes = new Uint8Array(await req.arrayBuffer());
    if (audioBytes.byteLength === 0) {
      return Response.json({ error: "empty body, expected audio.webm bytes" }, { status: 400 });
    }
    await writeFile(audioPath, audioBytes);
    const readMs = Date.now() - readStart;
    console.log(
      `[diarize-container] waveform-only job=${jobId} received ${audioBytes.byteLength} bytes (${readMs}ms)`
    );

    // ── 2. Probe duration ────────────────────────────────────────────────
    const { durationSec, probeMs } = await probeDuration(audioPath);

    if (durationSec <= 0) {
      return Response.json({
        error: `could not probe audio duration (got ${durationSec})`,
      }, { status: 400 });
    }

    // ── 3. Generate waveform via shared helper ──────────────────────────
    const wf = await generateWaveform({
      audioPath,
      decodedWav,
      waveformPath,
      durationSec,
      jobId,
    });

    const totalMs = Date.now() - startedAt;

    console.log(
      `[diarize-container] waveform-only OK job=${jobId} ` +
      `audioBytes=${audioBytes.byteLength} duration=${durationSec.toFixed(1)}s ` +
      `waveformBytes=${wf.bytes} waveformPps=${wf.pps} ` +
      `read=${readMs}ms probe=${probeMs}ms waveform=${wf.elapsedMs}ms total=${totalMs}ms`
    );

    // No response body — all data is in headers. Same convention as
    // /assemble-multipart for the waveform side-effect.
    return new Response(null, {
      status: 200,
      headers: {
        "X-Read-Ms":        String(readMs),
        "X-Probe-Ms":       String(probeMs),
        "X-Waveform-Ms":    String(wf.elapsedMs),
        "X-Waveform-Pps":   wf.pps,
        "X-Waveform-Bytes": String(wf.bytes),
        "X-Waveform-B64":   wf.b64,
        "X-Duration-Sec":   String(durationSec),
        "X-Total-Ms":       String(totalMs),
      },
    });

  } catch (err: any) {
    const elapsedMs = Date.now() - startedAt;
    const msg = String(err?.message ?? err);
    console.error(`[diarize-container] waveform-only FAIL job=${jobId} after ${elapsedMs}ms: ${msg}`);
    return Response.json({ error: msg, elapsedMs }, { status: 500 });

  } finally {
    await unlink(audioPath).catch(() => {});
    await unlink(decodedWav).catch(() => {});
    await unlink(waveformPath).catch(() => {});
  }
}

// ── Shared helpers ──────────────────────────────────────────────────────────

interface WaveformResult {
  b64:        string;   // empty if generation failed
  bytes:      number;   // 0 if generation failed
  pps:        string;
  elapsedMs:  number;
}

/**
 * Decode audio → 8kHz mono WAV → run audiowaveform → return base64'd .dat
 *
 * Non-fatal: returns empty/0 fields if any step fails. Caller logs and
 * proceeds without the waveform.
 */
async function generateWaveform(args: {
  audioPath:    string;
  decodedWav:   string;
  waveformPath: string;
  durationSec:  number;
  jobId:        string;
}): Promise<WaveformResult> {
  const { audioPath, decodedWav, waveformPath, durationSec, jobId } = args;

  if (durationSec <= 0) {
    return { b64: "", bytes: 0, pps: WAVEFORM_PPS, elapsedMs: 0 };
  }

  const startedAt = Date.now();

  // ── ffmpeg: source audio → mono 8kHz WAV file ─────────────────────────
  const ffmpegDecode = spawn([
    "ffmpeg",
    "-y",
    "-loglevel", "error",
    "-i",        audioPath,
    "-ar",       "8000",
    "-ac",       "1",
    decodedWav,
  ], { stdout: "pipe", stderr: "pipe" });

  const ffExit = await ffmpegDecode.exited;

  if (ffExit !== 0) {
    const ffStderr = (await new Response(ffmpegDecode.stderr).text()).trim().slice(0, 500);
    console.warn(`[diarize-container] waveform decode failed job=${jobId} exit=${ffExit}: ${ffStderr}`);
    return { b64: "", bytes: 0, pps: WAVEFORM_PPS, elapsedMs: Date.now() - startedAt };
  }

  // ── audiowaveform: WAV → waveform.dat ─────────────────────────────────
  const awProc = spawn([
    "audiowaveform",
    "-i",                  decodedWav,
    "-o",                  waveformPath,
    "--output-format",     "dat",
    "--bits",              "8",
    "--pixels-per-second", WAVEFORM_PPS,
  ], { stdout: "pipe", stderr: "pipe" });

  const awExit = await awProc.exited;

  if (awExit !== 0) {
    const awStderr = (await new Response(awProc.stderr).text()).trim().slice(0, 500);
    console.warn(`[diarize-container] audiowaveform failed job=${jobId} exit=${awExit}: ${awStderr}`);
    return { b64: "", bytes: 0, pps: WAVEFORM_PPS, elapsedMs: Date.now() - startedAt };
  }

  try {
    const waveformBuf = await readFile(waveformPath);
    return {
      b64:       waveformBuf.toString("base64"),
      bytes:     waveformBuf.byteLength,
      pps:       WAVEFORM_PPS,
      elapsedMs: Date.now() - startedAt,
    };
  } catch (e: any) {
    console.warn(`[diarize-container] waveform read failed job=${jobId}: ${e?.message ?? e}`);
    return { b64: "", bytes: 0, pps: WAVEFORM_PPS, elapsedMs: Date.now() - startedAt };
  }
}

interface DurationProbe {
  durationSec: number;
  probeMs:     number;
}

async function probeDuration(audioPath: string): Promise<DurationProbe> {
  const probeStart = Date.now();
  const probeProc = spawn(
    ["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", audioPath],
    { stdout: "pipe", stderr: "pipe" }
  );
  const durationStr = await new Response(probeProc.stdout).text();
  await probeProc.exited;
  const durationSec = parseFloat(durationStr.trim()) || 0;
  const probeMs = Date.now() - probeStart;
  return { durationSec, probeMs };
}

// ── Graceful shutdown ────────────────────────────────────────────────────────

process.on("SIGINT",  () => { console.log("[diarize-container] SIGINT");  process.exit(0); });
process.on("SIGTERM", () => { console.log("[diarize-container] SIGTERM"); process.exit(0); });