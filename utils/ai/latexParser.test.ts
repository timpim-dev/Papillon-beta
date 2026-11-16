import { parseAssistantResponse } from "./aiClient";
import {
  extractLatexBlocks,
  extractLatexTitle,
  renderLatexToHtml,
} from "./latexParser";

jest.mock("expo-secure-store", () => ({
  getItemAsync: jest.fn(),
  setItemAsync: jest.fn(),
  deleteItemAsync: jest.fn(),
}));

jest.mock("react-native-mmkv", () => ({
  createMMKV: () => ({
    getString: jest.fn(),
    set: jest.fn(),
    remove: jest.fn(),
  }),
}));

describe("latexParser & AI response extraction", () => {
  it("extracts <<<LATEX_DOC>>> and parses its title cleanly", () => {
    const raw = [
      "Voici une synthèse pour réviser les suites :",
      "",
      "<<<LATEX_DOC",
      "\\documentclass{article}",
      "\\title{Suites Numériques — Terminale}",
      "\\begin{document}",
      "\\section*{Formules clés}",
      "La somme vaut $S_n = \\frac{u_0 + u_n}{2} \\times (n+1)$ pour $n < 100$.",
      "\\end{document}",
      "LATEX_DOC>>>",
    ].join("\n");

    const { displayText, latexSheets } = extractLatexBlocks(raw);
    expect(displayText).toBe("Voici une synthèse pour réviser les suites :");
    expect(latexSheets).toHaveLength(1);
    expect(latexSheets[0].title).toBe("Suites Numériques — Terminale");
    expect(latexSheets[0].latex).toContain("\\frac{u_0 + u_n}{2}");
  });

  it("extracts fenced latex code blocks alongside reminders in parseAssistantResponse", () => {
    const raw = [
      "Prends le temps de relire le cours :",
      "```latex",
      "\\documentclass{article}",
      "\\begin{document}",
      "\\section*{Lois de Newton}",
      "$$\\sum \\vec{F} = m \\cdot \\vec{a}$$",
      "\\end{document}",
      "```",
      "<<<ACTIONS",
      '[{"type":"flashcard","subject":"Physique","front":"2e loi de Newton","back":"Somme F = m a"}]',
      "ACTIONS>>>",
    ].join("\n");

    const parsed = parseAssistantResponse(raw);
    expect(parsed.displayText).toBe("Prends le temps de relire le cours :");
    expect(parsed.flashcards).toHaveLength(1);
    expect(parsed.latexSheets).toHaveLength(1);
    expect(extractLatexTitle(parsed.latexSheets[0].latex)).toBe("Lois de Newton");
  });

  it("renders LaTeX sections, lists, tables, fractions, radicals and escaped inequalities to HTML", () => {
    const tex = [
      "\\documentclass{article}",
      "\\title{Dérivées & Limites}",
      "\\begin{document}",
      "\\section*{Règles principales}",
      "Pour tout $x \\in \\mathbb{R}$ avec $x < 5$, on a $\\frac{\\sqrt{x + 1}}{2}$ et $\\alpha \\le \\beta$.",
      "\\begin{itemize}",
      "\\item \\textbf{Produit} : $(uv)' = u'v + uv'$",
      "\\item \\textit{Quotient} : $\\frac{u'v - uv'}{v^2}$",
      "\\end{itemize}",
      "\\begin{tabular}{|c|c|}",
      "Fonction & Dérivée \\\\",
      "\\hline",
      "$x^n$ & $n x^{n-1}$ \\\\",
      "\\end{tabular}",
      "\\end{document}",
    ].join("\n");

    const html = renderLatexToHtml(tex);
    expect(html).toContain("<title>Dérivées &amp; Limites</title>");
    expect(html).toContain("<h2>Règles principales</h2>");
    expect(html).toContain('∈ <span class="math-bb">ℝ</span>');
    expect(html).toContain("x &lt; 5");
    expect(html).toContain('class="frac"');
    expect(html).toContain('class="sqrt-body"');
    expect(html).toContain("α ≤ β");
    expect(html).toContain("<ul><li><strong>Produit</strong>");
    expect(html).toContain("<table><tr><th>Fonction</th><th>Dérivée</th></tr>");
  });
});
