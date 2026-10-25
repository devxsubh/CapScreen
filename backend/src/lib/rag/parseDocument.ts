import mammoth from "mammoth";

export type ParsedPage = { pageNum: number | null; text: string };

export async function parseDocumentToText(
  buffer: Buffer,
  mimeType: string,
  filename: string,
): Promise<ParsedPage[]> {
  const mime = mimeType.toLowerCase();
  const ext = filename.split(".").pop()?.toLowerCase() ?? "";

  if (mime === "application/pdf" || ext === "pdf") {
    return parsePdf(buffer);
  }

  if (
    mime === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
    mime === "application/msword" ||
    ext === "docx" ||
    ext === "doc"
  ) {
    return parseDocx(buffer);
  }

  if (mime === "text/plain" || mime === "text/csv" || ext === "txt" || ext === "csv") {
    return [{ pageNum: null, text: buffer.toString("utf-8") }];
  }

  throw new Error(`Unsupported file type: ${mimeType} (${filename})`);
}

type PdfParseModule = typeof import("pdf-parse");
let pdfModule: Promise<PdfParseModule> | null = null;

/**
 * Loaded on first use: pdf.js (inside pdf-parse v2) touches DOMMatrix at import
 * time, which plain Node lacks. A pure-JS polyfill covers text extraction, and
 * lazy loading keeps any PDF-stack problem from taking down the whole backend.
 */
function loadPdfParse(): Promise<PdfParseModule> {
  pdfModule ??= (async () => {
    const g = globalThis as { DOMMatrix?: unknown };
    if (!g.DOMMatrix) {
      const { default: CSSMatrix } = await import("@thednp/dommatrix");
      g.DOMMatrix = CSSMatrix;
    }
    return import("pdf-parse");
  })();
  return pdfModule;
}

async function parsePdf(buffer: Buffer): Promise<ParsedPage[]> {
  const { PDFParse } = await loadPdfParse();
  const parser = new PDFParse({ data: new Uint8Array(buffer) });
  try {
    const result = await parser.getText();
    return result.pages
      .map((p) => ({ pageNum: p.num, text: p.text.trim() }))
      .filter((p) => p.text.length > 0);
  } finally {
    await parser.destroy();
  }
}

async function parseDocx(buffer: Buffer): Promise<ParsedPage[]> {
  const result = await mammoth.extractRawText({ buffer });
  const text = result.value.trim();
  if (!text) return [];
  return [{ pageNum: null, text }];
}
