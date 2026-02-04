import * as pdfjsLib from 'pdfjs-dist';
import * as XLSX from 'xlsx';
import mammoth from 'mammoth';
import { ExcelData } from '../types';

// Configure PDF worker
// Note: In a production bundler setup, this usually points to a local file. 
// For this environment, we use a CDN compatible with the version.
// We use the .mjs version from esm.sh to match the main library module format.
pdfjsLib.GlobalWorkerOptions.workerSrc = `https://esm.sh/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`;

export const extractTextFromPdf = async (file: File): Promise<string> => {
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  let fullText = '';

  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const textContent = await page.getTextContent();
    const items = textContent.items
      .map((item: any) => {
        const [a, b, c, d, e, f] = item.transform || [];
        return {
          str: item.str || '',
          x: typeof e === 'number' ? e : 0,
          y: typeof f === 'number' ? f : 0
        };
      })
      .filter((item: any) => item.str && String(item.str).trim() !== '');

    // Sort by Y (descending) then X (ascending) to reconstruct lines
    items.sort((l: any, r: any) => {
      if (l.y === r.y) return l.x - r.x;
      return r.y - l.y;
    });

    const lines: string[] = [];
    let currentLineY: number | null = null;
    let currentLineParts: string[] = [];

    const flushLine = () => {
      if (currentLineParts.length > 0) {
        lines.push(currentLineParts.join(' ').replace(/\s+/g, ' ').trim());
        currentLineParts = [];
      }
    };

    const lineThreshold = 2.5;
    for (const item of items) {
      if (currentLineY === null) {
        currentLineY = item.y;
        currentLineParts.push(item.str);
        continue;
      }

      if (Math.abs(item.y - currentLineY) > lineThreshold) {
        flushLine();
        currentLineY = item.y;
        currentLineParts.push(item.str);
      } else {
        currentLineParts.push(item.str);
      }
    }
    flushLine();

    const pageText = lines.join('\n');
    fullText += `\n\n--- Page ${i} ---\n\n${pageText}`;
  }

  return fullText;
};

export const parseExcelFile = async (file: File): Promise<ExcelData> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = e.target?.result;
        const workbook = XLSX.read(data, { type: 'binary' });
        const firstSheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheetName];
        
        // Convert to JSON (Array of Arrays) first to analyze structure
        const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 }) as any[][];
        
        if (jsonData.length === 0) {
          resolve({ fileName: file.name, headers: [], rows: [], keyValues: {} });
          return;
        }

        // --- KEY-VALUE EXTRACTION (e.g., 产品名称: XXX) ---
        const keyValues: Record<string, string> = {};

        const tryAddKeyValue = (rawKey: any, rawValue: any) => {
          const key = rawKey !== undefined && rawKey !== null ? String(rawKey).trim() : '';
          const value = rawValue !== undefined && rawValue !== null ? String(rawValue).trim() : '';
          if (!key || !value) return;
          if (!keyValues[key]) {
            keyValues[key] = value;
          }
        };

        jsonData.forEach((row) => {
          if (!row || row.length === 0) return;

          // Pattern 1: two-column key/value
          if (row.length >= 2) {
            tryAddKeyValue(row[0], row[1]);
          }

          // Pattern 2: inline "Key: Value" or "Key：Value"
          row.forEach((cell: any) => {
            if (cell === null || cell === undefined) return;
            const text = String(cell).trim();
            if (!text) return;
            const splitIdx = text.search(/[:：]/);
            if (splitIdx <= 0) return;
            const key = text.slice(0, splitIdx).trim();
            const value = text.slice(splitIdx + 1).trim();
            tryAddKeyValue(key, value);
          });
        });

        // --- SMART HEADER DETECTION ---
        // Many Excel files have a title in Row 1 (e.g., "Product Spec"), and headers in Row 2 or 3.
        // We scan the first 10 rows to find the row with the most non-empty columns.
        
        let headerRowIndex = 0;
        let maxColumns = 0;

        // Scan up to 10 rows or length of file
        const scanLimit = Math.min(jsonData.length, 10);
        
        for (let i = 0; i < scanLimit; i++) {
            const row = jsonData[i];
            if (!row) continue;
            
            // Count cells that have actual content (not null, undefined, or empty string)
            const nonEmptyCount = row.filter((cell: any) => 
                cell !== null && 
                cell !== undefined && 
                String(cell).trim() !== ''
            ).length;

            // If this row has more columns than our current best, it's likely the header
            if (nonEmptyCount > maxColumns) {
                maxColumns = nonEmptyCount;
                headerRowIndex = i;
            }
        }

        // Extract headers from the identified row
        // We ensure headers are strings and handle potential empty/undefined header cells
        const headersRaw = jsonData[headerRowIndex] || [];
        const headers = headersRaw.map((h: any, idx: number) => {
             return h ? String(h).trim() : `Column_${idx + 1}`;
        });

        // The data rows are everything *after* the header row
        const rawRows = jsonData.slice(headerRowIndex + 1);

        const rows = rawRows.map((row) => {
          const rowData: Record<string, any> = {};
          // Map based on the identified headers length, not just the row length
          headers.forEach((header, index) => {
            let cellValue = row[index];
            // Clean up undefined/null values to empty strings for UI consistency
            if (cellValue === undefined || cellValue === null) {
                cellValue = "";
            }
            rowData[header] = cellValue;
          });
          return rowData;
        });

        // Filter out completely empty rows that might exist at the bottom
        const cleanRows = rows.filter(row => Object.values(row).some(v => v !== ""));

        resolve({ fileName: file.name, headers, rows: cleanRows, keyValues });
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = (err) => reject(err);
    reader.readAsBinaryString(file);
  });
};

const truncateLines = (lines: string[], maxLines: number) => {
  if (lines.length <= maxLines) return lines;
  return [...lines.slice(0, maxLines), `... (${lines.length - maxLines} more lines truncated)`];
};

export const extractTextFromDocx = async (file: File): Promise<string> => {
  const arrayBuffer = await file.arrayBuffer();
  const result = await mammoth.extractRawText({ arrayBuffer });
  return result.value || '';
};

export const extractTextFromPlainText = async (file: File): Promise<string> => {
  return await file.text();
};

export const extractTextFromSpreadsheet = async (file: File): Promise<string> => {
  const arrayBuffer = await file.arrayBuffer();
  const workbook = XLSX.read(arrayBuffer, { type: 'array', raw: true });
  const sheetNames = workbook.SheetNames.slice(0, 1);
  const lines: string[] = [];

  sheetNames.forEach((sheetName) => {
    const worksheet = workbook.Sheets[sheetName];
    const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 }) as any[][];
    if (jsonData.length === 0) return;

    lines.push(`Sheet: ${sheetName}`);
    const header = (jsonData[0] || []).map((h: any) => (h ? String(h).trim() : '')).filter(Boolean);
    const dataRows = jsonData.slice(1);

    const maxRows = Math.min(100, dataRows.length);
    for (let i = 0; i < maxRows; i++) {
      const row = dataRows[i] || [];
      const pairs: string[] = [];
      for (let c = 0; c < Math.min(header.length, 30); c++) {
        const key = header[c] || `Column_${c + 1}`;
        const val = row[c] !== undefined && row[c] !== null ? String(row[c]).trim() : '';
        if (key && val) pairs.push(`${key}: ${val}`);
      }
      if (pairs.length > 0) lines.push(pairs.join(' | '));
    }
  });

  return truncateLines(lines, 300).join('\n');
};