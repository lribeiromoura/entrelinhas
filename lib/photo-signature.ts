export function validPhotoSignature(mime: string, bytes: Uint8Array) {
  if (mime === "image/jpeg") return bytes[0] === 255 && bytes[1] === 216;
  if (mime === "image/png") return [137, 80, 78, 71, 13, 10, 26, 10].every((byte, index) => bytes[index] === byte);
  if (mime === "image/webp") return bytes.length >= 12 && String.fromCharCode(...bytes.subarray(0, 4)) === "RIFF" && String.fromCharCode(...bytes.subarray(8, 12)) === "WEBP";
  return false;
}
