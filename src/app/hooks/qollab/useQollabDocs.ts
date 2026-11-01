// src/app/hooks/qollab/useQollabDocs.ts
// Document list + content state, WS sync, server action calls.

import { useState, useCallback, useEffect } from "react";
import {
  createDoc,
  updateDoc,
  renameDoc,
  deleteDoc,
  getDoc,
} from "@/app/serverActions/qollab/docs";
import type { DocMeta, DocContent } from "@/durableObjects/qollabWhiteboardDO";
import type { UseQollabWsReturn } from "./useQollabWs";
import type { Capability } from "@/lib/qollab/capabilities";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface UseQollabDocsOptions {
  sessionId:    string;
  peerId:       string;
  caps:         Capability[];
  ws:           UseQollabWsReturn;
  initialDocs?: DocMeta[];
}

export interface UseQollabDocsReturn {
  docs:          DocMeta[];
  activeDoc:     DocContent | null;
  activeDocId:   string | null;
  loadingDoc:    boolean;
  openDoc:       (id: string) => void;
  closeDoc:      () => void;
  createNewDoc:  (title?: string) => Promise<string | null>;
  saveDoc:       (id: string, content: string) => void;
  renameDocument:(id: string, title: string) => void;
  deleteDocument:(id: string) => void;
  canCreate:     boolean;
  canEdit:       boolean;
  canDelete:     boolean;
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useQollabDocs({
  sessionId,
  peerId,
  caps,
  ws,
  initialDocs = [],
}: UseQollabDocsOptions): UseQollabDocsReturn {

  const [docs,        setDocs]       = useState<DocMeta[]>(initialDocs);
  const [activeDocId, setActiveDocId] = useState<string | null>(null);
  const [activeDoc,   setActiveDoc]   = useState<DocContent | null>(null);
  const [loadingDoc,  setLoadingDoc]  = useState(false);

  const canCreate = caps.includes("doc:create");
  const canEdit   = caps.includes("doc:edit");
  const canDelete = caps.includes("doc:delete");

  // ── WS sync ───────────────────────────────────────────────────────────────

  useEffect(() => {
    return ws.onMessage(msg => {
      if (msg.type === "init") {
        setDocs(msg.docs);
      }

      if (msg.type === "doc:created") {
        setDocs(prev => {
          if (prev.find(d => d.id === msg.id)) return prev;
          return [...prev, {
            id:        msg.id,
            title:     msg.title,
            createdBy: msg.createdBy,
            updatedAt: Date.now(),
          }];
        });
      }

      if (msg.type === "doc:updated") {
        // Update active doc content if open
        setActiveDoc(prev => {
          if (!prev || prev.id !== msg.id) return prev;
          return { ...prev, content: msg.content, updatedAt: Date.now() };
        });
        // Update meta timestamp
        setDocs(prev => prev.map(d =>
          d.id === msg.id ? { ...d, updatedAt: Date.now() } : d
        ));
      }

      if (msg.type === "doc:renamed") {
        setDocs(prev => prev.map(d =>
          d.id === msg.id ? { ...d, title: msg.title, updatedAt: Date.now() } : d
        ));
        setActiveDoc(prev =>
          prev?.id === msg.id ? { ...prev, title: msg.title } : prev
        );
      }

      if (msg.type === "doc:deleted") {
        setDocs(prev => prev.filter(d => d.id !== msg.id));
        setActiveDoc(prev => prev?.id === msg.id ? null : prev);
        setActiveDocId(prev => prev === msg.id ? null : prev);
      }
    });
  }, [ws]);

  // ── Actions ───────────────────────────────────────────────────────────────

  const openDoc = useCallback(async (id: string) => {
    if (activeDocId === id) return;
    setActiveDocId(id);
    setLoadingDoc(true);
    try {
      const doc = await getDoc(sessionId, id);
      setActiveDoc(doc);
    } catch {
      setActiveDoc(null);
    } finally {
      setLoadingDoc(false);
    }
  }, [activeDocId, sessionId]);

  const closeDoc = useCallback(() => {
    setActiveDocId(null);
    setActiveDoc(null);
  }, []);

  const createNewDoc = useCallback(async (title = "Untitled"): Promise<string | null> => {
    if (!canCreate) return null;
    if (docs.length >= 10) return null;

    try {
      const id = await createDoc(sessionId, peerId, title);
      // Optimistic add
      setDocs(prev => [...prev, {
        id,
        title,
        createdBy: peerId,
        updatedAt: Date.now(),
      }]);
      return id;
    } catch (e) {
      console.error("[useQollabDocs] createDoc failed:", e);
      return null;
    }
  }, [canCreate, docs.length, sessionId, peerId]);

  // Debounced save — called on every keystroke from editor
  const saveTimers = new Map<string, ReturnType<typeof setTimeout>>();

  const saveDoc = useCallback((id: string, content: string) => {
    if (!canEdit) return;

    // Optimistic local update
    setActiveDoc(prev => prev?.id === id ? { ...prev, content } : prev);
    setDocs(prev => prev.map(d => d.id === id ? { ...d, updatedAt: Date.now() } : d));

    // Debounce server action — wait 500ms after last keystroke
    if (saveTimers.has(id)) clearTimeout(saveTimers.get(id)!);
    saveTimers.set(id, setTimeout(() => {
      updateDoc(sessionId, peerId, id, content).catch(console.error);
      saveTimers.delete(id);
    }, 500));
  }, [canEdit, sessionId, peerId]);

  const renameDocument = useCallback((id: string, title: string) => {
    if (!canEdit) return;
    // Optimistic
    setDocs(prev => prev.map(d => d.id === id ? { ...d, title } : d));
    setActiveDoc(prev => prev?.id === id ? { ...prev, title } : prev);
    renameDoc(sessionId, peerId, id, title).catch(console.error);
  }, [canEdit, sessionId, peerId]);

  const deleteDocument = useCallback((id: string) => {
    if (!canDelete) return;
    // Optimistic
    setDocs(prev => prev.filter(d => d.id !== id));
    if (activeDocId === id) {
      setActiveDocId(null);
      setActiveDoc(null);
    }
    deleteDoc(sessionId, peerId, id).catch(console.error);
  }, [canDelete, activeDocId, sessionId, peerId]);

  return {
    docs,
    activeDoc,
    activeDocId,
    loadingDoc,
    openDoc,
    closeDoc,
    createNewDoc,
    saveDoc,
    renameDocument,
    deleteDocument,
    canCreate,
    canEdit,
    canDelete,
  };
}