import { db } from "@/db";
import { presignGet } from "./presignGet";
import { listSessionChunks } from "@/lib/plugins/recording/r2";

export interface SessionRecording {
  sessionId:    string;
  assembled:    boolean;
  assembledUrl: string | null;
  chunkUrls:    string[];
  peerIds:      string[];
}

export async function getSessionRecording(
    env: any,
    sessionId: string,
    userId: string,
    orgId: string
  ): Promise<SessionRecording | null> {
    // Try manifest first
    const manifest = await db.recordingManifest.findFirst({ where: { sessionId } });
    if (manifest) {
      const assembledUrl = await presignGet(env, manifest.r2Key);
      return { sessionId, assembled: true, assembledUrl, chunkUrls: [], peerIds: [] };
    }
  
    // Try userId prefix first, then orgId
    for (const prefix of [userId, orgId]) {
      try {
        const allKeys = await listSessionChunks(env, prefix, sessionId);
        if (allKeys.length === 0) continue;
  
        const peerMap = new Map<string, string[]>();
        for (const key of allKeys) {
          const parts  = key.split("/");
          const peerId = parts[2];
          if (!peerId) continue;
          if (!peerMap.has(peerId)) peerMap.set(peerId, []);
          peerMap.get(peerId)!.push(key);
        }
  
        const peerIds   = [...peerMap.keys()];
        const chunks    = (peerMap.get(peerIds[0]) ?? []).sort();
        const chunkUrls = await Promise.all(chunks.map(k => presignGet(env, k)));
  
        return { sessionId, assembled: false, assembledUrl: null, chunkUrls, peerIds };
      } catch { continue; }
    }
  
    return null;
}