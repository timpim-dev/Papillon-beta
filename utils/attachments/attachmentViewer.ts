import { File, Paths } from "expo-file-system";
import * as WebBrowser from "expo-web-browser";
import { Linking } from "react-native";

import {
  AttachmentLike,
  extractAttachmentExtension,
  formatAttachmentTitle,
  guessMimeType,
  PRONOTE_MOBILE_USER_AGENT,
} from "./classify";

export * from "./classify";

export interface CachedAttachmentFile {
  uri: string;
  mimeType: string;
  title: string;
  isLocal: boolean;
  readText: () => Promise<string>;
}

function stableHash(input: string): string {
  let hash = 2166136261;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

function buildSafeCacheFilename(name?: string, url?: string): string {
  const title = formatAttachmentTitle({ name, url });
  const ext = extractAttachmentExtension(name, url);
  const cleanBase = title
    .replace(/[^a-zA-Z0-9._-]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 60);
  const hash = stableHash(url || title);
  const baseWithHash = cleanBase ? `att_${hash}_${cleanBase}` : `att_${hash}`;
  if (ext && !baseWithHash.toLowerCase().endsWith(`.${ext}`)) {
    return `${baseWithHash}.${ext}`;
  }
  return baseWithHash;
}

export function isLocalFileUri(url?: string): boolean {
  if (!url) return false;
  return url.startsWith("file://") || url.startsWith("content://");
}

export async function downloadAttachmentToCache(
  attachment: AttachmentLike
): Promise<CachedAttachmentFile> {
  const url = attachment.url?.trim() || "";
  if (!url) {
    throw new Error("URL de pièce jointe manquante.");
  }

  const title = formatAttachmentTitle(attachment);
  const mimeType = guessMimeType(attachment.name, url);

  if (isLocalFileUri(url)) {
    const localFile = new File(url);
    return {
      uri: localFile.uri,
      mimeType,
      title,
      isLocal: true,
      readText: () => localFile.text(),
    };
  }

  const cacheFilename = buildSafeCacheFilename(attachment.name, url);
  const targetFile = new File(Paths.cache, cacheFilename);
  const downloaded = await File.downloadFileAsync(url, targetFile, {
    idempotent: true,
    headers: {
      "User-Agent": PRONOTE_MOBILE_USER_AGENT,
    },
  });

  return {
    uri: downloaded.uri,
    mimeType,
    title,
    isLocal: true,
    readText: () => downloaded.text(),
  };
}

export async function previewLocalOrRemoteAttachment(
  localUri: string | null,
  attachment: AttachmentLike
): Promise<void> {
  const title = formatAttachmentTitle(attachment);
  const mimeType = guessMimeType(attachment.name, attachment.url);

  if (localUri) {
    const file = new File(localUri);
    await file.preview({
      mimeType,
      title,
    });
    return;
  }

  if (attachment.url) {
    if (isLocalFileUri(attachment.url)) {
      const file = new File(attachment.url);
      await file.preview({ mimeType, title });
      return;
    }

    try {
      await WebBrowser.openBrowserAsync(attachment.url, {
        presentationStyle: WebBrowser.WebBrowserPresentationStyle.FORM_SHEET,
      });
    } catch {
      await Linking.openURL(attachment.url);
    }
  }
}

export function openAttachmentViewer(
  router: {
    push: (location: {
      pathname: "/(modals)/attachment";
      params: { name: string; url: string; type: string };
    }) => void;
  },
  attachment: AttachmentLike
): void {
  const url = attachment.url?.trim() || "";
  if (!url) return;

  router.push({
    pathname: "/(modals)/attachment",
    params: {
      name: formatAttachmentTitle(attachment),
      url,
      type: String(attachment.type ?? attachment.kind ?? 1),
    },
  });
}
