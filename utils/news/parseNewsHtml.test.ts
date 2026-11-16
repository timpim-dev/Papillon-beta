import { parseNewsHtmlToBlocks } from "./parseNewsHtml";

describe("parseNewsHtmlToBlocks", () => {
  it("parses nested Pronote div/span/p markup, links, lists, images and entities", () => {
    const html = `
      <div style="font-family:Arial">
        <h2>Transports scolaires &amp; Internat</h2>
        <div><span><p>Bonjour, merci de consulter <b>le planning</b> avant <i>vendredi</i>.</p></span></div>
        <ul>
          <li>Ligne A : départ <u>7h45</u></li>
          <li>Voir le site : <a href="https://example.org/bus">Horaires</a></li>
        </ul>
        <img src="https://example.org/plan.png" />
      </div>
    `;

    const blocks = parseNewsHtmlToBlocks(html);
    expect(blocks.some(b => b.type === "heading" && b.runs.map(r => r.text).join("") === "Transports scolaires & Internat")).toBe(true);
    expect(blocks.some(b => b.type === "paragraph" && b.runs.some(r => r.bold && r.text === "le planning"))).toBe(true);
    expect(blocks.some(b => b.type === "list-item" && b.runs.some(r => r.href === "https://example.org/bus"))).toBe(true);
    expect(blocks.some(b => b.type === "image" && b.src === "https://example.org/plan.png")).toBe(true);
  });

  it("extracts table rows, plain URLs and plain-text fallbacks cleanly", () => {
    const tableHtml = "<table><tr><th>Jour</th><th>Salle</th></tr><tr><td>Lundi</td><td>B12</td></tr></table>";
    const tableBlocks = parseNewsHtmlToBlocks(tableHtml);
    expect(tableBlocks).toHaveLength(2);
    expect(tableBlocks[0].type).toBe("table-row");

    const plainBlocks = parseNewsHtmlToBlocks("Rendez-vous sur https://papillon.bzh pour plus d'infos.");
    expect(plainBlocks).toHaveLength(1);
    expect(plainBlocks[0].type).toBe("paragraph");
    if (plainBlocks[0].type === "paragraph") {
      expect(plainBlocks[0].runs.some(r => r.href === "https://papillon.bzh")).toBe(true);
    }
  });
});
