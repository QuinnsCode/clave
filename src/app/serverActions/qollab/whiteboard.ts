"use server";
// src/app/serverActions/qollab/whiteboard.ts

import { env } from "cloudflare:workers";
import type { WbObject } from "@/durableObjects/qollabWhiteboardDO";

function getStub(sessionId: string) {
  const id = env.QOLLAB_WHITEBOARD_DO.idFromName(sessionId);
  return env.QOLLAB_WHITEBOARD_DO.get(id);
}

export async function upsertObject(sessionId: string, peerId: string, obj: WbObject) {
  return getStub(sessionId).upsertObject(peerId, obj);
}

export async function deleteObject(sessionId: string, peerId: string, id: string) {
  return getStub(sessionId).deleteObject(peerId, id);
}

export async function clearWhiteboard(sessionId: string, peerId: string) {
  return getStub(sessionId).clearWhiteboard(peerId);
}

export async function getWhiteboardState(sessionId: string) {
  return getStub(sessionId).getWhiteboardState();
}