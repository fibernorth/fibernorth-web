/**
 * Content sniffing for public uploads.
 *
 * The browser-declared MIME type is attacker-controlled, so an upload that
 * claims to be `image/png` could really be SVG or HTML with script in it.
 * These helpers look at the actual leading bytes ("magic numbers") and only
 * accept a file when they match the declared type.
 */

export type SniffedType =
  | "image/jpeg"
  | "image/png"
  | "image/webp"
  | "image/heic"
  | "application/pdf";

// ISO-BMFF brands used by HEIC/HEIF stills (iPhone photos use heic/mif1).
const HEIF_BRANDS = new Set([
  "heic", "heix", "heim", "heis", "hevc", "hevx", "hevm", "hevs", "mif1", "msf1",
]);

function ascii(bytes: Uint8Array, start: number, end: number): string {
  let s = "";
  for (let i = start; i < end && i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return s;
}

/**
 * Markup that a browser could render as a document (and run script in).
 * Checked over the first 1KB, case-insensitively.
 */
export function looksLikeMarkup(bytes: Uint8Array): boolean {
  const head = ascii(bytes, 0, 1024).toLowerCase();
  return /<\s*(svg|html|script|!doctype|\?xml|body|iframe|head)\b/.test(head);
}

/** Identify a file by its leading bytes, or null if it is none of the accepted types. */
export function sniffFileType(bytes: Uint8Array): SniffedType | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return "image/jpeg";
  }
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 && ascii(bytes, 1, 4) === "PNG" &&
    bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a
  ) {
    return "image/png";
  }
  if (bytes.length >= 12 && ascii(bytes, 0, 4) === "RIFF" && ascii(bytes, 8, 12) === "WEBP") {
    return "image/webp";
  }
  if (bytes.length >= 12 && ascii(bytes, 4, 8) === "ftyp") {
    const boxSize =
      ((bytes[0] << 24) | (bytes[1] << 16) | (bytes[2] << 8) | bytes[3]) >>> 0;
    const end = Math.min(bytes.length, Math.max(16, boxSize));
    // major brand at 8..12, compatible brands from 16 to end of the box
    const brands = [ascii(bytes, 8, 12)];
    for (let i = 16; i + 4 <= end; i += 4) brands.push(ascii(bytes, i, i + 4));
    if (brands.some((b) => HEIF_BRANDS.has(b))) return "image/heic";
    return null;
  }
  // PDF readers accept the header anywhere in the first 1KB; some scanners
  // emit a short preamble. Markup in that preamble is still refused below.
  const head = ascii(bytes, 0, 1024);
  if (head.indexOf("%PDF-") !== -1 && !looksLikeMarkup(bytes)) return "application/pdf";
  return null;
}

/**
 * True when the bytes are really the declared type (image/heif counts as
 * image/heic). SVG, HTML and anything else without a matching binary header
 * is refused: the image types need their magic bytes at offset 0, and a PDF
 * with markup in its first 1KB is refused by sniffFileType.
 */
export function contentMatchesType(bytes: Uint8Array, declared: string): boolean {
  const d = declared.trim().toLowerCase();
  const want = d === "image/heif" ? "image/heic" : d;
  const got = sniffFileType(bytes);
  return got !== null && got === want;
}
