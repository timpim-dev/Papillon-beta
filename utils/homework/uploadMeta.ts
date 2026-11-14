import { createMMKV } from "react-native-mmkv";
import { Attachment } from "@/services/shared/attachment";

export interface HomeworkUploadMeta {
  canUpload: boolean;
  uploadedAttachment?: Attachment;
  maxUploadSizeBytes?: number;
  pronoteAssignmentId?: string;
}

const KEY_PREFIX = "hw_upload_meta:";
let storage: ReturnType<typeof createMMKV> | null | undefined;

function getStorage() {
  if (storage !== undefined) return storage;
  try {
    storage = createMMKV({ id: "homework-upload-meta" });
  } catch {
    storage = null;
  }
  return storage;
}

export function saveHomeworkUploadMeta(
  homeworkId: string,
  meta: HomeworkUploadMeta
): void {
  const store = getStorage();
  if (!store || !homeworkId) return;
  try {
    store.set(`${KEY_PREFIX}${homeworkId}`, JSON.stringify(meta));
  } catch {
    // Ignore storage write errors
  }
}

export function getHomeworkUploadMeta(
  homeworkId: string
): HomeworkUploadMeta | null {
  const store = getStorage();
  if (!store || !homeworkId) return null;
  try {
    const raw = store.getString(`${KEY_PREFIX}${homeworkId}`);
    if (!raw) return null;
    return JSON.parse(raw) as HomeworkUploadMeta;
  } catch {
    return null;
  }
}
