import {
  formatMathText,
  parseInlineMarkdown,
  parseMarkdownBlocks,
} from "./markdownParser";

describe("markdownParser", () => {
  it("parses headings, lists, blockquotes, tables, code blocks and display math", () => {
    const md = [
      "## Plan de révision",
      "",
      "Voici les **3 étapes** avec *méthode* et `formule_1` :",
      "- Relire le cours sur [Papillon](https://papillon.bzh)",
      "1. Faire **l'exercice** n°1",
      "",
      "> Astuce : vérifie toujours le signe de $x^2 - 4$.",
      "",
      "$$\\frac{a + b}{2} \\le \\sqrt{ab}$$",
      "",
      "| Notion | Maîtrise |",
      "| --- | --- |",
      "| Suites | OK |",
      "",
      "```python",
      "def u(n): return 2 * n",
      "```",
    ].join("\n");

    const blocks = parseMarkdownBlocks(md);
    expect(blocks.some(b => b.type === "heading" && b.level === 2)).toBe(true);
    expect(blocks.some(b => b.type === "list-item" && !b.ordered)).toBe(true);
    expect(blocks.some(b => b.type === "list-item" && b.ordered && b.index === 1)).toBe(true);
    expect(blocks.some(b => b.type === "quote")).toBe(true);
    expect(blocks.some(b => b.type === "math-block" && b.text.includes("≤"))).toBe(true);
    expect(blocks.some(b => b.type === "table-row" && b.header)).toBe(true);
    expect(blocks.some(b => b.type === "code-block" && b.language === "python")).toBe(true);
  });

  it("handles inline bold, italic, code, links and ignores snake_case underscores", () => {
    const runs = parseInlineMarkdown("**Gras** et *italique* et `code_var` plus my_variable et ~~barré~~.");
    expect(runs.some(r => r.bold && r.text === "Gras")).toBe(true);
    expect(runs.some(r => r.italic && r.text === "italique")).toBe(true);
    expect(runs.some(r => r.code && r.text === "code_var")).toBe(true);
    expect(runs.some(r => !r.italic && r.text.includes("my_variable"))).toBe(true);
    expect(runs.some(r => r.strike && r.text === "barré")).toBe(true);
  });

  it("formats inline math concisely", () => {
    expect(formatMathText("\\alpha + x^2 \\in \\mathbb{R}")).toBe("α + x² ∈ ℝ");
  });
});
