import { getDocument, GlobalWorkerOptions } from 'pdfjs-dist';
import workerSrc from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

GlobalWorkerOptions.workerSrc = workerSrc;

/**
 * Extract text lines from a PDF file.
 * @param {File|ArrayBuffer} input - PDF file or ArrayBuffer
 * @returns {Promise<string[]>} Array of text lines
 */
export async function extractPdfLines(input) {
  const data = input instanceof File ? await input.arrayBuffer() : input;
  const pdf = await getDocument({ data }).promise;
  const allLines = [];

  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();

    // Group text items by Y position to reconstruct lines
    const lineMap = new Map();
    for (const item of content.items) {
      if (!item.str) continue;
      // Round Y to group items on the same line (within 2px tolerance)
      const y = Math.round(item.transform[5] * 10) / 10;
      if (!lineMap.has(y)) lineMap.set(y, []);
      lineMap.get(y).push({ x: item.transform[4], text: item.str });
    }

    // Sort lines by Y descending (PDF coords are bottom-up), items by X ascending
    const sortedYs = [...lineMap.keys()].sort((a, b) => b - a);
    for (const y of sortedYs) {
      const items = lineMap.get(y).sort((a, b) => a.x - b.x);
      const line = items.map(it => it.text).join(' ').trim();
      if (line) allLines.push(line);
    }
  }

  return allLines;
}
