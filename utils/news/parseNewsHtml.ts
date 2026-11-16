import { decodeHTML } from "entities";
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { parseDOM } = require("htmlparser2-without-node-native") as {
  parseDOM: (html: string, options?: { decodeEntities?: boolean }) => DomNode[];
};

import { formatHTML } from "@/utils/format/html";

export interface NewsInlineRun {
  text: string;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  strike?: boolean;
  code?: boolean;
  href?: string;
}

export type NewsRenderBlock =
  | { type: "heading"; level: 1 | 2 | 3 | 4; runs: NewsInlineRun[] }
  | { type: "paragraph"; runs: NewsInlineRun[] }
  | { type: "list-item"; ordered: boolean; index: number; runs: NewsInlineRun[] }
  | { type: "quote"; runs: NewsInlineRun[] }
  | { type: "table-row"; header: boolean; cells: NewsInlineRun[][] }
  | { type: "image"; src: string }
  | { type: "rule" };

interface DomNode {
  type?: string;
  name?: string;
  data?: string;
  attribs?: Record<string, string>;
  children?: DomNode[];
}

type InlineStyle = Omit<NewsInlineRun, "text">;

const URL_REGEX = /(https?:\/\/[^\s<>"')\]]+)/gi;

const BLOCK_TAGS = new Set([
  "p",
  "div",
  "section",
  "article",
  "header",
  "footer",
  "main",
  "aside",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "ul",
  "ol",
  "li",
  "blockquote",
  "pre",
  "table",
  "thead",
  "tbody",
  "tfoot",
  "tr",
  "hr",
]);

function splitTextWithBareLinks(text: string, style: InlineStyle): NewsInlineRun[] {
  if (style.href) {
    return [{ text, ...style }];
  }

  const runs: NewsInlineRun[] = [];
  let lastIndex = 0;
  URL_REGEX.lastIndex = 0;

  let match: RegExpExecArray | null;
  while ((match = URL_REGEX.exec(text)) !== null) {
    if (match.index > lastIndex) {
      runs.push({ text: text.slice(lastIndex, match.index), ...style });
    }
    runs.push({ text: match[0], ...style, href: match[0] });
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < text.length) {
    runs.push({ text: text.slice(lastIndex), ...style });
  }
  return runs;
}

function normalizeInlineRuns(runs: NewsInlineRun[]): NewsInlineRun[] {
  const cleaned: NewsInlineRun[] = [];
  for (const run of runs) {
    const normalizedText = run.text.replace(/[ \t\r\n]+/g, m => (m.includes("\n") ? "\n" : " "));
    if (!normalizedText) continue;
    const prev = cleaned[cleaned.length - 1];
    if (
      prev &&
      prev.bold === run.bold &&
      prev.italic === run.italic &&
      prev.underline === run.underline &&
      prev.strike === run.strike &&
      prev.code === run.code &&
      prev.href === run.href
    ) {
      prev.text += normalizedText;
    } else {
      cleaned.push({ ...run, text: normalizedText });
    }
  }

  if (cleaned.length > 0) {
    cleaned[0].text = cleaned[0].text.replace(/^\s+/, "");
    cleaned[cleaned.length - 1].text = cleaned[cleaned.length - 1].text.replace(/\s+$/, "");
  }

  return cleaned.filter(r => r.text.length > 0);
}

function collectInlineRuns(nodes: DomNode[], inherited: InlineStyle): NewsInlineRun[] {
  const runs: NewsInlineRun[] = [];

  for (const node of nodes) {
    if (node.type === "text") {
      const decoded = decodeHTML(node.data ?? "");
      if (decoded) {
        runs.push(...splitTextWithBareLinks(decoded, inherited));
      }
      continue;
    }

    if (node.type !== "tag") continue;
    const tag = (node.name ?? "").toLowerCase();
    if (tag === "script" || tag === "style" || tag === "head" || tag === "noscript") {
      continue;
    }
    if (tag === "br") {
      runs.push({ text: "\n", ...inherited });
      continue;
    }

    const nextStyle: InlineStyle = { ...inherited };
    if (tag === "b" || tag === "strong") nextStyle.bold = true;
    if (tag === "i" || tag === "em") nextStyle.italic = true;
    if (tag === "u" || tag === "ins") nextStyle.underline = true;
    if (tag === "s" || tag === "strike" || tag === "del") nextStyle.strike = true;
    if (tag === "code" || tag === "pre") nextStyle.code = true;
    if (tag === "a" && node.attribs?.href) {
      const href = decodeHTML(node.attribs.href).trim();
      if (href && !/^javascript:/i.test(href)) {
        nextStyle.href = href;
      }
    }

    if (node.children && node.children.length > 0) {
      runs.push(...collectInlineRuns(node.children, nextStyle));
    }
  }

  return runs;
}

/**
 * Parses HTML news or survey content into structured React Native friendly blocks.
 * Guarantees visible text extraction even on nested Pronote markup or exotic tags.
 */
export function parseNewsHtmlToBlocks(rawHtml: string): NewsRenderBlock[] {
  if (!rawHtml || !rawHtml.trim()) {
    return [];
  }

  const dom = parseDOM(rawHtml, { decodeEntities: false }) as DomNode[];
  const blocks: NewsRenderBlock[] = [];
  let inlineBuffer: DomNode[] = [];

  const flushInlineBuffer = () => {
    if (inlineBuffer.length === 0) return;
    const runs = normalizeInlineRuns(collectInlineRuns(inlineBuffer, {}));
    inlineBuffer = [];
    if (runs.length > 0) {
      blocks.push({ type: "paragraph", runs });
    }
  };

  const visitNodes = (nodes: DomNode[], listContext?: { ordered: boolean; counter: number }) => {
    for (const node of nodes) {
      if (node.type === "text") {
        if (node.data && node.data.trim().length > 0) {
          inlineBuffer.push(node);
        } else if (inlineBuffer.length > 0) {
          inlineBuffer.push(node);
        }
        continue;
      }

      if (node.type !== "tag") continue;
      const tag = (node.name ?? "").toLowerCase();
      if (tag === "script" || tag === "style" || tag === "head" || tag === "noscript") {
        continue;
      }

      if (tag === "img") {
        const src = node.attribs?.src?.trim();
        if (src) {
          flushInlineBuffer();
          blocks.push({ type: "image", src: decodeHTML(src) });
        }
        continue;
      }

      if (tag === "hr") {
        flushInlineBuffer();
        blocks.push({ type: "rule" });
        continue;
      }

      if (/^h([1-6])$/.test(tag)) {
        flushInlineBuffer();
        const levelNum = Math.min(4, Math.max(1, Number(tag[1]))) as 1 | 2 | 3 | 4;
        const runs = normalizeInlineRuns(collectInlineRuns(node.children ?? [], { bold: true }));
        if (runs.length > 0) {
          blocks.push({ type: "heading", level: levelNum, runs });
        }
        continue;
      }

      if (tag === "blockquote") {
        flushInlineBuffer();
        const runs = normalizeInlineRuns(collectInlineRuns(node.children ?? [], {}));
        if (runs.length > 0) {
          blocks.push({ type: "quote", runs });
        }
        continue;
      }

      if (tag === "ul" || tag === "ol") {
        flushInlineBuffer();
        visitNodes(node.children ?? [], { ordered: tag === "ol", counter: 0 });
        continue;
      }

      if (tag === "li") {
        flushInlineBuffer();
        const hasNestedBlock = (node.children ?? []).some(
          c => c.type === "tag" && BLOCK_TAGS.has((c.name ?? "").toLowerCase()) && c.name !== "p"
        );
        const idx = listContext ? ++listContext.counter : 1;
        if (!hasNestedBlock) {
          const runs = normalizeInlineRuns(collectInlineRuns(node.children ?? [], {}));
          if (runs.length > 0) {
            blocks.push({
              type: "list-item",
              ordered: Boolean(listContext?.ordered),
              index: idx,
              runs,
            });
          }
        } else {
          visitNodes(node.children ?? [], listContext);
        }
        continue;
      }

      if (tag === "tr") {
        flushInlineBuffer();
        const cellNodes = (node.children ?? []).filter(
          c => c.type === "tag" && (c.name === "td" || c.name === "th")
        );
        const cells = cellNodes
          .map(cell => normalizeInlineRuns(collectInlineRuns(cell.children ?? [], {})))
          .filter(runs => runs.length > 0);
        if (cells.length > 0) {
          const header = cellNodes.some(c => c.name === "th");
          blocks.push({ type: "table-row", header, cells });
        }
        continue;
      }

      if (BLOCK_TAGS.has(tag)) {
        flushInlineBuffer();
        visitNodes(node.children ?? [], listContext);
        flushInlineBuffer();
        continue;
      }

      // Check whether an inline container (e.g. <span>) wraps images or block elements
      const containsBlockOrImage = (node.children ?? []).some(c => {
        if (c.type !== "tag") return false;
        const childTag = (c.name ?? "").toLowerCase();
        return childTag === "img" || BLOCK_TAGS.has(childTag);
      });

      if (containsBlockOrImage) {
        flushInlineBuffer();
        visitNodes(node.children ?? [], listContext);
        flushInlineBuffer();
      } else {
        inlineBuffer.push(node);
      }
    }
  };

  visitNodes(dom);
  flushInlineBuffer();

  if (blocks.length === 0) {
    const plain = formatHTML(rawHtml).trim();
    if (plain) {
      blocks.push({ type: "paragraph", runs: splitTextWithBareLinks(plain, {}) });
    }
  }

  return blocks;
}
