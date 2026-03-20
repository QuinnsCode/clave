// src/lib/plugins/recording/queue.ts
// Queue consumer for recording assembly.
//
// Message flow:
//   "session-ended"       → fan out N × "assemble-peer-track"
//   "assemble-peer-track" → list R2 chunks, concat via multipart copy → track.webm
//   "finalize-manifest"   → all peers done, write session.json + archive transcript

import { setupDb, db } from "@/db";
import type { RecordingQueueMessage, PeerManifest, SessionManifest, RecordingTier } from "./types";
import {
  listChunkKeys,
  putJson,
  getJson,
  sessionManifestKey,
  peerManifestKey,
  transcriptArchiveKey,
  assembledTrackKey,
  RECORDING_BUCKET,
} from "./r2";

// ── Entry point ───────────────────────────────────────────────────────────────

export async function handleRecordingQueue(
  batch: MessageBatch<RecordingQueueMessage>,
  env: Env
): Promise<void> {
  for (const msg of batch.messages) {
    try {
      await dispatch(msg.body, env);
      msg.ack();
    } catch (e) {
      console.error(`[recording-queue] failed ${msg.body.type}:`, e);
      msg.retry();
    }
  }
}

async function dispatch(msg: RecordingQueueMessage, env: Env): Promise<void> {
  switch (msg.type) {
    case "session-ended":       return handleSessionEnded(msg, env);
    case "assemble-peer-track": return handleAssemblePeerTrack(msg, env);
    case "finalize-manifest":   return handleFinalizeManifest(msg, env);
  }
}

// ── session-ended → fan out one message per peer ──────────────────────────────

async function handleSessionEnded(
  msg: Extract<RecordingQueueMessage, { type: "session-ended" }>,
  env: Env
): Promise<void> {
  const { sessionId, orgId, siteKey } = msg;
  const queue = (env as any).RECORDING_QUEUE as Queue<RecordingQueueMessage>;

  // read tier from _peers.json
  const peerList = await getJson<{ peers: string[]; tier?: string }>(
    env, `${orgId}/${sessionId}/_peers.json`
  );

  if (!peerList?.peers?.length) {
    console.warn(`[recording-queue] session-ended: no peers for ${sessionId}`);
    return;
  }

  console.log(`[recording-queue] fanning out ${peerList.peers.length} peer assemblies`);

  // Write assembly counter before fanning out
  // store it in _assembly.json
  await putJson(env, `${orgId}/${sessionId}/_assembly.json`, {
    total: peerList.peers.length,
    done:  0,
    peers: peerList.peers,
    tier:  peerList.tier ?? "720p",  // ← add this
    startedAt: Date.now(),
  });

  // Fan out — queue processes these in parallel
  await Promise.all(
    peerList.peers.map(peerId =>
      queue.send({ type: "assemble-peer-track", sessionId, orgId, peerId, siteKey })
    )
  );
}

// ── assemble-peer-track — multipart copy per peer ────────────────────────────

async function handleAssemblePeerTrack(
    msg: Extract<RecordingQueueMessage, { type: "assemble-peer-track" }>,
    env: Env
  ): Promise<void> {
    const { sessionId, orgId, peerId, siteKey } = msg;
    const queue    = (env as any).RECORDING_QUEUE as Queue<RecordingQueueMessage>;
    const bucket   = (env as any).RECORDING_BUCKET as R2Bucket;
    const chunkKeys = await listChunkKeys(env, orgId, sessionId, peerId);
  
    if (chunkKeys.length === 0) {
      console.warn(`[recording-queue] no chunks for peer ${peerId}`);
      await markPeerDone(env, orgId, sessionId, queue, siteKey);
      return;
    }
  
    // Fetch and concatenate all chunks
    const chunks = await Promise.all(
      chunkKeys.map(async key => {
        const obj = await bucket.get(key);
        if (!obj) throw new Error(`Missing chunk: ${key}`);
        return obj.arrayBuffer();
      })
    );
  
    const totalSize = chunks.reduce((sum, c) => sum + c.byteLength, 0);
    const combined  = new Uint8Array(totalSize);
    let offset = 0;
    for (const chunk of chunks) {
      combined.set(new Uint8Array(chunk), offset);
      offset += chunk.byteLength;
    }
  
    const firstExt  = chunkKeys[0].split(".").pop() ?? "webm";
    const destKey   = assembledTrackKey(orgId, sessionId, peerId);
    await bucket.put(destKey, combined, {
      httpMetadata: { contentType: firstExt === "mp4" ? "video/mp4" : "video/webm" },
    });
  
    console.log(`[recording-queue] assembled ${chunkKeys.length} chunks → ${destKey}`);
  
    await putJson(env, peerManifestKey(orgId, sessionId, peerId), {
        peerId,
        assembled:    true,
        assembledKey: destKey,
        displayName:  "",
        chunks:       [],
        startedAt:    Date.now(),
        lastChunkAt:  Date.now(),
    } satisfies Partial<PeerManifest>);
  
    await markPeerDone(env, orgId, sessionId, queue, siteKey);
}

// ── finalize-manifest — all peers done ───────────────────────────────────────

async function handleFinalizeManifest(
  msg: Extract<RecordingQueueMessage, { type: "finalize-manifest" }>,
  env: Env
): Promise<void> {
  const { sessionId, orgId, siteKey } = msg;

  await setupDb(env);

  const assembly = await getJson<{ total: number; done: number; peers: string[]; tier?: string }>(
    env, `${orgId}/${sessionId}/_assembly.json`
  );
  if (!assembly) {
    console.warn(`[recording-queue] finalize: no assembly state for ${sessionId}`);
    return;
  }

  // Load per-peer manifests
  const peerManifests = (await Promise.all(
    assembly.peers.map(peerId => getJson<PeerManifest>(env, peerManifestKey(orgId, sessionId, peerId)))
  )).filter(Boolean) as PeerManifest[];

  // Archive transcript from D1 → R2
  let transcriptKey: string | undefined;
  try {
    const transcript = await db.sessionTranscript.findFirst({ where: { sessionId } });
    if (transcript) {
      const tKey = transcriptArchiveKey(orgId, sessionId);
      await putJson(env, tKey, JSON.parse(transcript.chunks));
      transcriptKey = tKey;
    }
  } catch (e) {
    console.error("[recording-queue] transcript archive failed:", e);
  }

  // Load session log for timestamps
  const sessionLog = await db.qlaveSessionLog.findFirst({
    where: { sessionId },
    select: { startedAt: true, endedAt: true },
  });
  //
  const manifest: SessionManifest = {
    sessionId,
    orgId,
    siteKey,
    tier: (assembly.tier ?? "720p") as RecordingTier,
    startedAt: sessionLog?.startedAt?.getTime() ?? Date.now(),
    endedAt:   sessionLog?.endedAt?.getTime()   ?? Date.now(),
    peers:     peerManifests,
    transcriptKey,
  };

  await putJson(env, sessionManifestKey(orgId, sessionId), manifest);

  // D1 record for dashboard lookup
  try {
    await db.recordingManifest.upsert({
      where: { sessionId },
      create: {
        id:          crypto.randomUUID(),
        sessionId,
        orgId,
        siteKey,
        r2Key:       sessionManifestKey(orgId, sessionId),
        peerCount:   assembly.peers.length,
        assembledAt: new Date(),
      },
      update: {
        r2Key:       sessionManifestKey(orgId, sessionId),
        peerCount:   assembly.peers.length,
        assembledAt: new Date(),
      },
    });
  } catch (e) {
    console.error("[recording-queue] D1 manifest write failed:", e);
  }

  console.log(`[recording-queue] finalized session ${sessionId}`);
}

// ── Assembly counter ──────────────────────────────────────────────────────────
// R2 object as counter — safe because Cloudflare processes one queue message
// at a time per consumer, so no concurrent writes to _assembly.json.

async function markPeerDone(
  env: Env,
  orgId: string,
  sessionId: string,
  queue: Queue<RecordingQueueMessage>,
  siteKey: string
): Promise<void> {
  const key = `${orgId}/${sessionId}/_assembly.json`;
  const assembly = await getJson<{ total: number; done: number; peers: string[] }>(env, key);
  if (!assembly) return;

  assembly.done++;
  await putJson(env, key, assembly);

  if (assembly.done >= assembly.total) {
    await queue.send({ type: "finalize-manifest", sessionId, orgId, siteKey });
  }
}