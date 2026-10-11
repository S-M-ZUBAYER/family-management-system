import { MagazineValidationError } from "./magazine-validation.ts";
export const magazineCoverMaxBytes = 10 * 1024 * 1024;
const extensions: Record<string, readonly string[]> = { "image/jpeg": ["jpg", "jpeg"], "image/png": ["png"], "image/webp": ["webp"], "image/gif": ["gif"] };
export function magazineCoverMetadata(file: { name: string; type: string; size: number }) {
  if (typeof file.name !== "string" || !file.name.trim() || file.name.length > 220 || /[\x00-\x1f\x7f/\\]/.test(file.name)
    || typeof file.type !== "string" || !Object.hasOwn(extensions, file.type)
    || !Number.isSafeInteger(file.size) || file.size < 1 || file.size > magazineCoverMaxBytes) {
    throw new MagazineValidationError("MAGAZINE_INVALID_COVER");
  }
  const suffix = file.name.includes(".") ? file.name.split(".").pop()!.toLowerCase() : null;
  if (suffix !== null && !extensions[file.type].includes(suffix)) throw new MagazineValidationError("MAGAZINE_INVALID_COVER");
  return { name: file.name, type: file.type, size: file.size, extension: extensions[file.type][0] };
}
// Bounded header check, not image decoding or a malware scan.
export function magazineCoverHeaderMatches(type: string, bytes: Uint8Array, size: number) {
  const ascii = (start: number, end: number) => String.fromCharCode(...bytes.subarray(start, end));
  if (type === "image/png") return size >= 33 && bytes.length >= 24 && [137,80,78,71,13,10,26,10].every((value, i) => bytes[i] === value)
    && new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(8) === 13 && ascii(12,16) === "IHDR"
    && new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(16) > 0 && new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(20) > 0;
  if (type === "image/jpeg") return size >= 4 && bytes.length >= 4 && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255 && bytes[3] !== 0 && bytes[3] !== 255;
  if (type === "image/gif") return size >= 13 && bytes.length >= 10 && ["GIF87a", "GIF89a"].includes(ascii(0,6))
    && (bytes[6] | bytes[7] << 8) > 0 && (bytes[8] | bytes[9] << 8) > 0;
  if (type === "image/webp") return size >= 20 && bytes.length >= 20 && ascii(0,4) === "RIFF" && ascii(8,12) === "WEBP"
    && ["VP8 ", "VP8L", "VP8X"].includes(ascii(12,16)) && new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(4,true) + 8 === size;
  return false;
}
export async function validateMagazineCover(file: File) {
  const metadata = magazineCoverMetadata(file);
  if (!magazineCoverHeaderMatches(metadata.type, new Uint8Array(await file.slice(0,32).arrayBuffer()), metadata.size)) throw new MagazineValidationError("MAGAZINE_INVALID_COVER");
  return metadata;
}
