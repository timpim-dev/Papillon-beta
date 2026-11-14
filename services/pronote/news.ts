import {
  Attachment as PawnoteAttachment,
  news as PawnoteNews,
  NewsInformation,
  newsInformationAcknowledge,
  NewsSurvey,
  SessionHandle,
} from "@blockshub/pawnote-lts";

import { News } from "@/services/shared/news";
import { error } from "@/utils/logger/logger";

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
      content = questions
        .map(q => {
          const title = q.title?.trim() ?? "";
          const body = q.content?.trim() ?? "";
          return [title ? `<b>${title}</b>` : "", body].filter(Boolean).join("<br/>");
        })
        .filter(Boolean)
        .join("<br/><br/>");
      rawAttachments = questions.flatMap(q => q.attachments ?? []);
    } else {
      const infoItem = item as NewsInformation;
      content = infoItem.content ?? "";
      rawAttachments = infoItem.attachments ?? [];
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
      ref: item as NewsInformation,
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
    await newsInformationAcknowledge(session, news.ref as NewsInformation);
    return {
	  ...news,
	  acknowledged: true,
    };
  }

  throw error("Reference for news item is missing.", "setPronoteNewsAsAcknowledged");
}