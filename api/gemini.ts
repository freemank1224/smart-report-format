import { GoogleGenAI } from "@google/genai";
import type { AnalysisResult, DocumentMappingResult } from "../types";

let ai: GoogleGenAI | null = null;

const getAI = (): GoogleGenAI => {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY 未配置。请在 Vercel 环境变量中设置。");
  }
  if (!ai) {
    ai = new GoogleGenAI({ apiKey });
  }
  return ai;
};

const safeParseJson = (text: string): any => {
  const trimmed = text.trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    const match = trimmed.match(/```json\s*([\s\S]*?)\s*```/i) || trimmed.match(/```\s*([\s\S]*?)\s*```/i);
    if (match && match[1]) {
      return JSON.parse(match[1]);
    }
  }
  throw new Error("LLM response is not valid JSON.");
};

/**
 * Build vision-based analysis prompt for multimodal models
 * Emphasizes table extraction with watermark/stamp removal
 */
const buildVisionAnalyzePrompt = () => `
You are an expert document parser with ADVANCED VISION capabilities.
You are analyzing PDF document images to extract structured content.

🎯 CRITICAL MISSION: Extract tables with MAXIMUM ACCURACY + Use {{placeholders}} correctly

=== VISION ADVANTAGES ===
You can SEE:
- Table borders, grid lines, and cell boundaries
- Column alignment and spacing
- Text formatting (bold, italic, font sizes)
- Visual layout and structure
- Watermarks, stamps, and overlays

=== TABLE EXTRACTION RULES ===

1. WATERMARK & STAMP REMOVAL ⚠️ CRITICAL:
   - IDENTIFY watermarks (semi-transparent text, diagonal logos)
   - IDENTIFY stamps (red seals, approval marks, date stamps)
   - EXCLUDE watermark/stamp text from table content
   - Only extract actual table cell data
   - If stamp overlays a cell, extract the text UNDER the stamp

2. TABLE STRUCTURE RECOGNITION:
   - Count columns by SEEING vertical grid lines or alignment
   - Identify headers by VISUAL formatting (bold, background color)
   - Detect merged cells by SEEING cells spanning multiple columns
   - Preserve exact column order as shown visually

3. CELL CONTENT EXTRACTION:
   - Extract text from each cell EXACTLY as shown
   - Ignore any overlaid watermarks or stamps
   - If a cell has multiple lines, preserve line breaks
   - Empty cells should be marked as empty

4. ROBUSTNESS REQUIREMENTS:
   - Handle rotated or skewed tables
   - Process tables with irregular borders
   - Extract from multi-page tables (treat each page separately)
   - Maintain accuracy even with low image quality

=== PLACEHOLDER RULES (★★★ CRITICAL ★★★) ===

1. TITLE BLOCK (3 H1 lines):
   ★ CRITICAL: Line 1 (company name) MUST be {{CompanyName}} - NEVER copy the actual company name!
   - Lines 2-3 keep exact text from document.
   - Example:
     # {{CompanyName}}
     # Material Safety Data Sheet
     # (MSDS)

2. METADATA BLOCK (before Section 1):
   ★ CRITICAL: ALL values MUST be placeholders - NEVER copy actual values from the document!
   - **Report No**: {{ReportNo}}
   - **Report date**: {{ReportDate}}
   - **Page**: {{CurrentPage}} of {{TotalPages}}

3. SECTION 1 - VARIABLE RULES:
   ★★★ EXTREMELY IMPORTANT ★★★
   ALL user-specific information in Section 1 MUST use variable placeholders!
   NEVER copy actual values from Section 1 of the source document!
   
   Required placeholders in Section 1:
   - **Product Name**: {{ProductName}}
   - **Manufacture**: {{Manufacture}}
   - **Address**: {{Address}}
   - **Contact Person**: {{ContactPerson}}
   - **Tel**: {{Tel}}
   - **Fax**: {{Fax}}
   - **Email**: {{Email}}
   - Any other product/company specific information → {{VariableName}}
   
   What to keep as-is in Section 1:
   - Field labels (e.g., "Product Name", "Manufacture")
   - Table headers and structure
   - Generic instructional text

4. SECTION 2 AND BEYOND - COPY STRATEGY:
   ★ From Section 2 onwards, you MUST copy actual content from the document.
   - Keep specific hazard descriptions, safety instructions, handling procedures as they appear.
   - These sections contain standard safety information that doesn't change per product.
   - Still use placeholders for any product-specific references if they appear.

=== TABLE FORMAT RULES ===

Standard Markdown table format:
| Column1 | Column2 | Column3 | Column4 |
| --- | --- | --- | --- |
| {{Row1Col1}} | {{Row1Col2}} | {{Row1Col3}} | {{Row1Col4}} |
| {{Row2Col1}} | {{Row2Col2}} | {{Row2Col3}} | {{Row2Col4}} |

CRITICAL RULES:
- Count columns by VISUAL grid structure
- ALL data rows must have SAME number of columns as header
- Section 1 tables: Use {{placeholders}} for ALL data cell values
- Section 2+ tables: Copy actual values from document
- NEVER skip columns due to watermarks/stamps

Example for Section 1 ingredient table:
| NO. | INCI Name | Weight(%) | CAS NO. |
| --- | --- | --- | --- |
| {{Ingredient1No}} | {{Ingredient1Name}} | {{Ingredient1Weight}} | {{Ingredient1CAS}} |
| {{Ingredient2No}} | {{Ingredient2Name}} | {{Ingredient2Weight}} | {{Ingredient2CAS}} |

=== KEY-VALUE PAIRS ===
- For EVERY "Label: Value" line, bold the label
- Pattern: "Label: Value" → "**Label**: Value"
- Section 1: All values must be {{Placeholders}}
- Section 2+: Use actual values from document

=== FINAL QUALITY CHECKLIST ===
Before output, verify:
✓ Title block first line is # {{CompanyName}}, NOT actual company name?
✓ Metadata (Report No, date, Page) ALL use {{placeholders}}?
✓ Section 1: ALL product/company info uses {{placeholders}}?
✓ Product Name is {{ProductName}}, NOT actual product name?
✓ Manufacture info ALL uses {{placeholders}}, NOT actual company data?
✓ Contact Person, Tel, Fax, Email in Section 1 ALL use {{placeholders}}?
✓ All watermarks/stamps excluded from table cells?
✓ Column count consistent across all rows?
✓ Visual table structure preserved accurately?
✓ Section 2+: Content copied from document (standard safety info)?
✓ Markdown table syntax correct (pipes, separators)?

=== OUTPUT ===
Return ONLY the Markdown template.
NO code fences. NO explanations. NO comments.
Just the clean Markdown with {{placeholders}}.
`;

const buildAnalyzePrompt = (rawText: string) => `
You are an expert document parser. Your task is to analyze the following text extracted from a PDF report and convert it into a clean, well-structured Markdown template.

=== CRITICAL RULE: PRESERVE ORIGINAL DOCUMENT STRUCTURE ===
You MUST output content in the EXACT SAME ORDER as it appears in the original document.
DO NOT rearrange, merge, or skip any content blocks.
The document structure is sacred - preserve it exactly.

=== DOCUMENT STRUCTURE (TYPICAL MSDS FORMAT) ===
A typical MSDS document has this structure - output in THIS ORDER:

1. TITLE BLOCK (3 lines, each as H1):
   # {{CompanyName}}
   # Material Safety Data Sheet
   # (MSDS)

2. METADATA BLOCK (immediately after title, BEFORE any Section):
   **Report No**: {{ReportNo}}
   **Report date**: {{ReportDate}}
   **Page**: {{CurrentPage}} of {{TotalPages}}

3. SECTIONS (each starts with ## Section N-...):
   ## Section 1-Chemical Product and Company Identification
   **Product Name**: {{ProductName}}
   ... (table and other content)
   
   **Manufacture**: {{Manufacture}}
   **Address**: {{Address}}
   ... etc.
   
   ## Section 2-Hazards Identification
   ... etc.

=== FORMATTING RULES ===

1. TITLE BLOCK:
   - First 3 lines are H1 headings (using #).
   - ★ CRITICAL: Line 1 (company name) MUST be {{CompanyName}} - NEVER copy the actual company name!
   - Lines 2-3 keep exact text from document.
   - Example:
     # {{CompanyName}}
     # Material Safety Data Sheet
     # (MSDS)

2. METADATA BLOCK (Report No, Report date, Page):
   - These appear AFTER the title block, BEFORE Section 1.
   - CRITICAL: ALL values MUST be placeholders - NEVER copy actual values from the document!
   - **Report No**: {{ReportNo}}
   - **Report date**: {{ReportDate}}
   - **Page**: {{CurrentPage}} of {{TotalPages}}
   - DO NOT put these inside Section 1!

3. SECTION HEADINGS:
   - Use ## (H2) for all section titles.
   - Example: ## Section 1-Chemical Product and Company Identification

4. PRODUCT NAME (inside Section 1):
   - This is a critical field - DO NOT skip it!
   - Format: **Product Name**: {{ProductName}}

5. SECTION 1 - CRITICAL VARIABLE RULES:
   ★★★ EXTREMELY IMPORTANT ★★★
   ALL user-specific information in Section 1 MUST use variable placeholders!
   NEVER copy actual values from the source document!
   
   Required placeholders in Section 1:
   - **Product Name**: {{ProductName}}
   - **Manufacture**: {{Manufacture}}
   - **Address**: {{Address}}
   - **Contact Person**: {{ContactPerson}}
   - **Tel**: {{Tel}}
   - **Fax**: {{Fax}}
   - **Email**: {{Email}}
   - Any other product/company specific information → {{VariableName}}
   
   What to keep as-is in Section 1:
   - Generic instructional text
   - Field labels (e.g., "Product Name", "Manufacture")
   - Table headers and structure

6. SECTION 2 AND BEYOND - COPY STRATEGY:
   ★ From Section 2 onwards, you can copy actual content from the document.
   - Keep specific hazard descriptions, safety instructions, handling procedures as they appear.
   - These sections contain standard safety information that doesn't change per product.
   - Still use placeholders for any product-specific references if they appear.

7. KEY-VALUE PAIRS (★ MOST IMPORTANT ★):
   - For EVERY "Label: Value" line, bold the label.
   - Pattern: "Label: Value" → "**Label**: Value"
   - This applies to ALL sections without exception.
   - Before Section 2: ALL values must be {{Placeholders}}
   - Section 2 onwards: Use actual values from document (unless product-specific)

8. MANUFACTURER BLOCK (usually after ingredient table):
   - ALL values must be placeholders:
     **Manufacture**: {{Manufacture}}
     **Address**: {{Address}}
     **Contact Person**: {{ContactPerson}}
     **Tel**: {{Tel}}
     **Fax**: {{Fax}}
     **Email**: {{Email}}

9. TABLES - ★★★ CRITICAL ★★★:
   - ALL tables MUST use standard Markdown format with pipes (|)
   - Example format:
     | Column1 | Column2 | Column3 |
     | --- | --- | --- |
     | {{Value1}} | {{Value2}} | {{Value3}} |
   
   - Section 1 ingredient/composition tables:
     * Use standard Markdown table format
     * Headers: exact column names from original table
     * Data rows: use {{placeholders}} for all values
     * Example:
       | NO. | INCI Name | Weight(%) | CAS NO. |
       | --- | --- | --- |
       | {{Ingredient1No}} | {{Ingredient1Name}} | {{Ingredient1Weight}} | {{Ingredient1CAS}} |
   
   - Section 2+ tables: 
     * Also use standard Markdown format
     * Copy actual content from document

=== FINAL CHECKLIST BEFORE OUTPUT ===
✓ Title block is 3 H1 lines at the very top?
✓ First line is # {{CompanyName}}, NOT actual company name?
✓ Metadata (Report No, date, Page) ALL use {{placeholders}}?
✓ Section 1: ALL product/company info uses {{placeholders}}?
✓ Product Name is {{ProductName}}, NOT actual product name?
✓ Manufacture info ALL uses {{placeholders}}, NOT actual company data?
✓ ALL TABLES use | pipes | in | standard | Markdown | format |?
✓ Table headers row followed by | --- | --- | separator row?
✓ Section 2+: Content copied from document (standard safety info)?
✓ Every "Label: Value" has bold label?
✓ Document order matches original exactly?

=== INPUT TEXT ===
${rawText.substring(0, 60000)}

=== OUTPUT ===
Return ONLY the Markdown text with {{placeholders}}.
Do NOT wrap in code fences. Do NOT include explanations.
`;

const buildMappingPrompt = (params: {
  documentText: string;
  templateContent: string;
  variables: string[];
}) => {
  const { documentText, templateContent, variables } = params;
  return `
You are an expert information extraction assistant.
Your task is to map information from the provided document to the template variables.

Rules:
1. Return ONLY JSON with the schema below. No extra text.
2. Provide multiple candidates if the document is ambiguous.
3. Each candidate must include evidence (short snippet) and a confidence score (0~1).
4. If a variable is not found, return an empty candidates array.

=== CRITICAL RULE FOR TABLE DATA (Composition/Ingredient Tables) ===
When extracting table data (like ingredient/composition tables), you MUST:
1. Look at the TEMPLATE to find the EXACT column header order.
2. The template table headers define the STRICT ORDER of columns.
3. Extract values following the EXACT SAME ORDER as the template headers.
4. DO NOT reorder columns based on the source document's order.
5. The template is the source of truth for column ordering.

Example:
- If template has headers: | Ingredient | CAS No. | Content |
- You MUST output values in order: Ingredient, CAS No., Content
- Even if source document shows: CAS No., Ingredient, Content
- The output order must match the TEMPLATE, not the source.

Schema:
{
  "mappings": [
    {
      "variable": "VariableName",
      "candidates": [
        {"value": "...", "confidence": 0.0, "evidence": "...", "rationale": "..."}
      ]
    }
  ],
  "notes": ["..."]
}

Template Content (for context - USE THIS FOR COLUMN ORDER):
${templateContent.substring(0, 12000)}

Variables to map:
${variables.join(', ')}

Document Text:
${documentText.substring(0, 30000)}
`;
};

/**
 * Remove duplicate table headers that may appear as plain text before the actual table
 * CRITICAL: Only remove LOOSE text that duplicates table headers, NOT the table itself!
 */
const removeRedundantTableHeaders = (content: string): string => {
  const lines = content.split('\n');
  const result: string[] = [];
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();
    
    // NEVER touch actual table rows (lines starting with |)
    if (trimmed.startsWith('|')) {
      result.push(lines[i]);
      continue;
    }
    
    // NEVER touch markdown headers, bold text, or empty lines
    if (trimmed.startsWith('#') || trimmed.startsWith('**') || trimmed === '') {
      result.push(lines[i]);
      continue;
    }
    
    // Check if the next line is a proper markdown table row
    const nextLine = i + 1 < lines.length ? lines[i + 1].trim() : '';
    const isTableAhead = nextLine.startsWith('|');
    
    if (isTableAhead) {
      // Only remove if this line looks like scattered column names WITHOUT pipes
      // Example to remove: "Weight NO. INCI Name CAS NO. %" (OCR artifact)
      // Must NOT contain pipes, must have multiple column-like words
      const hasMultipleColumnWords = /\b(NO\.?|Weight|INCI|Name|CAS|Ingredient)\b/gi.test(trimmed);
      const matchCount = (trimmed.match(/\b(NO\.?|Weight|INCI|Name|CAS|Ingredient)\b/gi) || []).length;
      const wordCount = trimmed.split(/\s+/).length;
      
      // 更严格的条件：必须是全部大写或包含点号，避免误删数据行
      const isAllUpperOrPunct = /^[A-Z0-9\s.%():-]+$/.test(trimmed);
      
      // Remove only if: contains 2+ column keywords, short (≤8 words), no pipes, AND all uppercase
      if (hasMultipleColumnWords && matchCount >= 2 && wordCount <= 8 && !trimmed.includes('|') && isAllUpperOrPunct) {
        // This is likely a redundant header - skip it
        continue;
      }
    }
    
    // Keep everything else
    result.push(lines[i]);
  }
  
  return result.join('\n');
};

/**
 * Post-process to fix section formatting issues
 * - Ensure section headings are on their own line
 * - Fix subsection labels (Handling:, Storage:, etc.)
 * - Preserve proper line breaks
 */
const normalizeSectionFormatting = (content: string): string => {
  const lines = content.split('\n');
  const result: string[] = [];
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();
    
    // Check if this is a section heading (## Section N-...)
    if (/^##\s+Section\s+\d+/.test(trimmed)) {
      // Check if there's content after the section title on the same line
      const match = trimmed.match(/^(##\s+Section\s+\d+[^:]+?)(\s+[A-Z][a-z]+:.*)/);
      if (match) {
        // Split: section heading + content with subsection label
        result.push(match[1]); // Section heading only
        result.push(''); // Blank line
        
        // Process the rest (likely "Handling: content...")
        const rest = match[2].trim();
        const subMatch = rest.match(/^([A-Z][a-z]+):\s*(.+)/);
        if (subMatch) {
          result.push(`**${subMatch[1]}:**`); // Bold subsection label
          if (subMatch[2]) {
            result.push(subMatch[2]); // Content
          }
        } else {
          result.push(rest);
        }
      } else {
        result.push(line);
      }
      continue;
    }
    
    // Fix standalone subsection labels that aren't bolded
    if (/^(Handling|Storage|Appearance|Odor|pH|Boiling|Melting|Flash|Vapor|Relative|Solubility|Auto-ignition|Decomposition|Viscosity|Molecular):\s*(.*)/.test(trimmed)) {
      const subMatch = trimmed.match(/^([A-Za-z\s-]+):\s*(.*)/);
      if (subMatch && !trimmed.startsWith('**')) {
        result.push(`**${subMatch[1]}:**`);
        if (subMatch[2]) {
          result.push(subMatch[2]);
        }
        continue;
      }
    }
    
    result.push(line);
  }
  
  return result.join('\n');
};

/**
 * Post-process markdown content to ensure all "Label: Value" lines have bolded labels.
 */
const normalizeKeyValueBolding = (content: string): string => {
  const lines = content.split('\n');
  const result: string[] = [];
  
  let inTable = false;
  let inCodeBlock = false;
  
  for (const line of lines) {
    if (line.trim().startsWith('```')) {
      inCodeBlock = !inCodeBlock;
      result.push(line);
      continue;
    }
    
    if (inCodeBlock) {
      result.push(line);
      continue;
    }
    
    if (line.trim().startsWith('|')) {
      inTable = true;
      result.push(line);
      continue;
    } else if (inTable && line.trim() === '') {
      inTable = false;
    }
    
    if (inTable) {
      result.push(line);
      continue;
    }
    
    if (line.trim().startsWith('#')) {
      result.push(line);
      continue;
    }
    
    if (/^\*\*[^*]+\*\*\s*:/.test(line.trim())) {
      result.push(line);
      continue;
    }
    
    if (/https?:\/\//.test(line)) {
      result.push(line);
      continue;
    }
    
    const match = line.match(/^(\s*)([A-Za-z][A-Za-z0-9\s\-_&,./()]{0,50}?)\s*:\s*(.+)$/);
    
    if (match) {
      const [, indent, label, value] = match;
      const wordCount = label.trim().split(/\s+/).length;
      if (wordCount <= 5) {
        result.push(`${indent}**${label.trim()}**: ${value}`);
        continue;
      }
    }
    
    result.push(line);
  }
  
  return result.join('\n');
};

export default async function handler(req: any, res: any) {
  // Enable CORS for all origins (or restrict to your domain in production)
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  try {
    const { action, rawText, params, pageImages, maxPages } = req.body || {};

    console.log(`🔍 Gemini serverless handler called with action: ${action}`);
    if (pageImages) {
      console.log(`📄 Received ${pageImages.length} page images`);
    }

    // Vision-based PDF analysis (PRIMARY METHOD)
    if (action === 'analyzePdfWithVision') {
      // Client sends pre-rendered page images (already processed on client side)
      if (!pageImages || !Array.isArray(pageImages)) {
        console.error('❌ Missing pageImages in request body');
        res.status(400).json({ 
          error: 'pageImages array is required. Client should render PDF pages and send as base64 images.' 
        });
        return;
      }

      console.log('🔍 Starting vision-based PDF analysis...');

      console.log(`📄 Processing ${pageImages.length} pages with vision model...`);

      // Build multimodal content
      const parts: any[] = [
        { text: buildVisionAnalyzePrompt() }
      ];

      // Add each page image
      pageImages.forEach((imageDataUrl: string) => {
        const base64Data = imageDataUrl.split(',')[1] || imageDataUrl;
        parts.push({
          inlineData: {
            mimeType: 'image/png',
            data: base64Data
          }
        });
      });

      const response = await getAI().models.generateContent({
        model: 'gemini-2.5-flash', // Gemini 2.5 Flash with vision support
        contents: parts,
        config: {
          systemInstruction: "You are a precise document structuring assistant with advanced vision capabilities. Focus on accurate table extraction while ignoring watermarks and stamps.",
          temperature: 0.1,
        }
      });

      const content = response.text || "";
      
      // Apply formatting normalization
      let normalizedContent = removeRedundantTableHeaders(content);
      normalizedContent = normalizeSectionFormatting(normalizedContent);
      normalizedContent = normalizeKeyValueBolding(normalizedContent);
      
      const regex = /\{\{([^}]+)\}\}/g;
      const matches = new Set<string>();
      let match;
      while ((match = regex.exec(normalizedContent)) !== null) {
        matches.add(match[1]);
      }

      console.log(`✅ Vision analysis complete: ${matches.size} variables detected`);

      const result: AnalysisResult = {
        content: normalizedContent,
        detectedVariables: Array.from(matches)
      };

      res.status(200).json(result);
      return;
    }

    // Legacy text-based analysis (DEPRECATED)
    if (action === 'analyzePdfStructure') {
      if (typeof rawText !== 'string') {
        res.status(400).json({ error: 'rawText is required' });
        return;
      }

      const response = await getAI().models.generateContent({
        model: 'gemini-2.5-flash',
        contents: buildAnalyzePrompt(rawText),
        config: {
          systemInstruction: "You are a precise document structuring assistant. You output only Markdown.",
        }
      });

      const content = response.text || "";
      // Apply formatting normalization (CRITICAL: must match local behavior)
      let normalizedContent = removeRedundantTableHeaders(content);
      normalizedContent = normalizeSectionFormatting(normalizedContent);
      normalizedContent = normalizeKeyValueBolding(normalizedContent);
      
      const regex = /\{\{([^}]+)\}\}/g;
      const matches = new Set<string>();
      let match;
      while ((match = regex.exec(normalizedContent)) !== null) {
        matches.add(match[1]);
      }

      const result: AnalysisResult = {
        content: normalizedContent,
        detectedVariables: Array.from(matches)
      };

      res.status(200).json(result);
      return;
    }

    if (action === 'suggestVariableMappingsFromDocument') {
      if (!params || typeof params !== 'object') {
        res.status(400).json({ error: 'params is required' });
        return;
      }

      const response = await getAI().models.generateContent({
        model: 'gemini-2.5-flash',
        contents: buildMappingPrompt(params),
        config: {
          systemInstruction: "You output ONLY valid JSON.",
        }
      });

      const content = response.text || "";
      const parsed = safeParseJson(content) as DocumentMappingResult;
      res.status(200).json(parsed);
      return;
    }

    res.status(400).json({ error: 'Unknown action' });
  } catch (error) {
    console.error('Gemini serverless error:', error);
    res.status(500).json({ error: 'Failed to call Gemini service.' });
  }
}
