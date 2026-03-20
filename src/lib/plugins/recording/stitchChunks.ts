// Client-side chunk stitcher.
// Fetches presigned chunk URLs and concatenates into a single Blob.
// Same logic reusable server-side for pre-assembly.

const CHUNK_DURATION_S = 2.5;

export async function stitchChunks(
    chunkUrls: string[],
    onProgress?: (loaded: number, total: number) => void
  ): Promise<Blob> {
    const buffers: ArrayBuffer[] = [];
  
    for (let i = 0; i < chunkUrls.length; i++) {
      const res = await fetch(chunkUrls[i]);
      if (!res.ok) throw new Error(`Failed to fetch chunk ${i}: ${res.status}`);
      buffers.push(await res.arrayBuffer());
      onProgress?.(i + 1, chunkUrls.length);
    }
  
    return new Blob(buffers, { type: "video/webm" });
}

export function createObjectUrl(blob: Blob): string {
    return URL.createObjectURL(blob);
}

export function revokeObjectUrl(url: string): void {
    URL.revokeObjectURL(url);
}

export async function streamChunksToVideo(
    videoEl: HTMLVideoElement,
    chunkUrls: string[],
    onProgress?: (loaded: number, total: number) => void
  ): Promise<void> {
    let prefetch = 3;
    let loaded   = 0;
  
    const fetchChunk = (url: string) => {
      const start = Date.now();
      return fetch(url).then(r => r.arrayBuffer()).then(buf => ({ buf, ms: Date.now() - start }));
    };
  
    const queue = chunkUrls.slice(0, prefetch).map(fetchChunk);
    const buffers: ArrayBuffer[] = new Array(chunkUrls.length);
  
    for (let i = 0; i < chunkUrls.length; i++) {
      if (i + prefetch < chunkUrls.length) queue.push(fetchChunk(chunkUrls[i + prefetch]));
  
      const { buf, ms } = await queue[i];
      buffers[i] = buf;
  
      // Adaptive prefetch
      const windowMs = 2500;
      if (ms > windowMs * 0.8)      prefetch = Math.min(prefetch + 1, 8);
      else if (ms < windowMs * 0.3) prefetch = Math.max(prefetch - 1, 2);
  
      onProgress?.(++loaded, chunkUrls.length);
    }
  
    const blob  = new Blob(buffers, { type: "video/webm" });
    videoEl.src = URL.createObjectURL(blob);
    videoEl.load();

}