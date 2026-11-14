export type AttachmentPreviewKind =
  | "image"
  | "audio"
  | "video"
  | "pdf"
  | "text"
  | "document"
  | "link";

export interface AttachmentLike {
  type?: number;
  kind?: number;
  name?: string;
  url?: string;
}

export const PRONOTE_MOBILE_USER_AGENT =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 19_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 PRONOTE Mobile APP Version/2.0.11";

const IMAGE_EXTENSIONS = new Set([
  "jpg",
  "jpeg",
  "png",
  "gif",
  "webp",
  "bmp",
  "heic",
  "heif",
  "svg",
]);

const AUDIO_EXTENSIONS = new Set([
  "mp3",
  "m4a",
  "aac",
  "wav",
  "ogg",
  "oga",
  "opus",
  "flac",
  "amr",
  "3gp",
  "caf",
  "weba",
]);

const VIDEO_EXTENSIONS = new Set([
  "mp4",
  "mov",
  "m4v",
  "webm",
  "mkv",
  "avi",
]);

const TEXT_EXTENSIONS = new Set([
  "txt",
  "md",
  "csv",
  "json",
  "xml",
  "log",
  "html",
  "htm",
  "yaml",
  "yml",
]);

const MIME_BY_EXTENSION: Record<string, string> = {
  pdf: "application/pdf",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  gif: "image/gif",
  webp: "image/webp",
  svg: "image/svg+xml",
  heic: "image/heic",
  mp3: "audio/mpeg",
  m4a: "audio/mp4",
  aac: "audio/aac",
  wav: "audio/wav",
  ogg: "audio/ogg",
  opus: "audio/opus",
  flac: "audio/flac",
  amr: "audio/amr",
  mp4: "video/mp4",
  mov: "video/quicktime",
  webm: "video/webm",
  txt: "text/plain",
  md: "text/markdown",
  csv: "text/csv",
  json: "application/json",
  html: "text/html",
  htm: "text/html",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xls: "application/vnd.ms-excel",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ppt: "application/vnd.ms-powerpoint",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  zip: "application/zip",
};

function extractExtFromPath(value?: string): string {
  if (!value) return "";
  const cleaned = value.split("#")[0].split("?")[0].trim();
  if (!cleaned) return "";
  const base = cleaned.split("/").pop() || cleaned;
  const dotIndex = base.lastIndexOf(".");
  if (dotIndex <= 0 || dotIndex === base.length - 1) return "";
  return base.slice(dotIndex + 1).toLowerCase();
}

export function extractAttachmentExtension(name?: string, url?: string): string {
  const fromName = extractExtFromPath(name);
  if (fromName) return fromName;

  if (!url) return "";
  try {
    const parsed = new URL(url);
    return extractExtFromPath(decodeURIComponent(parsed.pathname));
  } catch {
    return extractExtFromPath(url);
  }
}

export function classifyAttachment(
  attachment: AttachmentLike
): AttachmentPreviewKind {
  const ext = extractAttachmentExtension(attachment.name, attachment.url);

  if (ext === "pdf") return "pdf";
  if (IMAGE_EXTENSIONS.has(ext)) return "image";
  if (AUDIO_EXTENSIONS.has(ext)) return "audio";
  if (VIDEO_EXTENSIONS.has(ext)) return "video";
  if (TEXT_EXTENSIONS.has(ext)) return "text";

  const rawType = attachment.type ?? attachment.kind;
  if (rawType === 0 && !ext) {
    return "link";
  }

  return rawType === 0 ? "link" : "document";
}

export function guessMimeType(name?: string, url?: string): string {
  const ext = extractAttachmentExtension(name, url);
  if (ext && MIME_BY_EXTENSION[ext]) {
    return MIME_BY_EXTENSION[ext];
  }
  const kind = classifyAttachment({ name, url, type: 1 });
  switch (kind) {
    case "pdf":
      return "application/pdf";
    case "image":
      return "image/*";
    case "audio":
      return "audio/*";
    case "video":
      return "video/*";
    case "text":
      return "text/plain";
    default:
      return "application/octet-stream";
  }
}

export function formatAttachmentTitle(attachment: AttachmentLike): string {
  const trimmed = attachment.name?.trim();
  if (trimmed) return trimmed;
  if (attachment.url) {
    try {
      const parsed = new URL(attachment.url);
      const last = decodeURIComponent(parsed.pathname.split("/").pop() || "");
      if (last) return last;
      return parsed.hostname || "Lien externe";
    } catch {
      const part = attachment.url.split("?")[0].split("/").pop();
      if (part) return part;
    }
  }
  return "Pièce jointe";
}

export function getAttachmentPreviewBadge(kind: AttachmentPreviewKind): string {
  switch (kind) {
    case "image":
      return "Image";
    case "audio":
      return "Audio";
    case "video":
      return "Vidéo";
    case "pdf":
      return "Document PDF";
    case "text":
      return "Texte";
    case "document":
      return "Fichier";
    case "link":
      return "Lien";
  }
}
