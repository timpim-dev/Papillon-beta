export interface MarkdownInlineRun {
  text: string;
  bold?: boolean;
  italic?: boolean;
  strike?: boolean;
  code?: boolean;
  math?: boolean;
  href?: string;
}

export type MarkdownBlock =
  | { type: "heading"; level: 1 | 2 | 3 | 4; runs: MarkdownInlineRun[] }
  | { type: "paragraph"; runs: MarkdownInlineRun[] }
  | {
      type: "list-item";
      ordered: boolean;
      index: number;
      indent: number;
      runs: MarkdownInlineRun[];
    }
  | { type: "quote"; runs: MarkdownInlineRun[] }
  | { type: "code-block"; language?: string; code: string }
  | { type: "math-block"; text: string }
  | { type: "table-row"; header: boolean; cells: MarkdownInlineRun[][] }
  | { type: "rule" };

const SUPERSCRIPTS: Record<string, string> = {
  "0": "⁰",
  "1": "¹",
  "2": "²",
  "3": "³",
  "4": "⁴",
  "5": "⁵",
  "6": "⁶",
  "7": "⁷",
  "8": "⁸",
  "9": "⁹",
  "+": "⁺",
  "-": "⁻",
  n: "ⁿ",
  i: "ⁱ",
};

const SUBSCRIPTS: Record<string, string> = {
  "0": "₀",
  "1": "₁",
  "2": "₂",
  "3": "₃",
  "4": "₄",
  "5": "₅",
  "6": "₆",
  "7": "₇",
  "8": "₈",
  "9": "₉",
  "+": "₊",
  "-": "₋",
};

const INLINE_MATH_SYMBOLS: Record<string, string> = {
  alpha: "α",
  beta: "β",
  gamma: "γ",
  delta: "δ",
  epsilon: "ε",
  varepsilon: "ε",
  theta: "θ",
  lambda: "λ",
  mu: "μ",
  pi: "π",
  rho: "ρ",
  sigma: "σ",
  tau: "τ",
  phi: "φ",
  omega: "ω",
  Gamma: "Γ",
  Delta: "Δ",
  Sigma: "Σ",
  Omega: "Ω",
  times: "×",
  cdot: "·",
  div: "÷",
  pm: "±",
  le: "≤",
  leq: "≤",
  ge: "≥",
  geq: "≥",
  neq: "≠",
  ne: "≠",
  approx: "≈",
  equiv: "≡",
  infty: "∞",
  to: "→",
  rightarrow: "→",
  leftarrow: "←",
  Rightarrow: "⇒",
  implies: "⇒",
  Leftrightarrow: "⇔",
  iff: "⇔",
  forall: "∀",
  exists: "∃",
  in: "∈",
  notin: "∉",
  subset: "⊂",
  subseteq: "⊆",
  cup: "∪",
  cap: "∩",
  emptyset: "∅",
  sum: "∑",
  prod: "∏",
  int: "∫",
  partial: "∂",
  nabla: "∇",
  degree: "°",
  deg: "°",
  cdots: "⋯",
  ldots: "…",
};

const BLACKBOARD: Record<string, string> = {
  R: "ℝ",
  N: "ℕ",
  Z: "ℤ",
  Q: "ℚ",
  C: "ℂ",
};

function toScript(raw: string, map: Record<string, string>, fallbackPrefix: string): string {
  const chars = Array.from(raw);
  if (chars.every(c => map[c])) {
    return chars.map(c => map[c]).join("");
  }
  return `${fallbackPrefix}(${raw})`;
}

/**
 * Formats inline/display LaTeX expressions into clean readable Unicode math inside chat bubbles.
 */
export function formatMathText(rawMath: string): string {
  let expr = rawMath.trim();
  expr = expr.replace(/\\(?:left|right)([()[\]|.{}\\])/g, (_m, d: string) => (d === "." ? "" : d));
  for (let i = 0; i < 3; i++) {
    expr = expr.replace(/\\(?:frac|dfrac|tfrac)\{([^{}]*)\}\{([^{}]*)\}/g, "($1)/($2)");
  }
  expr = expr.replace(/\\sqrt\{([^{}]*)\}/g, "√($1)");
  expr = expr.replace(/\\mathbb\{([A-Z])\}/g, (_m, l: string) => BLACKBOARD[l] ?? l);
  expr = expr.replace(/\\(?:text|mathrm|operatorname)\{([^{}]*)\}/g, "$1");
  expr = expr.replace(/\\([A-Za-z]+)/g, (full, cmd: string) => INLINE_MATH_SYMBOLS[cmd] ?? cmd);
  expr = expr.replace(/\^\{([^{}]+)\}/g, (_m, inner: string) => toScript(inner, SUPERSCRIPTS, "^"));
  expr = expr.replace(/\^([0-9+\-ni])/g, (_m, ch: string) => SUPERSCRIPTS[ch] ?? `^${ch}`);
  expr = expr.replace(/_\{([^{}]+)\}/g, (_m, inner: string) => toScript(inner, SUBSCRIPTS, "_"));
  expr = expr.replace(/_([0-9+\-])/g, (_m, ch: string) => SUBSCRIPTS[ch] ?? `_${ch}`);
  return expr.replace(/[{}]/g, "").replace(/\s+/g, " ").trim();
}

type InlineStyle = Omit<MarkdownInlineRun, "text">;

function pushRun(runs: MarkdownInlineRun[], text: string, style: InlineStyle) {
  if (!text) return;
  const prev = runs[runs.length - 1];
  if (
    prev &&
    prev.bold === style.bold &&
    prev.italic === style.italic &&
    prev.strike === style.strike &&
    prev.code === style.code &&
    prev.math === style.math &&
    prev.href === style.href
  ) {
    prev.text += text;
  } else {
    runs.push({ text, ...style });
  }
}

/**
 * Parses inline Markdown spans: `code`, **bold**, *italic*, _italic_, ~~strike~~,
 * [label](url), bare URLs, and inline math $...$ / \(...\).
 */
export function parseInlineMarkdown(
  input: string,
  inherited: InlineStyle = {}
): MarkdownInlineRun[] {
  const runs: MarkdownInlineRun[] = [];
  let i = 0;

  const isBoundary = (idx: number) => idx < 0 || idx >= input.length || /[\s([{"'.,;:!?]/.test(input[idx]);

  while (i < input.length) {
    // Escaped character
    if (input[i] === "\\" && i + 1 < input.length && /[\\`*_~[\]()#+-]/.test(input[i + 1])) {
      pushRun(runs, input[i + 1], inherited);
      i += 2;
      continue;
    }

    // Inline code `...`
    if (input[i] === "`") {
      const end = input.indexOf("`", i + 1);
      if (end > i + 1) {
        pushRun(runs, input.slice(i + 1, end), { ...inherited, code: true });
        i = end + 1;
        continue;
      }
    }

    // Inline LaTeX \(...\)
    if (input.startsWith("\\(", i)) {
      const end = input.indexOf("\\)", i + 2);
      if (end > i + 2) {
        pushRun(runs, formatMathText(input.slice(i + 2, end)), { ...inherited, math: true });
        i = end + 2;
        continue;
      }
    }

    // Inline LaTeX $...$
    if (input[i] === "$" && input[i + 1] !== "$") {
      const close = input.indexOf("$", i + 1);
      if (close > i + 1 && !input.slice(i + 1, close).includes("\n")) {
        const inner = input.slice(i + 1, close);
        // Avoid matching prices like "$5 and $10" across spaces
        if (!/^\d/.test(inner) || /[+\-*/=^_\\a-zA-Z]/.test(inner)) {
          pushRun(runs, formatMathText(inner), { ...inherited, math: true });
          i = close + 1;
          continue;
        }
      }
    }

    // Markdown link [label](url)
    if (input[i] === "[") {
      const closeBracket = input.indexOf("]", i + 1);
      if (closeBracket > i + 1 && input[closeBracket + 1] === "(") {
        const closeParen = input.indexOf(")", closeBracket + 2);
        if (closeParen > closeBracket + 2) {
          const label = input.slice(i + 1, closeBracket);
          const url = input.slice(closeBracket + 2, closeParen).trim();
          if (/^https?:\/\//i.test(url)) {
            runs.push(...parseInlineMarkdown(label, { ...inherited, href: url }));
            i = closeParen + 1;
            continue;
          }
        }
      }
    }

    // Bare URL https://...
    if (input.startsWith("http://", i) || input.startsWith("https://", i)) {
      const match = /^https?:\/\/[^\s<>"')\]]+/.exec(input.slice(i));
      if (match) {
        pushRun(runs, match[0], { ...inherited, href: match[0] });
        i += match[0].length;
        continue;
      }
    }

    // Bold + Italic ***...*** or ___...___
    if (input.startsWith("***", i) || input.startsWith("___", i)) {
      const marker = input.slice(i, i + 3);
      const end = input.indexOf(marker, i + 3);
      if (end > i + 3) {
        runs.push(
          ...parseInlineMarkdown(input.slice(i + 3, end), {
            ...inherited,
            bold: true,
            italic: true,
          })
        );
        i = end + 3;
        continue;
      }
    }

    // Bold **...** or __...__
    if (input.startsWith("**", i) || input.startsWith("__", i)) {
      const marker = input.slice(i, i + 2);
      const end = input.indexOf(marker, i + 2);
      if (end > i + 2) {
        runs.push(
          ...parseInlineMarkdown(input.slice(i + 2, end), {
            ...inherited,
            bold: true,
          })
        );
        i = end + 2;
        continue;
      }
    }

    // Strikethrough ~~...~~
    if (input.startsWith("~~", i)) {
      const end = input.indexOf("~~", i + 2);
      if (end > i + 2) {
        runs.push(
          ...parseInlineMarkdown(input.slice(i + 2, end), {
            ...inherited,
            strike: true,
          })
        );
        i = end + 2;
        continue;
      }
    }

    // Italic *...* or _..._ (avoid snake_case words for _)
    if (input[i] === "*" || (input[i] === "_" && isBoundary(i - 1))) {
      const marker = input[i];
      if (input[i + 1] && !/\s/.test(input[i + 1])) {
        let searchIdx = i + 1;
        let foundEnd = -1;
        while (searchIdx < input.length) {
          const idx = input.indexOf(marker, searchIdx);
          if (idx === -1) break;
          if (
            idx > i + 1 &&
            !/\s/.test(input[idx - 1]) &&
            input[idx + 1] !== marker &&
            (marker === "*" || isBoundary(idx + 1))
          ) {
            foundEnd = idx;
            break;
          }
          searchIdx = idx + 1;
        }
        if (foundEnd > i + 1) {
          runs.push(
            ...parseInlineMarkdown(input.slice(i + 1, foundEnd), {
              ...inherited,
              italic: true,
            })
          );
          i = foundEnd + 1;
          continue;
        }
      }
    }

    pushRun(runs, input[i], inherited);
    i += 1;
  }

  return runs;
}

function isTableSeparatorLine(line: string): boolean {
  const trimmed = line.trim();
  return /^\|?(\s*:?-{2,}:?\s*\|)+\s*:?-{2,}:?\s*\|?$/.test(trimmed);
}

function splitTableCells(line: string): string[] {
  return line
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map(cell => cell.trim());
}

/**
 * Parses Markdown into structured block elements suitable for native RN chat rendering.
 */
export function parseMarkdownBlocks(rawText: string): MarkdownBlock[] {
  if (!rawText || !rawText.trim()) return [];

  const lines = rawText.replace(/\r\n?/g, "\n").split("\n");
  const blocks: MarkdownBlock[] = [];
  let paragraphLines: string[] = [];

  const flushParagraph = () => {
    if (paragraphLines.length === 0) return;
    const joined = paragraphLines.join("\n").trim();
    paragraphLines = [];
    if (joined) {
      blocks.push({ type: "paragraph", runs: parseInlineMarkdown(joined) });
    }
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    if (!trimmed) {
      flushParagraph();
      continue;
    }

    // Fenced code block ```...```
    const fenceMatch = /^```([a-zA-Z0-9_-]*)\s*$/.exec(trimmed);
    if (fenceMatch) {
      flushParagraph();
      const language = fenceMatch[1] || undefined;
      const codeLines: string[] = [];
      let j = i + 1;
      for (; j < lines.length; j++) {
        if (lines[j].trim().startsWith("```")) break;
        codeLines.push(lines[j]);
      }
      blocks.push({
        type: "code-block",
        language,
        code: codeLines.join("\n"),
      });
      i = j;
      continue;
    }

    // Display math block $$...$$ or \[...\]
    if (trimmed.startsWith("$$") || trimmed.startsWith("\\[")) {
      const closing = trimmed.startsWith("$$") ? "$$" : "\\]";
      const singleLineMatch =
        closing === "$$" ? /^\$\$(.+)\$\$$/.exec(trimmed) : /^\\\[(.+)\\\]$/.exec(trimmed);
      flushParagraph();
      if (singleLineMatch) {
        blocks.push({ type: "math-block", text: formatMathText(singleLineMatch[1]) });
        continue;
      }
      const mathLines: string[] = [];
      const firstRest = trimmed.slice(2).trim();
      if (firstRest) mathLines.push(firstRest);
      let j = i + 1;
      for (; j < lines.length; j++) {
        const lt = lines[j].trim();
        if (lt.endsWith(closing)) {
          const tail = lt.slice(0, lt.length - closing.length).trim();
          if (tail) mathLines.push(tail);
          break;
        }
        mathLines.push(lt);
      }
      blocks.push({ type: "math-block", text: formatMathText(mathLines.join(" ")) });
      i = j;
      continue;
    }

    // Horizontal rule
    if (/^(?:---|\*\*\*|___)\s*$/.test(trimmed)) {
      flushParagraph();
      blocks.push({ type: "rule" });
      continue;
    }

    // Headings # .. ####
    const headingMatch = /^(#{1,6})\s+(.+)$/.exec(trimmed);
    if (headingMatch) {
      flushParagraph();
      const level = Math.min(4, Math.max(1, headingMatch[1].length)) as 1 | 2 | 3 | 4;
      blocks.push({
        type: "heading",
        level,
        runs: parseInlineMarkdown(headingMatch[2].trim(), { bold: true }),
      });
      continue;
    }

    // Markdown Table header + separator
    if (trimmed.includes("|") && i + 1 < lines.length && isTableSeparatorLine(lines[i + 1])) {
      flushParagraph();
      const headerCells = splitTableCells(trimmed);
      blocks.push({
        type: "table-row",
        header: true,
        cells: headerCells.map(c => parseInlineMarkdown(c, { bold: true })),
      });
      let j = i + 2;
      for (; j < lines.length; j++) {
        const rowTrimmed = lines[j].trim();
        if (!rowTrimmed || !rowTrimmed.includes("|")) break;
        const cells = splitTableCells(rowTrimmed);
        blocks.push({
          type: "table-row",
          header: false,
          cells: cells.map(c => parseInlineMarkdown(c)),
        });
      }
      i = j - 1;
      continue;
    }

    // Blockquote > ...
    const quoteMatch = /^>\s?(.*)$/.exec(trimmed);
    if (quoteMatch) {
      flushParagraph();
      const quoteLines = [quoteMatch[1]];
      let j = i + 1;
      for (; j < lines.length; j++) {
        const nextQuote = /^>\s?(.*)$/.exec(lines[j].trim());
        if (!nextQuote) break;
        quoteLines.push(nextQuote[1]);
      }
      blocks.push({
        type: "quote",
        runs: parseInlineMarkdown(quoteLines.join("\n").trim()),
      });
      i = j - 1;
      continue;
    }

    // Bullet list item
    const bulletMatch = /^(\s*)[-*•]\s+(.+)$/.exec(line);
    if (bulletMatch) {
      flushParagraph();
      const indent = Math.min(2, Math.floor(bulletMatch[1].length / 2));
      blocks.push({
        type: "list-item",
        ordered: false,
        index: 0,
        indent,
        runs: parseInlineMarkdown(bulletMatch[2].trim()),
      });
      continue;
    }

    // Ordered list item
    const orderedMatch = /^(\s*)(\d+)[.)]\s+(.+)$/.exec(line);
    if (orderedMatch) {
      flushParagraph();
      const indent = Math.min(2, Math.floor(orderedMatch[1].length / 2));
      blocks.push({
        type: "list-item",
        ordered: true,
        index: Number(orderedMatch[2]),
        indent,
        runs: parseInlineMarkdown(orderedMatch[3].trim()),
      });
      continue;
    }

    paragraphLines.push(trimmed);
  }

  flushParagraph();
  return blocks;
}
