/**
 * Pure checks for student document uploads (no database or filesystem).
 * The file type is decided by the bytes, never by the client's declared
 * content type or file extension.
 */
export const DOCUMENT_TYPES = {
  "application/pdf": "pdf",
  "image/png": "png",
  "image/jpeg": "jpg",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
} as const;
export type DocumentType = keyof typeof DOCUMENT_TYPES;

export const MAX_DOCUMENTS_PER_STUDENT = 50;

export function documentMaxBytes() {
  const value = Number(process.env.DOCUMENT_MAX_BYTES);
  return Number.isInteger(value) && value >= 1024 && value <= 50 * 1024 * 1024 ? value : 10 * 1024 * 1024;
}

const startsWith = (bytes: Buffer, signature: number[]) => signature.every((b, i) => bytes[i] === b);

/** Returns the detected type, or null for anything not on the allowlist. */
export function detectDocumentType(bytes: Buffer): DocumentType | null {
  if (bytes.length < 8) return null;
  if (bytes.subarray(0, 5).toString("latin1") === "%PDF-") return "application/pdf";
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "image/png";
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return "image/jpeg";
  // DOCX is a ZIP archive whose entries include word/document.xml.
  if (startsWith(bytes, [0x50, 0x4b, 0x03, 0x04]) && bytes.includes("word/document.xml", 0, "latin1")) {
    return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  }
  return null;
}

/**
 * A safe display/download name: no paths or control characters, a bounded
 * length, and an extension that matches the detected type.
 */
export function safeFileName(raw: string, type: DocumentType) {
  const base = (raw.split(/[\\/]/).pop() ?? "")
    .normalize("NFC")
    .replace(/[\u0000-\u001f\u007f<>:"|?*]+/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^\.+/, "");
  const stem = (base.replace(/\.[A-Za-z0-9]{1,8}$/, "") || "document").slice(0, 120);
  return `${stem}.${DOCUMENT_TYPES[type]}`;
}

/** Content-Disposition for downloads: an ASCII fallback plus the UTF-8 name. */
export function attachmentHeader(fileName: string) {
  const ascii = fileName.replace(/[^\x20-\x7e]/g, "_").replace(/["\\]/g, "_");
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(fileName)}`;
}
