import { describe, expect, it, jest } from "@jest/globals";

jest.mock("react-native-mmkv", () => ({
  createMMKV: () => ({
    getString: () => undefined,
    set: () => undefined,
    remove: () => false,
    delete: () => false,
    getAllKeys: () => [],
  }),
}));

import {
  news as fetchPawnoteNews,
  newsInformationAcknowledge,
  newsRead,
  newsSurveySend,
} from "@blockshub/pawnote-lts";

import { fetchPronoteNews, setPronoteNewsAsAcknowledged } from "@/services/pronote/news";

function createMockSession(handler: (requestName: string, payload: any) => any) {
  const sentRequests: Array<{ name: string; data: any }> = [];
  const session: any = {
    information: {
      url: "https://example.pronote.test/pronote",
      id: 1,
      accountKind: 6,
      aesIV: "0123456789abcdef",
      aesKey: "",
      skipEncryption: true,
      skipCompression: true,
      order: 0,
    },
    instance: {
      version: [2025, 2, 0],
    },
    queue: {
      push: async (fn: () => Promise<any>) => fn(),
    },
    fetcher: async ({ content }: { content: string }) => {
      const req = JSON.parse(content);
      const parsedData = typeof req.dataSec === "string" ? JSON.parse(req.dataSec) : req.dataSec;
      sentRequests.push({ name: req.id, data: parsedData });
      session.information.order++;
      const responseData = handler(req.id, parsedData);
      return {
        content: JSON.stringify({
          dataSec: JSON.stringify({
            Signature: {},
            data: responseData,
          }),
        }),
      };
    },
  };
  return { session, sentRequests };
}

describe("Patched pawnote-lts news decoding and SaisieActualites", () => {
  it("decodes string/object content, multiple info questions, and direct listeActualites fallback", async () => {
    const { session } = createMockSession(() => ({
      listeCategories: { V: [{ N: "1", L: "Vie scolaire", estDefaut: true }] },
      listeActualites: {
        V: [
          {
            N: "info-1",
            L: "Réunion parents",
            estSondage: false,
            lue: false,
            auteur: "Proviseur",
            listeQuestions: {
              V: [
                { N: "q1", L: "Première partie", texte: "Texte brut", genreReponse: 0, reponse: { V: {} } },
                { N: "q2", L: "Deuxième partie", contenu: { V: "<p>HTML contenu</p>" }, genreReponse: 0, reponse: { V: {} } },
              ],
            },
          },
          {
            N: "survey-1",
            L: "Sortie scolaire",
            estSondage: true,
            lue: false,
            auteur: "CPE",
            listeQuestions: {
              V: [
                {
                  N: "sq1",
                  L: "Choix",
                  titre: "Choix",
                  genreReponse: 2,
                  texte: { V: "<p>Participez-vous ?</p>" },
                  listeChoix: { V: [{ L: "Oui", rang: 1 }, { L: "Non", rang: 2 }] },
                  reponse: { V: { N: "0", avecReponse: false, estReponseAttendue: true } },
                },
              ],
            },
          },
        ],
      },
    }));

    const res = await fetchPawnoteNews(session);
    expect(res.items).toHaveLength(2);
    expect(res.items[0].is).toBe("information");
    expect((res.items[0] as any).content).toContain("Texte brut");
    expect((res.items[0] as any).content).toContain("HTML contenu");
    expect(res.items[1].is).toBe("survey");
    expect((res.items[1] as any).questions[0].content).toBe("<p>Participez-vous ?</p>");

    const shared = await fetchPronoteNews(session, "acct-1");
    expect(shared).toHaveLength(2);
    expect(shared[0].content).toContain("Texte brut");
    expect(shared[1].content).toContain("Participez-vous ?");
    expect(shared[1].content).toContain("Oui");
  });

  it("handles SaisieActualites safely when public is undefined or answerID is missing", async () => {
    const { session, sentRequests } = createMockSession(() => ({}));

    const infoWithoutPublic: any = {
      is: "information",
      id: "info-no-pub",
      title: "Sans public",
      category: { id: "1", name: "Info", default: true },
      creationDate: new Date(),
      author: "Admin",
      public: undefined,
      read: false,
      question: {
        id: "q-1",
        fullTitle: "Q",
        title: "Q",
        position: 0,
        kind: 0,
        content: "Body",
        attachments: [],
        answerID: undefined,
        answered: false,
        shouldAnswer: true,
        choices: undefined,
      },
      attachments: [],
      acknowledged: false,
      needToAcknowledge: true,
      content: "Body",
    };

    await expect(newsInformationAcknowledge(session, infoWithoutPublic)).resolves.toBeUndefined();
    expect(sentRequests[0].name).toBe("SaisieActualites");
    expect(sentRequests[0].data.data.listeActualites[0].genrePublic).toBeUndefined();
    expect(sentRequests[0].data.data.listeActualites[0].listeQuestions[0].reponse.N).toBe(0);
    expect(infoWithoutPublic.read).toBe(true);

    const surveyWithoutPublic: any = {
      is: "survey",
      id: "survey-no-pub",
      title: "Sondage",
      category: { id: "1", name: "Sondage", default: true },
      creationDate: new Date(),
      author: "Admin",
      public: undefined,
      read: false,
      questions: [],
      isAnonymous: false,
    };

    await expect(newsRead(session, surveyWithoutPublic, true)).resolves.toBeUndefined();
    expect(surveyWithoutPublic.read).toBe(true);

    await expect(newsSurveySend(session, surveyWithoutPublic, true)).resolves.toBeUndefined();

    const updated = await setPronoteNewsAsAcknowledged(session, {
      id: "cache-only",
      title: "Cached",
      createdAt: new Date(),
      acknowledged: false,
      attachments: [],
      content: "Body",
      author: "Admin",
      category: "Info",
      createdByAccount: "acct-1",
    });
    expect(updated.acknowledged).toBe(true);
  });
});
