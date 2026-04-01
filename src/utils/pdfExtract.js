import { getDocument, GlobalWorkerOptions } from 'pdfjs-dist';
import workerSrc from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

GlobalWorkerOptions.workerSrc = workerSrc;

const PAGE_BATCH = 10;

function extractPageLines(content) {
  const lineMap = new Map();
  for (const item of content.items) {
    if (!item.str) continue;
    const y = Math.round(item.transform[5] * 10) / 10;
    if (!lineMap.has(y)) lineMap.set(y, []);
    lineMap.get(y).push({ x: item.transform[4], text: item.str });
  }
  const sortedYs = [...lineMap.keys()].sort((a, b) => b - a);
  const lines = [];
  for (const y of sortedYs) {
    const items = lineMap.get(y).sort((a, b) => a.x - b.x);
    const line = items.map(it => it.text).join(' ').trim();
    if (line) lines.push(line);
  }
  return lines;
}

/**
 * Extract text lines from a PDF file.
 * @param {File|ArrayBuffer} input - PDF file or ArrayBuffer
 * @param {function} [onProgress] - callback({ current, total })
 * @returns {Promise<string[]>} Array of text lines
 */
export async function extractPdfLines(input, onProgress) {
  const data = input instanceof File ? await input.arrayBuffer() : input;
  const pdf = await getDocument({ data }).promise;
  const total = pdf.numPages;
  const pageLines = new Array(total); // preserve page order
  let done = 0;

  // Process pages in parallel batches
  for (let start = 0; start < total; start += PAGE_BATCH) {
    const end = Math.min(start + PAGE_BATCH, total);
    const batch = [];
    for (let i = start; i < end; i++) {
      batch.push(
        pdf.getPage(i + 1)
          .then(page => page.getTextContent())
          .then(content => {
            pageLines[i] = extractPageLines(content);
            done++;
            if (onProgress) onProgress({ current: done, total });
          })
      );
    }
    await Promise.all(batch);
  }

  // Flatten in page order
  const allLines = [];
  for (const lines of pageLines) {
    if (lines) allLines.push(...lines);
  }
  return allLines;
}
