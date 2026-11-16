import { formatHTML } from "@/utils/format/html";

function escapeHtmlText(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

export const cleanHtmlForArticle = (htmlString: string): string => {
  if (!htmlString || !htmlString.trim()) {
    return "";
  }

  const specialDelimiter = "<br />";

  // 1. Pre-cleanup: Normalize whitespace, remove style/script blocks, comments, and &nbsp;
  let cleaned = htmlString
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<(style|script)\b[^>]*>[\s\S]*?<\/\1>/gi, "")
    .replace(/&nbsp;/g, " ")
    .replace(/\r/g, "")
    .trim();

  // 2. Strip attributes except href on <a> and src on <img>
  cleaned = cleaned.replace(/<([a-z0-9]+)(\s+[^>]*)*\/?>/gi, (match, tagName) => {
    const lowerTag = tagName.toLowerCase();

    if (lowerTag === "a") {
      const hrefMatch = match.match(/href=["']([^"']+)["']/i);
      const href = hrefMatch ? ` href="${hrefMatch[1]}"` : "";
      return `<a${href}>`;
    }

    if (lowerTag === "img") {
      const srcMatch = match.match(/src=["']([^"']+)["']/i);
      return srcMatch ? `<img src="${srcMatch[1]}" />` : "";
    }

    if (lowerTag === "br") {
      return specialDelimiter;
    }

    return `<${lowerTag}>`;
  });

  // 3. Block Segmentation: treat div/span/p/br and table rows as block boundaries.
  cleaned = cleaned.replace(/<\/?(?:span|div|p|br|tr|table|tbody|thead)\b[^>]*>/gi, specialDelimiter);
  cleaned = cleaned.replace(/(?:<br \/>)+/g, specialDelimiter);
  cleaned = cleaned.replace(/^(?:<br \/>)+|(?:<br \/>)+$/g, "");

  // 4. Structural Normalization
  const blocks = cleaned
    .split(specialDelimiter)
    .map(block => block.trim())
    .filter(block => block.length > 0);

  let finalHtml = "";
  const listMarkerRegex = /^[•\-]\s*(.*)$/;
  const allowedTagsRegex = "h[1-4]|p|b|strong|i|em|a|u|ul|ol|li|img";

  blocks.forEach(block => {
    block = block
      .replace(new RegExp(`<(?!/?(?:${allowedTagsRegex})\\b)[^>]+>`, "gi"), "")
      .trim();

    if (block.length === 0) return;

    const listMatch = block.match(listMarkerRegex);
    if (listMatch) {
      finalHtml += `<ul><li>${listMatch[1].trim()}</li></ul>`;
    } else if (/^<img\s[^>]*>$/i.test(block) || /^<(?:ul|ol|h[1-4])\b/i.test(block)) {
      finalHtml += block;
    } else {
      finalHtml += `<p>${block}</p>`;
    }
  });

  const compact = finalHtml.replace(/\s+/g, " ").trim();
  if (compact) {
    return compact;
  }

  const plainFallback = formatHTML(htmlString).trim();
  return plainFallback ? `<p>${escapeHtmlText(plainFallback)}</p>` : "";
};