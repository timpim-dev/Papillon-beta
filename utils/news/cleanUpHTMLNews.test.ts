import { formatSurveyQuestionsHtml } from "@/services/pronote/news";
import { cleanHtmlForArticle } from "./cleanUpHTMLNews";

jest.mock("@/utils/logger/logger", () => ({ error: jest.fn(), warn: jest.fn(), log: jest.fn() }));
jest.mock("@blockshub/pawnote-lts", () => ({
  news: jest.fn(),
  newsInformationAcknowledge: jest.fn(),
  newsRead: jest.fn(),
  newsSurveySend: jest.fn(),
}));

describe("cleanHtmlForArticle", () => {
  it("preserves images and text formatting instead of stripping image notices to blank", () => {
    const html = '<div><img src="https://example.org/flyer.png" style="width:100%" /><p>Bonjour</p></div>';
    const cleaned = cleanHtmlForArticle(html);
    expect(cleaned).toContain('<img src="https://example.org/flyer.png" />');
    expect(cleaned).toContain("<p>Bonjour</p>");
  });

  it("drops style/script blocks and falls back to plain text when exotic tags wrap content", () => {
    const html = "<style>.a{color:red}</style><custom-box>Texte important</custom-box>";
    expect(cleanHtmlForArticle(html)).toBe("<p>Texte important</p>");
    expect(cleanHtmlForArticle("")).toBe("");
  });
});

describe("formatSurveyQuestionsHtml", () => {
  it("formats survey titles, fullTitle fallback, body, choices and existing answers", () => {
    const html = formatSurveyQuestionsHtml([
      {
        id: "q1",
        title: "",
        fullTitle: "Transport scolaire internat",
        position: 1,
        kind: 2,
        maximumLength: 0,
        shouldRespectMaximumChoices: false,
        maximumChoices: 1,
        content: "<p>Merci de répondre avant vendredi.</p>",
        attachments: [],
        answerID: "1",
        answered: true,
        shouldAnswer: true,
        choices: [
          { value: "Oui", position: 1, isTextInput: false },
          { value: "Non", position: 2, isTextInput: false },
        ],
        selectedAnswers: [1],
      },
    ]);

    expect(html).toContain("<b>Transport scolaire internat</b>");
    expect(html).toContain("Merci de répondre avant vendredi.");
    expect(html).toContain("<li>Oui (Sélectionné)</li>");
    expect(html).toContain("<li>Non</li>");
  });
});
