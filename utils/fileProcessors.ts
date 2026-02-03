import * as pdfjsLib from 'pdfjs-dist';
import * as XLSX from 'xlsx';
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
    const pageText = textContent.items
      .map((item: any) => item.str)
      .join(' ');
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
          resolve({ fileName: file.name, headers: [], rows: [] });
          return;
        }

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

        resolve({ fileName: file.name, headers, rows: cleanRows });
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = (err) => reject(err);
    reader.readAsBinaryString(file);
  });
};