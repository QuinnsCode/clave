"use server";
// src/app/serverActions/qollab/docs.ts

import { env } from "cloudflare:workers";

function getStub(sessionId: string) {
  const id = env.QOLLAB_WHITEBOARD_DO.idFromName(sessionId);
  return env.QOLLAB_WHITEBOARD_DO.get(id);
}

export async function createDoc(sessionId: string, peerId: string, title: string) {
  return getStub(sessionId).createDoc(peerId, title);
}

export async function updateDoc(sessionId: string, peerId: string, id: string, content: string) {
  return getStub(sessionId).updateDoc(peerId, id, content);
}

export async function renameDoc(sessionId: string, peerId: string, id: string, title: string) {
  return getStub(sessionId).renameDoc(peerId, id, title);
}

export async function deleteDoc(sessionId: string, peerId: string, id: string) {
  return getStub(sessionId).deleteDoc(peerId, id);
}

export async function getDocs(sessionId: string) {
  return getStub(sessionId).getDocs();
}

export async function getDoc(sessionId: string, id: string) {
  return getStub(sessionId).getDoc(id);
}