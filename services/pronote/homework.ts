import {
  assignmentRemoveFile,
  assignmentsFromWeek,
  assignmentStatus,
  assignmentUploadFile,
  AssignmentReturnKind,
  SessionHandle,
  translateToWeekNumber,
} from "@blockshub/pawnote-lts";

import {
  getDateRangeOfWeek,
  getHomeworkRouteId,
  getWeekNumberFromDate,
} from "@/database/useHomework";
import { Homework, HomeworkUploadFileInput, ReturnFormat } from "@/services/shared/homework";
import { getHomeworkUploadMeta, saveHomeworkUploadMeta } from "@/utils/homework/uploadMeta";
import { error } from "@/utils/logger/logger";

/**
  * Fetches homework assignments from PRONOTE for the current week.
  * @param {SessionHandle} session - The session handle for the PRONOTE account.
  * @param {string} accountId - The ID of the account requesting the homeworks.
  * @returns {Promise<Homework[]>} A promise that resolves to an array of Homework objects.
 */
function mapPronoteReturnFormat(kind: number): ReturnFormat {
  switch (kind) {
    case AssignmentReturnKind.Paper:
      return ReturnFormat.PAPER;
    case AssignmentReturnKind.FileUpload:
      return ReturnFormat.FILE_UPLOAD;
    case AssignmentReturnKind.Kiosk:
      return ReturnFormat.KIOSK;
    case AssignmentReturnKind.AudioRecording:
      return ReturnFormat.AUDIO_RECORDING;
    case AssignmentReturnKind.None:
    default:
      return ReturnFormat.NONE;
  }
}

export async function fetchPronoteHomeworks(session: SessionHandle, accountId: string, weekNumberRaw: number): Promise<Homework[]> {
  const result: Homework[] = [];

  const { start } = getDateRangeOfWeek(weekNumberRaw)
  const weekNumber = translateToWeekNumber(start, session.instance.firstMonday);
  if (session) {
    const homeworks = await assignmentsFromWeek(session, weekNumber);
    const maxUploadSizeBytes = session.user?.authorizations?.maxAssignmentFileUploadSize;
    for (const homework of homeworks) {
      const uploadedAttachment = homework.return.uploaded
        ? {
            type: homework.return.uploaded.kind,
            name: homework.return.uploaded.name,
            url: homework.return.uploaded.url,
            createdByAccount: accountId,
          }
        : undefined;
      const mapped: Homework = {
        id: homework.id,
        pronoteAssignmentId: homework.id,
        subject: homework.subject.name,
        content: homework.description,
        dueDate: homework.deadline,
        isDone: homework.done,
        returnFormat: mapPronoteReturnFormat(homework.return.kind),
        canUpload: Boolean(homework.return.canUpload),
        uploadedAttachment,
        maxUploadSizeBytes,
        attachments: homework.attachments.map((attachment) => ({
          type: attachment.kind,
          name: attachment.name,
          url: attachment.url,
          createdByAccount: accountId,
        })),
        evaluation: false,
        custom: false,
        createdByAccount: accountId,
      };
      const meta = {
        canUpload: Boolean(homework.return.canUpload),
        uploadedAttachment,
        maxUploadSizeBytes,
        pronoteAssignmentId: homework.id,
      };
      saveHomeworkUploadMeta(homework.id, meta);
      saveHomeworkUploadMeta(getHomeworkRouteId(mapped), meta);
      result.push(mapped);
    }
  }

  return result;
}

export async function setPronoteHomeworkAsDone(session: SessionHandle, homework: Homework, status?: boolean): Promise<Homework> {
  if (homework.fromCache) {
    error("You can't set data from cache as done.")
    return homework;
  }

  try {
    await assignmentStatus(session, homework.id, status || !homework.isDone)
  } catch (err) {
    error(String(err))
  }
  return {
    ...homework,
    isDone: status || !homework.isDone,
    progress: (status || !homework.isDone) ? 1 : 0
  }
}

async function resolvePronoteAssignmentId(
  session: SessionHandle,
  homework: Homework
): Promise<string> {
  const cachedMeta = getHomeworkUploadMeta(homework.id);
  const direct = homework.pronoteAssignmentId || cachedMeta?.pronoteAssignmentId;
  if (direct) return direct;

  try {
    const weekNum = getWeekNumberFromDate(homework.dueDate);
    const { start } = getDateRangeOfWeek(weekNum, homework.dueDate.getFullYear());
    const pronoteWeek = translateToWeekNumber(start, session.instance.firstMonday);
    const list = await assignmentsFromWeek(session, pronoteWeek);
    const match = list.find(
      item =>
        item.id === homework.id ||
        (item.subject.name === homework.subject &&
          Math.abs(item.deadline.getTime() - homework.dueDate.getTime()) < 24 * 60 * 60 * 1000 &&
          item.description === homework.content)
    );
    if (match) return match.id;
  } catch {
    // Fall back to homework.id
  }

  return homework.id;
}

export async function uploadPronoteHomeworkFile(
  session: SessionHandle,
  accountId: string,
  homework: Homework,
  file: HomeworkUploadFileInput
): Promise<Homework> {
  const assignmentId = await resolvePronoteAssignmentId(session, homework);
  const maxSize = session.user?.authorizations?.maxAssignmentFileUploadSize;
  if (typeof maxSize === "number" && typeof file.size === "number" && file.size > maxSize) {
    throw new Error(`Le fichier dépasse la taille maximale autorisée (${Math.round(maxSize / (1024 * 1024))} Mo).`);
  }

  const rnFile = {
    uri: file.uri,
    name: file.name,
    type: file.mimeType || "audio/mp4",
    size: file.size,
  };

  await assignmentUploadFile(
    session,
    assignmentId,
    rnFile as unknown as Blob,
    file.name
  );

  let uploadedAttachment = {
    type: 1,
    name: file.name,
    url: file.uri,
    createdByAccount: accountId,
  };

  try {
    const weekNum = getWeekNumberFromDate(homework.dueDate);
    const { start } = getDateRangeOfWeek(weekNum, homework.dueDate.getFullYear());
    const pronoteWeek = translateToWeekNumber(start, session.instance.firstMonday);
    const list = await assignmentsFromWeek(session, pronoteWeek);
    const refreshed = list.find(item => item.id === assignmentId);
    if (refreshed?.return.uploaded) {
      uploadedAttachment = {
        type: refreshed.return.uploaded.kind,
        name: refreshed.return.uploaded.name,
        url: refreshed.return.uploaded.url,
        createdByAccount: accountId,
      };
    }
  } catch {
    // Keep local attachment preview when refresh fails
  }

  const routeId = getHomeworkRouteId(homework);
  const meta = {
    canUpload: homework.canUpload ?? true,
    uploadedAttachment,
    maxUploadSizeBytes: maxSize ?? homework.maxUploadSizeBytes,
    pronoteAssignmentId: assignmentId,
  };
  saveHomeworkUploadMeta(assignmentId, meta);
  saveHomeworkUploadMeta(homework.id, meta);
  saveHomeworkUploadMeta(routeId, meta);

  return {
    ...homework,
    pronoteAssignmentId: assignmentId,
    canUpload: true,
    uploadedAttachment,
    maxUploadSizeBytes: maxSize ?? homework.maxUploadSizeBytes,
  };
}

export async function removePronoteHomeworkFile(
  session: SessionHandle,
  _accountId: string,
  homework: Homework
): Promise<Homework> {
  const assignmentId = await resolvePronoteAssignmentId(session, homework);
  await assignmentRemoveFile(session, assignmentId);

  const routeId = getHomeworkRouteId(homework);
  const meta = {
    canUpload: homework.canUpload ?? true,
    uploadedAttachment: undefined,
    maxUploadSizeBytes: homework.maxUploadSizeBytes,
    pronoteAssignmentId: assignmentId,
  };
  saveHomeworkUploadMeta(assignmentId, meta);
  saveHomeworkUploadMeta(homework.id, meta);
  saveHomeworkUploadMeta(routeId, meta);

  return {
    ...homework,
    pronoteAssignmentId: assignmentId,
    uploadedAttachment: undefined,
  };
}