import { describe, expect, it } from "vitest";
import { contentMatchesType, looksLikeMarkup, sniffFileType } from "./file-sniff";

const bytes = (...parts: (number[] | string)[]) =>
  new Uint8Array(
    parts.flatMap((p) => (typeof p === "string" ? Array.from(p, (c) => c.charCodeAt(0)) : p))
  );

const JPEG = bytes([0xff, 0xd8, 0xff, 0xe0, 0, 0x10], "JFIF", [0, 1, 2]);
const PNG = bytes([0x89], "PNG", [0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0x0d], "IHDR");
const WEBP = bytes("RIFF", [0x24, 0, 0, 0], "WEBPVP8 ");
const HEIC = bytes([0, 0, 0, 0x18], "ftypheic", [0, 0, 0, 0], "mif1heic");
const HEIC_MIF1 = bytes([0, 0, 0, 0x1c], "ftypmif1", [0, 0, 0, 0], "mif1miafheic");
const MP4 = bytes([0, 0, 0, 0x18], "ftypisom", [0, 0, 2, 0], "isomiso2");
const PDF = bytes("%PDF-1.7\n%\xe2\xe3\xcf\xd3\n1 0 obj");
const SVG = bytes('<?xml version="1.0"?><svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');
const HTML = bytes("<!DOCTYPE html><html><body><script>alert(1)</script>");

describe("sniffFileType", () => {
  it("identifies each accepted format", () => {
    expect(sniffFileType(JPEG)).toBe("image/jpeg");
    expect(sniffFileType(PNG)).toBe("image/png");
    expect(sniffFileType(WEBP)).toBe("image/webp");
    expect(sniffFileType(HEIC)).toBe("image/heic");
    expect(sniffFileType(HEIC_MIF1)).toBe("image/heic");
    expect(sniffFileType(PDF)).toBe("application/pdf");
  });

  it("rejects markup and unknown formats", () => {
    expect(sniffFileType(SVG)).toBeNull();
    expect(sniffFileType(HTML)).toBeNull();
    expect(sniffFileType(MP4)).toBeNull();
    expect(sniffFileType(new Uint8Array())).toBeNull();
    expect(sniffFileType(bytes("GIF89a"))).toBeNull();
  });

  it("refuses an HTML page that mentions %PDF- to pass as a PDF", () => {
    expect(sniffFileType(bytes("<html><body>%PDF-1.4</body></html>"))).toBeNull();
  });

  it("accepts a PDF with a short non-markup preamble", () => {
    expect(sniffFileType(bytes("\r\n  %PDF-1.4\n"))).toBe("application/pdf");
  });
});

describe("contentMatchesType", () => {
  it("accepts matching declared types", () => {
    expect(contentMatchesType(JPEG, "image/jpeg")).toBe(true);
    expect(contentMatchesType(PNG, "image/png")).toBe(true);
    expect(contentMatchesType(WEBP, "image/webp")).toBe(true);
    expect(contentMatchesType(HEIC, "image/heic")).toBe(true);
    expect(contentMatchesType(HEIC, "image/heif")).toBe(true);
    expect(contentMatchesType(PDF, "application/pdf")).toBe(true);
  });

  it("rejects a mismatch between bytes and declared type", () => {
    expect(contentMatchesType(PNG, "image/jpeg")).toBe(false);
    expect(contentMatchesType(PDF, "image/png")).toBe(false);
  });

  it("rejects SVG or HTML declared as an image or PDF", () => {
    for (const t of ["image/png", "image/jpeg", "image/webp", "image/heic", "application/pdf"]) {
      expect(contentMatchesType(SVG, t)).toBe(false);
      expect(contentMatchesType(HTML, t)).toBe(false);
    }
  });
});

describe("looksLikeMarkup", () => {
  it("flags svg/html heads", () => {
    expect(looksLikeMarkup(SVG)).toBe(true);
    expect(looksLikeMarkup(HTML)).toBe(true);
    expect(looksLikeMarkup(PDF)).toBe(false);
  });
});
