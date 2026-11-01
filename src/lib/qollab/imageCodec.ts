// src/lib/qollab/imageCodec.ts
// Client-side image resize + encode for whiteboard objects.
// Resizes to max 400px on longest side, converts to webp, returns ArrayBuffer.
//
// Binary format:
//   [0-1]  width   u16
//   [2-3]  height  u16
//   [4-7]  reserved (future: mime, quality flags)
//   [8+]   webp bytes

export interface EncodedImage {
    width:  number;
    height: number;
    data:   ArrayBuffer;
  }
  
  const MAX_SIZE    = 400; // max px on longest side for whiteboard
  const DOC_MAX_SIZE = 800; // max px on longest side for documents
  const WEBP_QUALITY = 0.82;
  
  // ── Resize + encode ───────────────────────────────────────────────────────────
  
  async function resizeAndEncode(
    file:    File | Blob,
    maxSize: number,
  ): Promise<EncodedImage> {
    return new Promise((resolve, reject) => {
      const img = new Image();
      const url = URL.createObjectURL(file);
  
      img.onload = () => {
        URL.revokeObjectURL(url);
  
        // Compute target dimensions
        const { naturalWidth: w, naturalHeight: h } = img;
        const scale  = Math.min(1, maxSize / Math.max(w, h));
        const tw     = Math.round(w * scale);
        const th     = Math.round(h * scale);
  
        const canvas  = document.createElement("canvas");
        canvas.width  = tw;
        canvas.height = th;
  
        const ctx = canvas.getContext("2d")!;
        ctx.drawImage(img, 0, 0, tw, th);
  
        canvas.toBlob(blob => {
          if (!blob) return reject(new Error("Failed to encode image"));
          blob.arrayBuffer().then(raw => {
            // Prepend header
            const buf    = new ArrayBuffer(8 + raw.byteLength);
            const view   = new DataView(buf);
            const pixels = new Uint8Array(buf, 8);
  
            view.setUint16(0, tw, false);
            view.setUint16(2, th, false);
            view.setUint32(4, 0,  false); // reserved
  
            pixels.set(new Uint8Array(raw));
            resolve({ width: tw, height: th, data: buf });
          }).catch(reject);
        }, "image/webp", WEBP_QUALITY);
      };
  
      img.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error("Failed to load image"));
      };
  
      img.src = url;
    });
  }
  
  // ── Public API ────────────────────────────────────────────────────────────────
  
  // For whiteboard objects — max 400px
  export async function encodeWhiteboardImage(file: File | Blob): Promise<EncodedImage> {
    return resizeAndEncode(file, MAX_SIZE);
  }
  
  // For document embeds — max 800px
  export async function encodeDocImage(file: File | Blob): Promise<EncodedImage> {
    return resizeAndEncode(file, DOC_MAX_SIZE);
  }
  
  // Decode header from stored ArrayBuffer
  export function decodeImageHeader(buf: ArrayBuffer): { width: number; height: number } {
    const view = new DataView(buf);
    return {
      width:  view.getUint16(0, false),
      height: view.getUint16(2, false),
    };
  }
  
  // Extract raw webp bytes from stored ArrayBuffer
  export function extractImageBytes(buf: ArrayBuffer): Uint8Array {
    return new Uint8Array(buf, 8);
  }
  
  // Create a blob URL from stored ArrayBuffer for display
  export function imageBufferToUrl(buf: ArrayBuffer): string {
    const bytes = extractImageBytes(buf);
    const blob  = new Blob([bytes], { type: "image/webp" });
    return URL.createObjectURL(blob);
  }
  
  // Handle paste event — extract image if present
  export async function imageFromPaste(
    e: ClipboardEvent,
    forDoc = false,
  ): Promise<EncodedImage | null> {
    const items = Array.from(e.clipboardData?.items ?? []);
    const imageItem = items.find(i => i.type.startsWith("image/"));
    if (!imageItem) return null;
  
    const file = imageItem.getAsFile();
    if (!file) return null;
  
    return forDoc ? encodeDocImage(file) : encodeWhiteboardImage(file);
  }
  
  // Handle drop event — extract image if present
  export async function imageFromDrop(
    e: DragEvent,
    forDoc = false,
  ): Promise<EncodedImage | null> {
    const files = Array.from(e.dataTransfer?.files ?? []);
    const imageFile = files.find(f => f.type.startsWith("image/"));
    if (!imageFile) return null;
  
    return forDoc ? encodeDocImage(imageFile) : encodeWhiteboardImage(imageFile);
  }