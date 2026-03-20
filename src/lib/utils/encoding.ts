// lib/utils/encoding.ts

export function arrayBufferToBase64(buffer: ArrayBuffer): string {
    const uint8 = new Uint8Array(buffer);
    let binary = "";
    for (let i = 0; i < uint8.length; i++) binary += String.fromCharCode(uint8[i]);
    return btoa(binary);
}
  
export function arrayBufferToUint8Array(buffer: ArrayBuffer): number[] {
    return [...new Uint8Array(buffer)];
}