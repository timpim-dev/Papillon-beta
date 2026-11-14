import { describe, expect, it } from "@jest/globals";

import {
  classifyAttachment,
  extractAttachmentExtension,
  formatAttachmentTitle,
  guessMimeType,
} from "./classify";

describe("attachmentViewer classify", () => {
  it("extracts extensions cleanly from filenames and Pronote URLs", () => {
    expect(extractAttachmentExtension("cours.PDF")).toBe("pdf");
    expect(
      extractAttachmentExtension(
        undefined,
        "https://demo.index-education.net/pronote/FichiersExternes/abc/consigne.m4a?Session=12345"
      )
    ).toBe("m4a");
    expect(
      extractAttachmentExtension(
        undefined,
        "https://example.org/watch?v=123#section"
      )
    ).toBe("");
  });

  it("classifies images, audio, video, pdf, text, documents, and links", () => {
    expect(classifyAttachment({ type: 1, name: "schema.png", url: "https://x/a" })).toBe("image");
    expect(classifyAttachment({ type: 1, name: "enregistrement.m4a", url: "https://x/b" })).toBe("audio");
    expect(classifyAttachment({ type: 1, name: "oral.mp3", url: "https://x/c" })).toBe("audio");
    expect(classifyAttachment({ type: 1, name: "tp.mp4", url: "https://x/d" })).toBe("video");
    expect(classifyAttachment({ type: 1, name: "sujet.pdf", url: "https://x/e" })).toBe("pdf");
    expect(classifyAttachment({ type: 1, name: "notes.txt", url: "https://x/f" })).toBe("text");
    expect(classifyAttachment({ type: 1, name: "exercice.docx", url: "https://x/g" })).toBe("document");
    expect(classifyAttachment({ type: 0, name: "Ressource web", url: "https://eduscol.education.fr/page" })).toBe("link");
    // Even if Pronote flags a direct media URL as type 0 (Link), classify by file extension
    expect(classifyAttachment({ type: 0, name: "Lien PDF", url: "https://example.org/fiche.pdf?dl=1" })).toBe("pdf");
  });

  it("guesses sensible MIME types and titles", () => {
    expect(guessMimeType("audio.m4a")).toBe("audio/mp4");
    expect(guessMimeType("doc.pdf")).toBe("application/pdf");
    expect(formatAttachmentTitle({ name: "  Mon devoir.pdf  ", url: "https://x/y" })).toBe("Mon devoir.pdf");
    expect(formatAttachmentTitle({ url: "https://example.com/files/carte%20mentale.png?Session=9" })).toBe("carte mentale.png");
  });
});
