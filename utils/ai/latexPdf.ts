import { Directory, File, Paths } from "expo-file-system";
import * as Print from "expo-print";
import * as Sharing from "expo-sharing";

import { AiLatexSheet, extractLatexTitle, renderLatexToHtml } from "./latexParser";

export * from "./latexParser";

export interface ExportedLatexFiles {
  pdfUri: string;
  texUri: string;
  fileNamePdf: string;
  fileNameTex: string;
}

function buildSafeBaseFilename(title: string, id: string): string {
  const slug = title
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9_-]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 48);
  const suffix = id.replace(/[^a-zA-Z0-9_-]/g, "").slice(-8) || "sheet";
  return `${slug || "fiche_revision"}_${suffix}`;
}

/**
 * Saves both the raw `.tex` LaTeX source and a rendered A4 `.pdf` file on device.
 */
export async function exportLatexSheetFiles(
  sheet: Pick<AiLatexSheet, "id" | "title" | "subject" | "latex">
): Promise<ExportedLatexFiles> {
  const title = sheet.title?.trim() || extractLatexTitle(sheet.latex);
  const baseName = buildSafeBaseFilename(title, sheet.id);
  const fileNamePdf = `${baseName}.pdf`;
  const fileNameTex = `${baseName}.tex`;

  const folder = new Directory(Paths.document, "ai-sheets");
  if (!folder.exists) {
    folder.create({ idempotent: true, intermediates: true });
  }

  const texFile = new File(folder, fileNameTex);
  texFile.write(sheet.latex);

  const html = renderLatexToHtml(sheet.latex, {
    title,
    subject: sheet.subject,
  });
  const printed = await Print.printToFileAsync({
    html,
    base64: false,
  });

  const pdfTarget = new File(folder, fileNamePdf);
  if (pdfTarget.exists) {
    pdfTarget.delete();
  }
  const printedFile = new File(printed.uri);
  printedFile.copy(pdfTarget);

  return {
    pdfUri: pdfTarget.uri,
    texUri: texFile.uri,
    fileNamePdf,
    fileNameTex,
  };
}

/**
 * Opens the system share/save dialog for a generated `.pdf` or `.tex` file.
 */
export async function shareExportedFile(
  uri: string,
  mimeType: string,
  dialogTitle: string
): Promise<void> {
  const canShare = await Sharing.isAvailableAsync();
  if (canShare) {
    await Sharing.shareAsync(uri, {
      mimeType,
      dialogTitle,
      UTI: mimeType === "application/pdf" ? "com.adobe.pdf" : "public.plain-text",
    });
    return;
  }

  const file = new File(uri);
  await file.preview({ mimeType, title: dialogTitle });
}
