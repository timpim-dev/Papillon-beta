import {
  Attachment as PawnoteAttachment,
  news as PawnoteNews,
  NewsInformation,
  newsInformationAcknowledge,
  NewsQuestion,
  newsRead,
  NewsSurvey,
  newsSurveySend,
  SessionHandle,
} from "@blockshub/pawnote-lts";

import { News } from "@/services/shared/news";
import { error } from "@/utils/logger/logger";

export function readRawTextField(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }
  if (value && typeof value === "object" && "V" in value) {
    const inner = (value as { V?: unknown }).V;
    return typeof inner === "string" ? inner : "";
  }
  return "";
}

export function formatSurveyQuestionsHtml(questions: NewsQuestion[]): string {
  return questions
    .map(q => {
      const title = (q.title || q.fullTitle || "").trim();
      const body = readRawTextField(q.content).trim();
      const selected = new Set(q.selectedAnswers ?? []);
      const choicesHtml =
        Array.isArray(q.choices) && q.choices.length > 0
          ? `<ul>${q.choices
              .map(c => {
                const chosen = selected.has(c.position) ? " (Sélectionné)" : "";
                return `<li>${c.value}${chosen}</li>`;
              })
              .join("")}</ul>`
          : "";
      const answerHtml = q.textInputAnswer?.trim()
        ? `<p><i>Réponse : ${q.textInputAnswer.trim()}</i></p>`
        : "";
      return [title ? `<b>${title}</b>` : "", body, choicesHtml, answerHtml]
        .filter(Boolean)
        .join("<br/>");
    })
    .filter(Boolean)
    .join("<br/><br/>");
}

/**
 * Fetches news and surveys from PRONOTE.
 * @param {SessionHandle} session - The session handle for the PRONOTE account.
 * @param {string} accountId - The ID of the account requesting the news.
 * @returns {Promise<News[]>} A promise that resolves to an array of News objects.
 */
export async function fetchPronoteNews(session: SessionHandle, accountId: string): Promise<News[]> {
  const result: News[] = [];

  const response = await PawnoteNews(session);
  const items = response.items ?? [];
  for (const item of items) {
    const isSurvey = item.is === "survey";
    let rawAttachments: PawnoteAttachment[] = [];
    let content = "";

    if (isSurvey) {
      const survey = item as NewsSurvey;
      const questions = survey.questions ?? [];
      content =
        formatSurveyQuestionsHtml(questions) ||
        readRawTextField((survey as unknown as { content?: unknown }).content) ||
        (item.title ?? "");
      rawAttachments = questions.flatMap(q => q.attachments ?? []);
    } else {
      const infoItem = item as NewsInformation;
      const rawQuestions = (infoItem as unknown as { questions?: NewsQuestion[] }).questions;
      const infoQuestions = Array.isArray(rawQuestions) && rawQuestions.length > 0
        ? rawQuestions
        : infoItem.question
          ? [infoItem.question]
          : [];
      content =
        readRawTextField(infoItem.content) ||
        infoQuestions.map(q => readRawTextField(q.content)).filter(Boolean).join("<br/><br/>") ||
        (infoQuestions.some(q => (q.choices?.length ?? 0) > 0)
          ? formatSurveyQuestionsHtml(infoQuestions)
          : "") ||
        readRawTextField(infoItem.question?.fullTitle) ||
        readRawTextField(infoItem.question?.title);
      rawAttachments = infoItem.attachments ?? infoItem.question?.attachments ?? [];
    }

    result.push({
      id: item.id,
      title: item.title,
      createdAt: item.creationDate,
      acknowledged: item.read,
      attachments: rawAttachments.map(attachment => ({
        type: attachment.kind,
        name: attachment.name,
        url: attachment.url,
        createdByAccount: accountId,
      })),
      content,
      author: item.author ?? "",
      category: item.category?.name ?? "",
      ref: item,
      createdByAccount: accountId,
      question: isSurvey,
    });
  }
  return result;
}

export async function setPronoteNewsAsAcknowledged(
  session: SessionHandle,
  news: News
): Promise<News> {
  if (news.ref) {
    const refObj = news.ref as NewsInformation | NewsSurvey;
    if (refObj.is === "survey") {
      await newsRead(session, refObj, true);
    } else {
      await newsInformationAcknowledge(session, refObj);
    }
    return {
      ...news,
      acknowledged: true,
    };
  }

  throw error("Reference for news item is missing.", "setPronoteNewsAsAcknowledged");
}

export async function submitPronoteNewsSurvey(
  session: SessionHandle,
  news: News
): Promise<News> {
  if (!news.ref) {
    throw error("Reference for survey item is missing.", "submitPronoteNewsSurvey");
  }
  const refObj = news.ref as NewsSurvey;
  if (refObj.is !== "survey") {
    return setPronoteNewsAsAcknowledged(session, news);
  }
  await newsSurveySend(session, refObj, true);
  return {
    ...news,
    acknowledged: true,
    content: formatSurveyQuestionsHtml(refObj.questions ?? []),
  };
}