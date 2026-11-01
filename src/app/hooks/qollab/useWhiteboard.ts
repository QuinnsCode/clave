// src/app/hooks/qollab/useWhiteboard.ts
// Canvas state, drawing logic, object management, server action calls.
// Consumes useQollabWs for live updates.

import { useState, useRef, useCallback, useEffect } from "react";
import {
  encodeStroke,
  decodeStroke,
  type Stroke,
} from "@/lib/qollab/strokeCodec";
import {
  imageBufferToUrl,
  decodeImageHeader,
} from "@/lib/qollab/imageCodec";
import {
  upsertObject,
  deleteObject,
  clearWhiteboard as clearWhiteboardAction,
} from "@/app/serverActions/qollab/whiteboard";
import type { WbObject } from "@/durableObjects/qollabWhiteboardDO";
import type { UseQollabWsReturn } from "./useQollabWs";
import type { UseToolbarReturn } from "./useToolbar";
import type { Capability } from "@/lib/qollab/capabilities";

// ── Constants ─────────────────────────────────────────────────────────────────

export const VIEW_SIZE  = 1200;
export const WORLD_SIZE = VIEW_SIZE * 2;

// ── Types ─────────────────────────────────────────────────────────────────────

export interface CanvasObject {
  id:        string;
  type:      "stroke" | "text" | "image";
  peerId:    string;
  updatedAt: number;
  // Decoded data
  stroke?:   Stroke;
  text?:     { x: number; y: number; content: string; color: number; fontSize: number };
  image?:    { x: number; y: number; width: number; height: number; url: string; data: ArrayBuffer };
}

export interface Viewport {
  x: number; // world offset
  y: number;
}

export interface UseWhiteboardOptions {
  sessionId:    string;
  peerId:       string;
  caps:         Capability[];
  ws:           UseQollabWsReturn;
  toolbar:      UseToolbarReturn;
  initialObjects?: WbObject[];
}

export interface UseWhiteboardReturn {
  objects:      CanvasObject[];
  viewport:     Viewport;
  isDrawing:    boolean;
  canvasRef:    React.RefObject<HTMLCanvasElement>;
  wrapRef:      React.RefObject<HTMLDivElement>;
  onPointerDown: (e: React.PointerEvent) => void;
  onPointerMove: (e: React.PointerEvent) => void;
  onPointerUp:   (e: React.PointerEvent) => void;
  onWheel:       (e: React.WheelEvent) => void;
  onPaste:       (e: React.ClipboardEvent) => void;
  onDrop:        (e: React.DragEvent) => void;
  deleteObj:     (id: string) => void;
  clearAll:      () => void;
  panTo:         (x: number, y: number) => void;
}

// ── Decode WbObject → CanvasObject ────────────────────────────────────────────

function decodeObject(obj: WbObject): CanvasObject | null {
  try {
    if (obj.type === "stroke") {
      const stroke = decodeStroke(obj.id, obj.data);
      return { id: obj.id, type: "stroke", peerId: obj.peerId, updatedAt: obj.updatedAt, stroke };
    }
    if (obj.type === "text") {
      const text = JSON.parse(new TextDecoder().decode(obj.data));
      return { id: obj.id, type: "text", peerId: obj.peerId, updatedAt: obj.updatedAt, text };
    }
    if (obj.type === "image") {
      const { width, height } = decodeImageHeader(obj.data);
      const url = imageBufferToUrl(obj.data);
      return { id: obj.id, type: "image", peerId: obj.peerId, updatedAt: obj.updatedAt,
        image: { x: 0, y: 0, width, height, url, data: obj.data } };
    }
    return null;
  } catch { return null; }
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useWhiteboard({
  sessionId,
  peerId,
  caps,
  ws,
  toolbar,
  initialObjects = [],
}: UseWhiteboardOptions): UseWhiteboardReturn {

  const [objects,   setObjects]   = useState<CanvasObject[]>(() =>
    initialObjects.map(decodeObject).filter(Boolean) as CanvasObject[]
  );
  const [viewport,  setViewport]  = useState<Viewport>({ x: 0, y: 0 });
  const [isDrawing, setIsDrawing] = useState(false);

  const canvasRef      = useRef<HTMLCanvasElement>(null);
  const wrapRef        = useRef<HTMLDivElement>(null);
  const activeStroke   = useRef<{ points: number[]; startedAt: number } | null>(null);
  const isPanning      = useRef(false);
  const panStart       = useRef({ x: 0, y: 0, vx: 0, vy: 0 });
  const imageUrlCache  = useRef<Map<string, string>>(new Map());

  // ── WS message handler ────────────────────────────────────────────────────

  useEffect(() => {
    return ws.onMessage(msg => {
      if (msg.type === "init") {
        setObjects(msg.objects.map(decodeObject).filter(Boolean) as CanvasObject[]);
      }
      if (msg.type === "wb:upsert") {
        const decoded = decodeObject(msg.object);
        if (!decoded) return;
        setObjects(prev => {
          const idx = prev.findIndex(o => o.id === decoded.id);
          if (idx >= 0) {
            const next = [...prev];
            next[idx] = decoded;
            return next;
          }
          return [...prev, decoded];
        });
      }
      if (msg.type === "wb:delete") {
        setObjects(prev => prev.filter(o => o.id !== msg.id));
      }
      if (msg.type === "wb:clear") {
        setObjects([]);
      }
    });
  }, [ws]);

  // ── Render canvas ─────────────────────────────────────────────────────────

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.save();
    ctx.translate(-viewport.x, -viewport.y);

    for (const obj of objects) {
      if (obj.type === "stroke" && obj.stroke) {
        const { points, color, width, tool } = obj.stroke;
        ctx.save();
        ctx.strokeStyle = `rgba(${(color >>> 24) & 0xff},${(color >>> 16) & 0xff},${(color >>> 8) & 0xff},${(color & 0xff) / 255})`;
        ctx.lineWidth   = width;
        ctx.lineCap     = "round";
        ctx.lineJoin    = "round";
        ctx.globalAlpha = tool === 2 ? 0.6 : 1; // brush = soft
        ctx.beginPath();
        for (let i = 0; i < points.length; i += 2) {
          if (i === 0) ctx.moveTo(points[i], points[i + 1]);
          else ctx.lineTo(points[i], points[i + 1]);
        }
        ctx.stroke();
        ctx.restore();
      }

      if (obj.type === "text" && obj.text) {
        const { x, y, content, color, fontSize } = obj.text;
        ctx.save();
        ctx.fillStyle = `rgba(${(color >>> 24) & 0xff},${(color >>> 16) & 0xff},${(color >>> 8) & 0xff},${(color & 0xff) / 255})`;
        ctx.font      = `${fontSize}px 'DM Sans', sans-serif`;
        ctx.fillText(content, x, y);
        ctx.restore();
      }

      if (obj.type === "image" && obj.image) {
        const { x, y, width, height, data } = obj.image;
        let url = imageUrlCache.current.get(obj.id);
        if (!url) {
          url = imageBufferToUrl(data);
          imageUrlCache.current.set(obj.id, url);
        }
        const img = new Image();
        img.src = url;
        if (img.complete) ctx.drawImage(img, x, y, width, height);
        else img.onload = () => {
          const c2 = canvasRef.current;
          if (c2) c2.getContext("2d")?.drawImage(img, x - viewport.x, y - viewport.y, width, height);
        };
      }
    }

    ctx.restore();
  }, [objects, viewport]);

  // ── Canvas size ───────────────────────────────────────────────────────────

  useEffect(() => {
    const canvas = canvasRef.current;
    const wrap   = wrapRef.current;
    if (!canvas || !wrap) return;

    const ro = new ResizeObserver(() => {
      canvas.width  = wrap.clientWidth;
      canvas.height = wrap.clientHeight;
    });
    ro.observe(wrap);
    return () => ro.disconnect();
  }, []);

  // ── Pointer helpers ───────────────────────────────────────────────────────

  function worldPoint(e: React.PointerEvent): { x: number; y: number } {
    const wrap = wrapRef.current!;
    const rect = wrap.getBoundingClientRect();
    return {
      x: e.clientX - rect.left + viewport.x,
      y: e.clientY - rect.top  + viewport.y,
    };
  }

  // ── Drawing ───────────────────────────────────────────────────────────────

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    if (toolbar.mode === "pan") {
      isPanning.current = true;
      panStart.current  = { x: e.clientX, y: e.clientY, vx: viewport.x, vy: viewport.y };
      return;
    }

    if (!caps.includes("wb:draw")) return;

    if (toolbar.tool === "pencil" || toolbar.tool === "marker" || toolbar.tool === "brush") {
      const { x, y } = worldPoint(e);
      activeStroke.current = { points: [x, y], startedAt: Date.now() };
      setIsDrawing(true);
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
    }

    if (toolbar.tool === "text") {
      const { x, y } = worldPoint(e);
      const content   = prompt("Enter text:");
      if (!content) return;

      const id  = crypto.randomUUID();
      const obj: WbObject = {
        id,
        type:      "text",
        peerId,
        updatedAt: Date.now(),
        data:      new TextEncoder().encode(JSON.stringify({
          x, y, content,
          color:    toolbar.colorU32,
          fontSize: 18,
        })).buffer,
      };

      // Optimistic local add
      setObjects(prev => [...prev, {
        id, type: "text", peerId, updatedAt: obj.updatedAt,
        text: { x, y, content, color: toolbar.colorU32, fontSize: 18 },
      }]);

      upsertObject(sessionId, peerId, obj).catch(console.error);
    }
  }, [toolbar, caps, viewport, peerId, sessionId]);

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    if (toolbar.mode === "pan" && isPanning.current) {
      const dx  = e.clientX - panStart.current.x;
      const dy  = e.clientY - panStart.current.y;
      const nx  = Math.max(0, Math.min(WORLD_SIZE - VIEW_SIZE, panStart.current.vx - dx));
      const ny  = Math.max(0, Math.min(WORLD_SIZE - VIEW_SIZE, panStart.current.vy - dy));
      setViewport({ x: nx, y: ny });
      return;
    }

    if (!activeStroke.current) return;
    const { x, y } = worldPoint(e);
    activeStroke.current.points.push(x, y);

    // Live preview on canvas
    const canvas = canvasRef.current;
    const ctx    = canvas?.getContext("2d");
    if (ctx && activeStroke.current.points.length >= 4) {
      const pts = activeStroke.current.points;
      const len = pts.length;
      ctx.save();
      ctx.strokeStyle = toolbar.color;
      ctx.lineWidth   = toolbar.width;
      ctx.lineCap     = "round";
      ctx.lineJoin    = "round";
      ctx.globalAlpha = toolbar.opacity;
      ctx.beginPath();
      ctx.moveTo(pts[len - 4] - viewport.x, pts[len - 3] - viewport.y);
      ctx.lineTo(pts[len - 2] - viewport.x, pts[len - 1] - viewport.y);
      ctx.stroke();
      ctx.restore();
    }
  }, [toolbar, viewport]);

  const onPointerUp = useCallback(async (e: React.PointerEvent) => {
    isPanning.current = false;

    if (!activeStroke.current) return;
    setIsDrawing(false);

    const { points } = activeStroke.current;
    activeStroke.current = null;

    if (points.length < 4) return; // need at least 2 points

    const strokeTool = toolbar.tool === "pencil" ? 0 : toolbar.tool === "marker" ? 1 : 2;
    const f32        = new Float32Array(points);
    const id         = crypto.randomUUID();

    const stroke: Stroke = {
      id,
      color:  toolbar.colorU32,
      tool:   strokeTool,
      width:  toolbar.width,
      points: f32,
    };

    const encoded = encodeStroke(stroke);
    const obj: WbObject = {
      id,
      type:      "stroke",
      peerId,
      updatedAt: Date.now(),
      data:      encoded,
    };

    // Optimistic local add
    setObjects(prev => [...prev, {
      id, type: "stroke", peerId, updatedAt: obj.updatedAt, stroke,
    }]);

    upsertObject(sessionId, peerId, obj).catch(console.error);
  }, [toolbar, peerId, sessionId]);

  // ── Wheel to pan ──────────────────────────────────────────────────────────

  const onWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    setViewport(v => ({
      x: Math.max(0, Math.min(WORLD_SIZE - VIEW_SIZE, v.x + e.deltaX)),
      y: Math.max(0, Math.min(WORLD_SIZE - VIEW_SIZE, v.y + e.deltaY)),
    }));
  }, []);

  // ── Paste / Drop images ───────────────────────────────────────────────────

  const onPaste = useCallback(async (e: React.ClipboardEvent) => {
    if (!caps.includes("wb:draw")) return;
    const { imageFromPaste: ifp } = await import("@/lib/qollab/imageCodec");
    const encoded = await ifp(e);
    if (!encoded) return;

    const id  = crypto.randomUUID();
    const obj: WbObject = {
      id, type: "image", peerId,
      updatedAt: Date.now(),
      data: encoded.data,
    };

    setObjects(prev => [...prev, {
      id, type: "image", peerId, updatedAt: obj.updatedAt,
      image: {
        x: viewport.x + 100, y: viewport.y + 100,
        width: encoded.width, height: encoded.height,
        url: URL.createObjectURL(new Blob([encoded.data.slice(8)], { type: "image/webp" })),
        data: encoded.data,
      },
    }]);

    upsertObject(sessionId, peerId, obj).catch(console.error);
  }, [caps, peerId, sessionId, viewport]);

  const onDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault();
    if (!caps.includes("wb:draw")) return;
    const { imageFromDrop: ifd } = await import("@/lib/qollab/imageCodec");
    const encoded = await ifd(e);
    if (!encoded) return;

    const id  = crypto.randomUUID();
    const obj: WbObject = {
      id, type: "image", peerId,
      updatedAt: Date.now(),
      data: encoded.data,
    };

    setObjects(prev => [...prev, {
      id, type: "image", peerId, updatedAt: obj.updatedAt,
      image: {
        x: viewport.x + 100, y: viewport.y + 100,
        width: encoded.width, height: encoded.height,
        url: URL.createObjectURL(new Blob([encoded.data.slice(8)], { type: "image/webp" })),
        data: encoded.data,
      },
    }]);

    upsertObject(sessionId, peerId, obj).catch(console.error);
  }, [caps, peerId, sessionId, viewport]);

  // ── Delete / Clear ────────────────────────────────────────────────────────

  const deleteObj = useCallback((id: string) => {
    const obj = objects.find(o => o.id === id);
    if (!obj) return;
    const canDelete = obj.peerId === peerId
      ? caps.includes("wb:delete_own")
      : caps.includes("wb:delete_others");
    if (!canDelete) return;

    setObjects(prev => prev.filter(o => o.id !== id));
    deleteObject(sessionId, peerId, id).catch(console.error);
  }, [objects, caps, peerId, sessionId]);

  const clearAll = useCallback(() => {
    if (!caps.includes("wb:clear")) return;
    setObjects([]);
    clearWhiteboardAction(sessionId, peerId).catch(console.error);
  }, [caps, peerId, sessionId]);

  const panTo = useCallback((x: number, y: number) => {
    setViewport({
      x: Math.max(0, Math.min(WORLD_SIZE - VIEW_SIZE, x)),
      y: Math.max(0, Math.min(WORLD_SIZE - VIEW_SIZE, y)),
    });
  }, []);

  return {
    objects, viewport, isDrawing,
    canvasRef, wrapRef,
    onPointerDown, onPointerMove, onPointerUp,
    onWheel, onPaste, onDrop,
    deleteObj, clearAll, panTo,
  };
}