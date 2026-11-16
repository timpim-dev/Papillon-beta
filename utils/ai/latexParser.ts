export interface AiLatexSheet {
  id: string;
  title: string;
  subject?: string;
  latex: string;
}

const GREEK_MAP: Record<string, string> = {
  alpha: "α",
  beta: "β",
  gamma: "γ",
  delta: "δ",
  epsilon: "ε",
  varepsilon: "ε",
  zeta: "ζ",
  eta: "η",
  theta: "θ",
  vartheta: "ϑ",
  iota: "ι",
  kappa: "κ",
  lambda: "λ",
  mu: "μ",
  nu: "ν",
  xi: "ξ",
  pi: "π",
  rho: "ρ",
  sigma: "σ",
  tau: "τ",
  upsilon: "υ",
  phi: "φ",
  varphi: "φ",
  chi: "χ",
  psi: "ψ",
  omega: "ω",
  Gamma: "Γ",
  Delta: "Δ",
  Theta: "Θ",
  Lambda: "Λ",
  Xi: "Ξ",
  Pi: "Π",
  Sigma: "Σ",
  Upsilon: "Υ",
  Phi: "Φ",
  Psi: "Ψ",
  Omega: "Ω",
};

const MATH_SYMBOLS: Record<string, string> = {
  times: "×",
  cdot: "·",
  div: "÷",
  pm: "±",
  mp: "∓",
  le: "≤",
  leq: "≤",
  ge: "≥",
  geq: "≥",
  neq: "≠",
  ne: "≠",
  approx: "≈",
  equiv: "≡",
  sim: "∼",
  simeq: "≃",
  cong: "≅",
  propto: "∝",
  infty: "∞",
  to: "→",
  rightarrow: "→",
  leftarrow: "←",
  leftrightarrow: "↔",
  Rightarrow: "⇒",
  implies: "⇒",
  Leftarrow: "⇐",
  Leftrightarrow: "⇔",
  iff: "⇔",
  mapsto: "↦",
  forall: "∀",
  exists: "∃",
  nexists: "∄",
  in: "∈",
  notin: "∉",
  ni: "∋",
  subset: "⊂",
  subseteq: "⊆",
  supset: "⊃",
  supseteq: "⊇",
  cup: "∪",
  cap: "∩",
  emptyset: "∅",
  varnothing: "∅",
  setminus: "∖",
  land: "∧",
  lor: "∨",
  neg: "¬",
  lnot: "¬",
  sum: "∑",
  prod: "∏",
  int: "∫",
  iint: "∬",
  iiint: "∭",
  oint: "∮",
  partial: "∂",
  nabla: "∇",
  degree: "°",
  deg: "°",
  circ: "∘",
  angle: "∠",
  perp: "⊥",
  parallel: "∥",
  triangle: "△",
  cdots: "⋯",
  ldots: "…",
  dots: "…",
  quad: "  ",
  qquad: "    ",
  ",": " ",
  ";": " ",
};

const BLACKBOARD_MAP: Record<string, string> = {
  R: "ℝ",
  N: "ℕ",
  Z: "ℤ",
  Q: "ℚ",
  C: "ℂ",
  K: "𝕂",
  P: "ℙ",
  E: "𝔼",
  F: "𝔽",
};

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function readBracedArg(source: string, startIndex: number): { value: string; nextIndex: number } | null {
  let i = startIndex;
  while (i < source.length && /\s/.test(source[i])) i++;
  if (source[i] !== "{") return null;
  let depth = 0;
  const contentStart = i + 1;
  for (; i < source.length; i++) {
    if (source[i] === "\\" && i + 1 < source.length) {
      i++;
      continue;
    }
    if (source[i] === "{") depth++;
    else if (source[i] === "}") {
      depth--;
      if (depth === 0) {
        return {
          value: source.slice(contentStart, i),
          nextIndex: i + 1,
        };
      }
    }
  }
  return null;
}

function readOptionalBracketArg(source: string, startIndex: number): { value: string; nextIndex: number } | null {
  let i = startIndex;
  while (i < source.length && /\s/.test(source[i])) i++;
  if (source[i] !== "[") return null;
  let depth = 0;
  const contentStart = i + 1;
  for (; i < source.length; i++) {
    if (source[i] === "[") depth++;
    else if (source[i] === "]") {
      depth--;
      if (depth === 0) {
        return {
          value: source.slice(contentStart, i),
          nextIndex: i + 1,
        };
      }
    }
  }
  return null;
}

function stripLatexInlineMarkup(raw: string): string {
  return raw
    .replace(/\\(?:textbf|textit|emph|underline|texttt|text|mathrm)\{([^{}]*)\}/g, "$1")
    .replace(/\$+/g, "")
    .replace(/\\\\/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Extracts a human-readable title from a LaTeX source document.
 */
export function extractLatexTitle(latex: string, fallback = "Fiche de révision"): string {
  const titleIdx = latex.search(/\\title\s*\{/);
  if (titleIdx >= 0) {
    const braceStart = latex.indexOf("{", titleIdx);
    const parsed = readBracedArg(latex, braceStart);
    const cleaned = parsed ? stripLatexInlineMarkup(parsed.value) : "";
    if (cleaned) return cleaned.slice(0, 90);
  }

  const secIdx = latex.search(/\\section\*?\s*\{/);
  if (secIdx >= 0) {
    const braceStart = latex.indexOf("{", secIdx);
    const parsed = readBracedArg(latex, braceStart);
    const cleaned = parsed ? stripLatexInlineMarkup(parsed.value) : "";
    if (cleaned) return cleaned.slice(0, 90);
  }

  return fallback;
}

function looksLikeRevisionLatex(code: string): boolean {
  return /\\documentclass\b|\\begin\{document\}|\\section\*?\s*\{|\\begin\{(?:itemize|enumerate|align|equation|tcolorbox|tabular)\}/.test(
    code
  );
}

/**
 * Extracts LaTeX revision sheets from AI output (explicit <<<LATEX_DOC>>> blocks or fenced ```latex``` documents)
 * and keeps the chat message clean and readable.
 */
export function extractLatexBlocks(rawText: string): {
  displayText: string;
  latexSheets: AiLatexSheet[];
} {
  const latexSheets: AiLatexSheet[] = [];
  let text = rawText;
  let indexCounter = 0;

  const pushSheet = (rawLatex: string) => {
    const latex = rawLatex.trim();
    if (!latex) return;
    indexCounter += 1;
    latexSheets.push({
      id: `tex_${Date.now()}_${indexCounter}`,
      title: extractLatexTitle(latex),
      latex,
    });
  };

  text = text.replace(/<<<LATEX_DOC\s*([\s\S]*?)\s*LATEX_DOC>>>/gm, (_m, inner: string) => {
    const unwrapped = inner
      .trim()
      .replace(/^```(?:latex|tex)?\s*/i, "")
      .replace(/```\s*$/, "")
      .trim();
    pushSheet(unwrapped);
    return "";
  });

  text = text.replace(/```(?:latex|tex)\s*\n([\s\S]*?)```/gim, (full, inner: string) => {
    if (!looksLikeRevisionLatex(inner)) {
      return full;
    }
    pushSheet(inner);
    return "";
  });

  if (latexSheets.length === 0 && /\\documentclass[\s\S]*\\begin\{document\}[\s\S]*\\end\{document\}/.test(text)) {
    text = text.replace(
      /(\\documentclass[\s\S]*?\\end\{document\})/m,
      (docMatch: string) => {
        pushSheet(docMatch);
        return "";
      }
    );
  }

  return {
    displayText: text.replace(/\n{3,}/g, "\n\n").trim(),
    latexSheets,
  };
}

function renderMathExpression(rawMath: string): string {
  let expr = rawMath.trim();
  const tokens: string[] = [];
  const stash = (html: string): string => {
    const token = `\uFFF0M${tokens.length}\uFFF1`;
    tokens.push(html);
    return token;
  };

  // Normalize common LaTeX math environments inside math mode
  expr = expr.replace(/\\(?:left|right)([()[\]|.{}\\])/g, (_m, delim: string) =>
    delim === "." ? "" : delim
  );

  // Replace \frac{a}{b} (iteratively for nested fractions)
  for (let pass = 0; pass < 4; pass++) {
    let changed = false;
    let out = "";
    let i = 0;
    while (i < expr.length) {
      if (expr.startsWith("\\frac", i) || expr.startsWith("\\dfrac", i) || expr.startsWith("\\tfrac", i)) {
        const cmdLen = expr[i + 1] === "f" ? 5 : 6;
        const num = readBracedArg(expr, i + cmdLen);
        const den = num ? readBracedArg(expr, num.nextIndex) : null;
        if (num && den) {
          changed = true;
          out += stash(
            `<span class="frac"><span class="frac-num">${renderMathExpression(num.value)}</span><span class="frac-den">${renderMathExpression(den.value)}</span></span>`
          );
          i = den.nextIndex;
          continue;
        }
      }
      if (expr.startsWith("\\sqrt", i)) {
        const opt = readOptionalBracketArg(expr, i + 5);
        const arg = readBracedArg(expr, opt ? opt.nextIndex : i + 5);
        if (arg) {
          changed = true;
          const idxHtml = opt ? `<sup class="root-idx">${renderMathExpression(opt.value)}</sup>` : "";
          out += stash(`${idxHtml}√<span class="sqrt-body">${renderMathExpression(arg.value)}</span>`);
          i = arg.nextIndex;
          continue;
        }
      }
      if (expr.startsWith("\\text", i) || expr.startsWith("\\mathrm", i) || expr.startsWith("\\operatorname", i)) {
        const cmdEnd = expr.indexOf("{", i);
        const arg = cmdEnd > i ? readBracedArg(expr, cmdEnd) : null;
        if (arg && /^\\(?:text|mathrm|operatorname)$/.test(expr.slice(i, cmdEnd).trim())) {
          changed = true;
          out += stash(`<span class="math-text">${escapeHtml(arg.value)}</span>`);
          i = arg.nextIndex;
          continue;
        }
      }
      if (expr.startsWith("\\mathbb", i)) {
        const arg = readBracedArg(expr, i + 7);
        if (arg) {
          changed = true;
          const mapped = BLACKBOARD_MAP[arg.value.trim()] ?? escapeHtml(arg.value);
          out += stash(`<span class="math-bb">${mapped}</span>`);
          i = arg.nextIndex;
          continue;
        }
      }
      if (expr.startsWith("\\overrightarrow", i) || expr.startsWith("\\vec", i) || expr.startsWith("\\overline", i) || expr.startsWith("\\bar", i)) {
        const isArrow = expr.startsWith("\\overrightarrow", i) || expr.startsWith("\\vec", i);
        const cmdEnd = expr.indexOf("{", i);
        const arg = cmdEnd > i ? readBracedArg(expr, cmdEnd) : null;
        if (arg && !expr.slice(i, cmdEnd).includes(" ")) {
          changed = true;
          out += stash(
            `<span class="${isArrow ? "math-vec" : "math-bar"}">${renderMathExpression(arg.value)}</span>`
          );
          i = arg.nextIndex;
          continue;
        }
      }
      out += expr[i];
      i++;
    }
    expr = out;
    if (!changed) break;
  }

  // Escape HTML first so inequalities like x < y stay visible text
  expr = escapeHtml(expr);

  // Replace standard named functions
  expr = expr.replace(
    /\\(sin|cos|tan|arcsin|arccos|arctan|sinh|cosh|tanh|ln|log|exp|lim|sup|inf|max|min|det|gcd|mod|arg|deg)\b/g,
    '<span class="math-fn">$1</span>'
  );

  // Replace Greek & symbol commands
  expr = expr.replace(/\\([A-Za-z]+|,|;)/g, (full, cmd: string) => {
    if (GREEK_MAP[cmd]) return GREEK_MAP[cmd];
    if (MATH_SYMBOLS[cmd]) return MATH_SYMBOLS[cmd];
    if (cmd === " ") return " ";
    return full;
  });

  // Super / subscripts: ^{...} / ^x and _{...} / _x
  expr = expr.replace(/\^\{([^{}]+)\}/g, "<sup>$1</sup>");
  expr = expr.replace(/\^([A-Za-z0-9+\-])/g, "<sup>$1</sup>");
  expr = expr.replace(/_\{([^{}]+)\}/g, "<sub>$1</sub>");
  expr = expr.replace(/_([A-Za-z0-9])/g, "<sub>$1</sub>");

  // Clean stray braces in math
  expr = expr.replace(/[{}]/g, "");

  // Restore stashed HTML tokens (twice in case of nesting)
  for (let pass = 0; pass < 3; pass++) {
    expr = expr.replace(/\uFFF0M(\d+)\uFFF1/g, (_m, idx: string) => tokens[Number(idx)] ?? "");
  }

  return expr;
}

function renderInlineLatex(text: string): string {
  const placeholders: string[] = [];
  const hold = (html: string): string => {
    const id = `\uFFF0T${placeholders.length}\uFFF1`;
    placeholders.push(html);
    return id;
  };

  let out = text
    .replace(/\\LaTeX\b/g, "LaTeX")
    .replace(/\\TeX\b/g, "TeX")
    .replace(/\\%/g, "%")
    .replace(/\\&/g, "&amp;")
    .replace(/\\#/g, "#")
    .replace(/\\_/g, "_")
    .replace(/\\~/g, "~")
    .replace(/\\texteuro\b|\\euro\b/g, "€");

  // Inline math $...$ and \(...\)
  out = out.replace(/\\\(([\s\S]*?)\\\)/g, (_m, inner: string) =>
    hold(`<span class="math-inline">${renderMathExpression(inner)}</span>`)
  );
  out = out.replace(/(?<!\\)\$([^$\n]+?)\$/g, (_m, inner: string) =>
    hold(`<span class="math-inline">${renderMathExpression(inner)}</span>`)
  );

  // Links \href{url}{label} and \url{url}
  out = out.replace(/\\href\{([^{}]*)\}\{([^{}]*)\}/g, (_m, url: string, label: string) =>
    hold(`<a href="${escapeHtml(url)}">${renderInlineLatex(label)}</a>`)
  );
  out = out.replace(/\\url\{([^{}]*)\}/g, (_m, url: string) =>
    hold(`<a href="${escapeHtml(url)}">${escapeHtml(url)}</a>`)
  );

  // Inline emphasis tags (run iterative inner->outer for nested tags)
  const tagMap: Array<[RegExp, (inner: string) => string]> = [
    [/\\textbf\{([^{}]*)\}/g, inner => `<strong>${renderInlineLatex(inner)}</strong>`],
    [/\\(?:textit|emph)\{([^{}]*)\}/g, inner => `<em>${renderInlineLatex(inner)}</em>`],
    [/\\underline\{([^{}]*)\}/g, inner => `<u>${renderInlineLatex(inner)}</u>`],
    [/\\texttt\{([^{}]*)\}/g, inner => `<code>${escapeHtml(inner)}</code>`],
    [/\\fbox\{([^{}]*)\}/g, inner => `<span class="inline-box">${renderInlineLatex(inner)}</span>`],
  ];

  for (let pass = 0; pass < 3; pass++) {
    let any = false;
    for (const [re, wrap] of tagMap) {
      out = out.replace(re, (_m, inner: string) => {
        any = true;
        return hold(wrap(inner));
      });
    }
    if (!any) break;
  }

  out = escapeHtml(out);
  out = out.replace(/\\\\/g, "<br/>");
  out = out.replace(/\\newline\b/g, "<br/>");
  out = out.replace(/---/g, "—").replace(/--/g, "–");

  for (let pass = 0; pass < 4; pass++) {
    out = out.replace(/\uFFF0T(\d+)\uFFF1/g, (_m, idx: string) => placeholders[Number(idx)] ?? "");
  }

  return out;
}

function renderListEnvironment(body: string, ordered: boolean): string {
  const parts = body.split(/\\item\b(?:\[[^\]]*\])?/g).map(s => s.trim()).filter(Boolean);
  if (parts.length === 0) return "";
  const tag = ordered ? "ol" : "ul";
  return `<${tag}>${parts.map(p => `<li>${renderInlineLatex(p)}</li>`).join("")}</${tag}>`;
}

function renderTabularEnvironment(body: string): string {
  const rows = body
    .replace(/\\hline/g, "")
    .split(/\\\\/g)
    .map(r => r.trim())
    .filter(Boolean);
  if (rows.length === 0) return "";
  const renderedRows = rows
    .map((row, idx) => {
      const cells = row.split(/(?<!\\)&/).map(c => c.trim());
      const cellTag = idx === 0 ? "th" : "td";
      return `<tr>${cells.map(c => `<${cellTag}>${renderInlineLatex(c)}</${cellTag}>`).join("")}</tr>`;
    })
    .join("");
  return `<table>${renderedRows}</table>`;
}

function renderBodyFragment(fragment: string): string {
  const blocks: string[] = [];
  const holdBlock = (html: string): string => {
    const id = `\n\n\uFFF0B${blocks.length}\uFFF1\n\n`;
    blocks.push(html);
    return id;
  };

  let body = fragment
    .replace(/%[^\n]*/g, "")
    .replace(/\\maketitle\b/g, "")
    .replace(/\\tableofcontents\b/g, "")
    .replace(/\\newpage\b|\\clearpage\b/g, holdBlock('<hr class="page-sep" />'))
    .replace(/\\noindent\b/g, "");

  // Display math: $$...$$, \[...\], equation, align, gather
  body = body.replace(/\$\$([\s\S]*?)\$\$/g, (_m, math: string) =>
    holdBlock(`<div class="math-block">${renderMathExpression(math)}</div>`)
  );
  body = body.replace(/\\\[([\s\S]*?)\\\]/g, (_m, math: string) =>
    holdBlock(`<div class="math-block">${renderMathExpression(math)}</div>`)
  );
  body = body.replace(
    /\\begin\{(equation\*?|align\*?|gather\*?)\}([\s\S]*?)\\end\{\1\}/g,
    (_m, _env: string, math: string) => {
      const lines = math
        .split(/\\\\/)
        .map(line => line.replace(/(?<!\\)&/g, " ").trim())
        .filter(Boolean)
        .map(line => renderMathExpression(line))
        .join("<br/>");
      return holdBlock(`<div class="math-block">${lines}</div>`);
    }
  );

  // Tabular
  body = body.replace(
    /\\begin\{tabular\}\{[^{}]*\}([\s\S]*?)\\end\{tabular\}/g,
    (_m, inner: string) => holdBlock(renderTabularEnvironment(inner))
  );

  // Lists
  body = body.replace(/\\begin\{itemize\}([\s\S]*?)\\end\{itemize\}/g, (_m, inner: string) =>
    holdBlock(renderListEnvironment(inner, false))
  );
  body = body.replace(/\\begin\{enumerate\}([\s\S]*?)\\end\{enumerate\}/g, (_m, inner: string) =>
    holdBlock(renderListEnvironment(inner, true))
  );

  // Callout/box environments
  body = body.replace(
    /\\begin\{(tcolorbox|framed|quote|blockquote|theorem|definition|remark|example)\}(?:\[[^\]]*\])?([\s\S]*?)\\end\{\1\}/g,
    (_m, env: string, inner: string) =>
      holdBlock(`<div class="callout callout-${env}">${renderBodyFragment(inner)}</div>`)
  );

  // Center environment
  body = body.replace(/\\begin\{center\}([\s\S]*?)\\end\{center\}/g, (_m, inner: string) =>
    holdBlock(`<div class="centered">${renderBodyFragment(inner)}</div>`)
  );

  // Sections & headings
  body = body.replace(/\\(?:chapter)\*?\{([^{}]*)\}/g, (_m, t: string) =>
    holdBlock(`<h1>${renderInlineLatex(t)}</h1>`)
  );
  body = body.replace(/\\section\*?\{([^{}]*)\}/g, (_m, t: string) =>
    holdBlock(`<h2>${renderInlineLatex(t)}</h2>`)
  );
  body = body.replace(/\\subsection\*?\{([^{}]*)\}/g, (_m, t: string) =>
    holdBlock(`<h3>${renderInlineLatex(t)}</h3>`)
  );
  body = body.replace(/\\subsubsection\*?\{([^{}]*)\}/g, (_m, t: string) =>
    holdBlock(`<h4>${renderInlineLatex(t)}</h4>`)
  );

  const paragraphs = body
    .split(/\n\s*\n/)
    .map(p => p.trim())
    .filter(Boolean);

  let html = paragraphs
    .map(p => {
      if (/^\uFFF0B\d+\uFFF1$/.test(p)) {
        return p;
      }
      return `<p>${renderInlineLatex(p)}</p>`;
    })
    .join("\n");

  for (let pass = 0; pass < 3; pass++) {
    html = html.replace(/\uFFF0B(\d+)\uFFF1/g, (_m, idx: string) => blocks[Number(idx)] ?? "");
  }

  return html;
}

/**
 * Converts a LaTeX revision sheet into a self-contained A4 HTML document
 * ready for offline PDF generation via expo-print.
 */
export function renderLatexToHtml(
  latex: string,
  options: { title?: string; subject?: string } = {}
): string {
  const title = options.title?.trim() || extractLatexTitle(latex);

  const docStartMatch = /\\begin\{document\}/.exec(latex);
  const docEndMatch = /\\end\{document\}/.exec(latex);
  let bodySource = latex;
  if (docStartMatch && docEndMatch && docEndMatch.index > docStartMatch.index) {
    bodySource = latex.slice(docStartMatch.index + docStartMatch[0].length, docEndMatch.index);
  } else if (docStartMatch) {
    bodySource = latex.slice(docStartMatch.index + docStartMatch[0].length);
  } else {
    bodySource = latex.replace(/\\(?:documentclass|usepackage|geometry|pagestyle|title|author|date)(?:\[[^\]]*\])?\{[^{}]*\}/g, "");
  }

  // Avoid duplicating \title / \author / \date inside rendered body
  bodySource = bodySource
    .replace(/\\title\{[^{}]*\}/g, "")
    .replace(/\\author\{[^{}]*\}/g, "")
    .replace(/\\date\{[^{}]*\}/g, "");

  const renderedBody = renderBodyFragment(bodySource);
  const subtitle = options.subject?.trim()
    ? `${escapeHtml(options.subject.trim())} · Fiche de révision Papillon +`
    : "Fiche de révision Papillon +";

  return `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escapeHtml(title)}</title>
  <style>
    @page { size: A4; margin: 18mm 16mm; }
    * { box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
      color: #16181D;
      background: #FFFFFF;
      margin: 0;
      padding: 0;
      font-size: 13.5px;
      line-height: 1.55;
    }
    .doc-header {
      border-bottom: 2px solid #1E293B;
      padding-bottom: 10px;
      margin-bottom: 18px;
    }
    .doc-kicker {
      font-size: 10.5px;
      font-weight: 700;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: #4F46E5;
      margin-bottom: 4px;
    }
    .doc-title {
      font-size: 22px;
      font-weight: 800;
      color: #0F172A;
      margin: 0;
      line-height: 1.2;
    }
    h1 { font-size: 19px; color: #0F172A; margin: 18px 0 8px; border-bottom: 1px solid #E2E8F0; padding-bottom: 4px; }
    h2 { font-size: 16px; color: #1E293B; margin: 16px 0 6px; padding-left: 8px; border-left: 3px solid #4F46E5; }
    h3 { font-size: 14px; color: #334155; margin: 12px 0 4px; }
    h4 { font-size: 13px; color: #475569; margin: 10px 0 4px; }
    p { margin: 6px 0 9px; }
    ul, ol { margin: 6px 0 10px; padding-left: 20px; }
    li { margin-bottom: 4px; }
    table {
      width: 100%;
      border-collapse: collapse;
      margin: 12px 0;
      font-size: 12.5px;
    }
    th, td {
      border: 1px solid #CBD5E1;
      padding: 6px 8px;
      text-align: left;
    }
    th {
      background: #F1F5F9;
      font-weight: 700;
    }
    .callout {
      background: #F8FAFC;
      border: 1px solid #CBD5E1;
      border-left: 4px solid #4F46E5;
      border-radius: 6px;
      padding: 10px 12px;
      margin: 10px 0;
    }
    .centered { text-align: center; }
    .math-inline {
      font-family: "Times New Roman", Georgia, serif;
      font-style: italic;
      padding: 0 2px;
    }
    .math-block {
      font-family: "Times New Roman", Georgia, serif;
      font-size: 15px;
      background: #F8FAFC;
      border: 1px solid #E2E8F0;
      border-radius: 6px;
      padding: 10px 14px;
      margin: 10px 0;
      text-align: center;
      line-height: 1.8;
    }
    .math-fn, .math-text { font-style: normal; font-family: inherit; }
    .math-bb { font-style: normal; font-weight: 700; }
    .math-bar { border-top: 1px solid currentColor; padding-top: 1px; }
    .math-vec { border-top: 1px solid currentColor; padding-top: 1px; position: relative; }
    .frac {
      display: inline-flex;
      flex-direction: column;
      align-items: center;
      vertical-align: middle;
      margin: 0 3px;
      font-size: 0.9em;
      line-height: 1.15;
    }
    .frac-num { border-bottom: 1px solid currentColor; padding: 0 3px 1px; }
    .frac-den { padding: 1px 3px 0; }
    .sqrt-body { border-top: 1px solid currentColor; padding: 0 2px; }
    .root-idx { font-size: 0.7em; margin-right: 1px; }
    .inline-box { border: 1px solid #334155; border-radius: 4px; padding: 1px 5px; }
    code {
      font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
      font-size: 12px;
      background: #F1F5F9;
      padding: 1px 4px;
      border-radius: 4px;
    }
    hr.page-sep { border: none; border-top: 1px dashed #CBD5E1; margin: 16px 0; }
  </style>
</head>
<body>
  <header class="doc-header">
    <div class="doc-kicker">${subtitle}</div>
    <h1 class="doc-title" style="border:none;padding:0;margin:0;">${escapeHtml(title)}</h1>
  </header>
  <main>
    ${renderedBody}
  </main>
</body>
</html>`;
}
