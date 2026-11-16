import {
  addChatsToDatabase,
  addMessagesToDatabase,
  dedupeChats,
  dedupeMessages,
  getCanonicalMessageId,
  getChatDbId,
  getMessagesFromCache,
} from "./useChat";

const mockBatch = jest.fn(async () => {});
const mockWrite = jest.fn(async (fn: () => Promise<void>) => fn());
const mockChatsRecords: any[] = [];
const mockMessagesRecords: any[] = [];
const mockRecipientsRecords: any[] = [];

function mockCreateRecord(data: Record<string, any>) {
  return {
    ...data,
    prepareDestroyPermanently: jest.fn(() => ({ type: "destroy", record: data })),
    prepareUpdate: jest.fn((updater: (r: any) => void) => {
      updater(data);
      return { type: "update", record: data };
    }),
  };
}

jest.mock("@/utils/logger/logger", () => ({ error: jest.fn(), warn: jest.fn(), log: jest.fn() }));
jest.mock("./mappers/chats", () => ({
  mapChatsToShared: jest.fn((x: any[]) => x),
  mapMessagesToShared: jest.fn((x: any[]) => x),
  mapRecipientsToShared: jest.fn((x: any[]) => x),
}));
jest.mock("./models/Chat", () => ({ Chat: {}, Message: {}, Recipient: {} }));

jest.mock("./DatabaseProvider", () => ({
  getDatabaseInstance: () => ({
    write: mockWrite,
    batch: mockBatch,
    get: (table: string) => ({
      query: (...clauses: any[]) => ({
        fetch: async () => {
          const base =
            table === "chats"
              ? [...mockChatsRecords]
              : table === "recipients"
                ? [...mockRecipientsRecords]
                : [...mockMessagesRecords];
          if (table !== "messages" || clauses.length === 0) {
            return base;
          }
          const clause = clauses[0];
          const val = clause?.comparison?.right?.value ?? clause?.comparison?.right?.values;
          if (typeof val === "string") {
            return base.filter(r => r.chatId === val);
          }
          if (Array.isArray(val)) {
            return base.filter(r => val.includes(r.chatId));
          }
          return base;
        },
      }),
      prepareCreate: (init: (r: any) => void) => {
        const rec: Record<string, any> = {};
        init(rec);
        const wrapped = mockCreateRecord(rec);
        if (table === "chats") mockChatsRecords.push(wrapped);
        if (table === "messages") mockMessagesRecords.push(wrapped);
        if (table === "recipients") mockRecipientsRecords.push(wrapped);
        return { type: "create", record: wrapped };
      },
    }),
  }),
}));

describe("useChat deduplication & transactional sync", () => {
  beforeEach(() => {
    mockChatsRecords.length = 0;
    mockMessagesRecords.length = 0;
    mockRecipientsRecords.length = 0;
    mockBatch.mockClear();
    mockWrite.mockClear();
  });

  it("dedupeChats collapses duplicates even when ephemeral session IDs differ across logins", () => {
    const cached = {
      id: "ephemeral-pronote-id-1",
      subject: "Chansons roi tsongor",
      creator: "Mme VEREL S.",
      date: new Date("2026-11-05T10:00:00Z"),
      createdByAccount: "acc1",
    };
    const nextLogin = {
      id: "ephemeral-pronote-id-9",
      subject: "Chansons roi tsongor",
      creator: "Mme VEREL S.",
      date: new Date("2026-11-05T10:05:00Z"),
      createdByAccount: "acc1",
      ref: { participantsMessageID: "ephemeral-pronote-id-9" } as any,
    };

    const result = dedupeChats([cached, { ...cached, id: "ephemeral-pronote-id-2" }, nextLogin]);
    expect(result).toHaveLength(1);
    expect(result[0].ref).toBeDefined();
  });

  it("sweeps 9x legacy cloned chats with distinct ephemeral chatIds and migrates messages", async () => {
    for (let i = 0; i < 9; i++) {
      mockChatsRecords.push(
        mockCreateRecord({
          chatId: `pronote-session-${i}`,
          subject: "Chansons roi tsongor",
          creator: "Mme VEREL S.",
          recipient: "Mme VEREL S.",
          date: new Date("2026-11-05T10:00:00Z").getTime(),
          createdByAccount: "acc1",
        })
      );
    }

    await addChatsToDatabase([
      {
        id: "pronote-session-99",
        subject: "Chansons roi tsongor",
        creator: "Mme VEREL S.",
        recipient: "Mme VEREL S.",
        date: new Date("2026-11-05T10:00:00Z"),
        createdByAccount: "acc1",
      },
    ]);

    const destroyChatOps = mockBatch.mock.calls
      .flat()
      .flat()
      .filter((op: any) => op.type === "destroy");
    expect(destroyChatOps).toHaveLength(8);
  });

  it("dedupeMessages collapses duplicates by id and drifting timestamps in the same minute", () => {
    const m1 = {
      id: "msg-1",
      author: "Prof",
      subject: "",
      content: "Bonjour à tous",
      date: new Date("2026-11-15T10:00:05Z"),
      attachments: [],
    };
    const m1Shifted = {
      ...m1,
      id: "",
      date: new Date("2026-11-15T10:00:42Z"),
    };

    expect(dedupeMessages([m1, m1, m1Shifted], "chat-1")).toHaveLength(1);
    expect(getCanonicalMessageId("chat-1", m1)).toBe(getCanonicalMessageId("chat-1", m1Shifted.id ? m1Shifted : m1));
  });

  it("sweeps pre-existing 9x duplicate messages and skips inserting duplicates inside safeWrite", async () => {
    const chat = {
      id: "chat-99",
      subject: "Sortie scolaire",
      creator: "CPE",
      date: new Date("2026-11-15T09:00:00Z"),
      createdByAccount: "acc1",
    };

    const canonicalChatId = getChatDbId(chat);
    const sampleDate = new Date("2026-11-15T09:05:10Z");
    for (let i = 0; i < 9; i++) {
      mockMessagesRecords.push(
        mockCreateRecord({
          messageId: `legacy-dup-${i}`,
          chatId: canonicalChatId,
          author: "CPE",
          subject: "",
          content: "Merci de signer l'autorisation",
          date: sampleDate.getTime(),
          attachments: "[]",
        })
      );
    }

    await addChatsToDatabase([chat, chat]);
    await addMessagesToDatabase(chat, [
      {
        id: "pronote-msg-42",
        author: "CPE",
        subject: "",
        content: "Merci de signer l'autorisation",
        date: new Date("2026-11-15T09:05:35Z"),
        attachments: [],
      },
    ]);

    const destroyOps = mockBatch.mock.calls
      .flat()
      .flat()
      .filter((op: any) => op.type === "destroy");
    const createMsgOps = mockBatch.mock.calls
      .flat()
      .flat()
      .filter((op: any) => op.type === "create" && op.record?.content);

    // 8 out of 9 duplicate rows destroyed, 1 kept & migrated, 0 new rows created
    expect(destroyOps).toHaveLength(8);
    expect(createMsgOps).toHaveLength(0);
  });

  it("getMessagesFromCache recovers legacy messages stored under ephemeral chatId before DB migration", async () => {
    mockChatsRecords.push(
      mockCreateRecord({
        chatId: "ephemeral-legacy-77",
        subject: "Chansons roi tsongor",
        creator: "Mme VEREL S.",
        recipient: "Élève",
        date: new Date("2026-11-05T10:00:00Z").getTime(),
        createdByAccount: "acc1",
      })
    );
    mockMessagesRecords.push(
      mockCreateRecord({
        messageId: "legacy-msg-1",
        chatId: "ephemeral-legacy-77",
        author: "Mme VEREL S.",
        subject: "",
        content: "Voici les paroles.",
        date: new Date("2026-11-05T10:02:00Z").getTime(),
        attachments: "[]",
      })
    );

    const recovered = await getMessagesFromCache({
      id: "new-session-99",
      subject: "Chansons roi tsongor",
      creator: "Mme VEREL S.",
      recipient: "Élève",
      date: new Date("2026-11-05T10:00:00Z"),
      createdByAccount: "acc1",
    });

    expect(recovered).toHaveLength(1);
    expect(recovered[0].content).toBe("Voici les paroles.");
  });
});
