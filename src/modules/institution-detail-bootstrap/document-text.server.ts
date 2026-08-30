import "server-only";

import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";

import { normalizeVisibleText } from "@/src/modules/http-collector/html";

const MAX_PDF_PAGES = 40;
const MAX_PDF_TEXT_CHARACTERS = 250_000;

export async function extractBoundedPdfText(
  bytes: Uint8Array,
): Promise<string> {
  const task = getDocument({
    data: bytes.slice(),
    useSystemFonts: true,
    verbosity: 0,
  });
  const document = await task.promise;
  try {
    const lines: string[] = [];
    const pages = Math.min(document.numPages, MAX_PDF_PAGES);
    let characters = 0;
    for (let pageNumber = 1; pageNumber <= pages; pageNumber += 1) {
      const page = await document.getPage(pageNumber);
      const text = await page.getTextContent();
      const line = normalizeVisibleText(
        text.items.map((item) => ("str" in item ? item.str : "")).join(" "),
      );
      if (!line) continue;
      const remaining = MAX_PDF_TEXT_CHARACTERS - characters;
      if (remaining <= 0) break;
      lines.push(line.slice(0, remaining));
      characters += line.length;
    }
    return normalizeVisibleText(lines.join("\n")).slice(
      0,
      MAX_PDF_TEXT_CHARACTERS,
    );
  } finally {
    await task.destroy();
  }
}

export function textAsExtractionHtml(value: string): string {
  const escaped = value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
  return escaped
    .split(/(?<=[.!?]|다\.|요\.)\s+|\n+/u)
    .filter(Boolean)
    .map((line) => `<p>${line}</p>`)
    .join("");
}
