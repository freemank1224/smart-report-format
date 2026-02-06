import { GoogleGenAI } from "@google/genai";
import { AnalysisResult, DocumentMappingResult, LLMSettings } from "../types";
import { getLLMSettings } from "./llmConfig";

const useServerless = import.meta.env.PROD || import.meta.env.VITE_USE_SERVERLESS === 'true';

const callServerless = async <T>(body: Record<string, unknown>): Promise<T> => {
  const response = await fetch('/api/gemini', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });

  if (!response.ok) {
    let message = `Serverless 请求失败 (${response.status})`;
    try {
      const data = await response.json();
      if (data?.error) message = data.error;
    } catch {
      // ignore
    }
    throw new Error(message);
  }

  return response.json() as Promise<T>;
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

⚠️ DEPRECATED: This text-based method has lower accuracy.
Prefer using vision-based analysis (analyzePdfWithVision) for better table extraction.

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
   - Section title should be ONLY the title, nothing else on that line
   - Content starts on the NEXT line after the section heading

4. SUBSECTIONS AND FORMATTING:
   - Within sections, use **Bold:** for subsection labels (e.g., **Handling:**, **Storage:**)
   - Each subsection label should be on its own line
   - Keep paragraphs separated with blank lines
   - Preserve line breaks from the original document for readability
   - Example:
     ## Section 7-Handling and Storage
     
     **Handling:**
     Supply with sufficient partial air exhaust.
     The operating staff must have received special training.
     
     **Storage:**
     Keep the sample in cool and well-ventilated place.

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

5. SECTION 2 AND BEYOND - COPY STRATEGY:
   ★ From Section 2 onwards, you can copy actual content from the document.
   - Keep specific hazard descriptions, safety instructions, handling procedures as they appear.
   - These sections contain standard safety information that doesn't change per product.
   - Still use placeholders for any product-specific references if they appear.

6. KEY-VALUE PAIRS (★ MOST IMPORTANT ★):
   - For EVERY "Label: Value" line, bold the label.
   - Pattern: "Label: Value" → "**Label**: Value"
   - This applies to ALL sections without exception.
   - Before Section 2: ALL values must be {{Placeholders}}
   - Section 2 onwards: Use actual values from document (unless product-specific)

7. TABLES - ★★★ CRITICAL ★★★:
   - ALL tables MUST use standard Markdown format with pipes (|)
   - Example format:
     | Column1 | Column2 | Column3 | Colum4 |
     | --- | --- | --- | --- |
     | {{Value1}} | {{Value2}} | {{Value3}} | {{Value3}} |
   
   - Section 1 ingredient/composition tables:
     * Use standard Markdown table format
     * Headers: exact column names from original table
     * Data rows: use {{placeholders}} for all values
     * Example:
       | NO. | INCI Name | Weight(%) | CAS NO. |
       | --- | --- | --- | --- |
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

Template Content (for context):
${templateContent.substring(0, 12000)}

Variables to map:
${variables.join(', ')}

Document Text:
${documentText.substring(0, 30000)}
`;
};

const buildChatCompletionsUrl = (baseUrl: string) => {
  const trimmed = baseUrl.replace(/\/+$/, '');
  if (/\/chat\/completions$/i.test(trimmed)) {
    return trimmed;
  }
  if (trimmed.endsWith('/v1')) {
    return `${trimmed}/chat/completions`;
  }
  return `${trimmed}/v1/chat/completions`;
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

const getOpenAISettings = (): LLMSettings | null => {
  const settings = getLLMSettings();
  if (settings.provider !== 'openai-compatible') return null;
  if (!settings.endpoint || !settings.model || !settings.apiKey) {
    throw new Error('请先在 LLM 设置面板中填写访问点、模型名称与 API Key。');
  }
  if (!settings.multimodalConfirmed) {
    throw new Error('请确认所选模型为多模态模型。');
  }
  return settings;
};

const callOpenAICompatibleServerless = async <T>(body: Record<string, unknown>): Promise<T> => {
  const response = await fetch('/api/openai', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });

  if (!response.ok) {
    let message = `OpenAI 兼容服务请求失败 (${response.status})`;
    try {
      const data = await response.json();
      if (data?.error) message = data.error;
    } catch {
      // ignore
    }
    throw new Error(message);
  }

  return response.json() as Promise<T>;
};

const callOpenAICompatibleDirect = async (settings: LLMSettings, prompt: string, systemInstruction?: string, maxTokens?: number) => {
  const response = await fetch(buildChatCompletionsUrl(settings.endpoint), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${settings.apiKey}`
    },
    body: JSON.stringify({
      model: settings.model,
      messages: [
        ...(systemInstruction ? [{ role: 'system', content: systemInstruction }] : []),
        { role: 'user', content: prompt }
      ],
      temperature: 0.2,
      max_tokens: maxTokens
    })
  });

  if (!response.ok) {
    let message = `OpenAI 兼容服务请求失败 (${response.status})`;
    try {
      const data = await response.json();
      if (data?.error?.message) message = data.error.message;
    } catch {
      // ignore
    }
    throw new Error(message);
  }

  const data = await response.json();
  return data?.choices?.[0]?.message?.content || '';
};

const callOpenAICompatibleVision = async (settings: LLMSettings, textPrompt: string, pageImages: string[], systemInstruction?: string) => {
  // Build multimodal messages for OpenAI-compatible vision APIs
  const visionMessages = [
    ...(systemInstruction ? [{ role: 'system', content: systemInstruction }] : []),
    { 
      role: 'user', 
      content: [
        { type: 'text', text: textPrompt },
        ...pageImages.map((imgUrl: string) => ({
          type: 'image_url',
          image_url: { url: imgUrl }
        }))
      ]
    }
  ];

  const response = await fetch(buildChatCompletionsUrl(settings.endpoint), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${settings.apiKey}`
    },
    body: JSON.stringify({
      model: settings.model,
      messages: visionMessages,
      temperature: 0.1,
      max_tokens: 4096
    })
  });

  if (!response.ok) {
    let message = `Vision analysis failed (${response.status})`;
    try {
      const data = await response.json();
      if (data?.error?.message) message = data.error.message;
    } catch {
      // ignore
    }
    throw new Error(message);
  }

  const data = await response.json();
  return data?.choices?.[0]?.message?.content || '';
};

// Lazy initialization to prevent crash when API key is not set
let ai: GoogleGenAI | null = null;

const getAI = (): GoogleGenAI => {
  const apiKey = import.meta.env.VITE_API_KEY;
  if (!apiKey) {
    throw new Error("请在 .env 文件中设置 VITE_API_KEY。访问 https://aistudio.google.com/app/apikey 获取 API 密钥。");
  }
  if (!ai) {
    ai = new GoogleGenAI({ apiKey });
  }
  return ai;
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
 * This fixes inconsistencies where the model may miss bolding some labels.
 */
const normalizeKeyValueBolding = (content: string): string => {
  const lines = content.split('\n');
  const result: string[] = [];
  
  let inTable = false;
  let inCodeBlock = false;
  
  for (const line of lines) {
    // Track code blocks
    if (line.trim().startsWith('```')) {
      inCodeBlock = !inCodeBlock;
      result.push(line);
      continue;
    }
    
    // Skip code blocks
    if (inCodeBlock) {
      result.push(line);
      continue;
    }
    
    // Track table state (lines starting with |)
    if (line.trim().startsWith('|')) {
      inTable = true;
      result.push(line);
      continue;
    } else if (inTable && line.trim() === '') {
      inTable = false;
    }
    
    // Skip table lines
    if (inTable) {
      result.push(line);
      continue;
    }
    
    // Skip headings (# or ##)
    if (line.trim().startsWith('#')) {
      result.push(line);
      continue;
    }
    
    // Skip lines that are already properly formatted (**Label**:)
    if (/^\*\*[^*]+\*\*\s*:/.test(line.trim())) {
      result.push(line);
      continue;
    }
    
    // Skip lines with URLs (contain http:// or https://)
    if (/https?:\/\//.test(line)) {
      result.push(line);
      continue;
    }
    
    // Match pattern: "Label: Value" where Label is NOT already bolded
    // Label should be reasonably short (1-50 chars) and not contain certain chars
    const match = line.match(/^(\s*)([A-Za-z][A-Za-z0-9\s\-_&,./()]{0,50}?)\s*:\s*(.+)$/);
    
    if (match) {
      const [, indent, label, value] = match;
      // Only bold if label looks like a field name (not a sentence)
      // Skip if label contains too many spaces (likely a sentence)
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

/**
 * PRIMARY METHOD: Analyze PDF using multimodal vision model
 * Renders PDF pages to images and uses Gemini vision for accurate table extraction
 * Handles watermarks, stamps, and complex table structures
 */
export const analyzePdfWithVision = async (pdfFile: File, maxPages: number = 10): Promise<AnalysisResult> => {
  const openAISettings = getOpenAISettings();
  
  // For OpenAI-compatible APIs, check if they support vision
  if (openAISettings) {
    console.log('🔍 Using OpenAI-compatible vision model...');
    
    // Import dynamically to avoid circular dependency
    const { renderAllPdfPages } = await import('../utils/fileProcessors');
    
    // Render PDF pages to images (required for both serverless and direct)
    console.log('📸 Rendering PDF pages to images...');
    const pageImages = await renderAllPdfPages(pdfFile, maxPages);
    
    if (pageImages.length === 0) {
      throw new Error('No pages rendered from PDF');
    }

    console.log(`📄 Rendered ${pageImages.length} pages from PDF`);
    
    if (useServerless) {
      return callOpenAICompatibleServerless<AnalysisResult>({
        action: 'analyzePdfWithVision',
        pageImages, // Send rendered images
        config: {
          endpoint: openAISettings.endpoint,
          model: openAISettings.model,
          apiKey: openAISettings.apiKey
        }
      });
    }

    // Direct OpenAI-compatible vision analysis
    console.log(`📄 Processing ${pageImages.length} pages with OpenAI-compatible vision model...`);

    const content = await callOpenAICompatibleVision(
      openAISettings,
      buildVisionAnalyzePrompt(),
      pageImages,
      'You are a precise document structuring assistant with advanced vision capabilities. Focus on accurate table extraction while ignoring watermarks and stamps.'
    );

    // Apply post-processing
    let normalizedContent = removeRedundantTableHeaders(content);
    normalizedContent = normalizeSectionFormatting(normalizedContent);
    normalizedContent = normalizeKeyValueBolding(normalizedContent);

    // Extract variables
    const regex = /\{\{([^}]+)\}\}/g;
    const matches = new Set<string>();
    let match;
    while ((match = regex.exec(normalizedContent)) !== null) {
      matches.add(match[1]);
    }

    console.log(`✅ OpenAI-compatible vision analysis complete: ${matches.size} variables detected`);

    return {
      content: normalizedContent,
      detectedVariables: Array.from(matches)
    };
  }

  // Use Gemini Vision (primary method)
  // Import dynamically to avoid circular dependency
  const { renderAllPdfPages } = await import('../utils/fileProcessors');
  
  // Render PDF pages to images (required for both serverless and direct)
  console.log('📸 Rendering PDF pages to images...');
  const pageImages = await renderAllPdfPages(pdfFile, maxPages);
  
  if (pageImages.length === 0) {
    throw new Error('No pages rendered from PDF');
  }

  console.log(`📄 Rendered ${pageImages.length} pages from PDF`);
  
  if (useServerless) {
    console.log('🔍 Using Gemini Vision (Serverless)...');
    return callServerless<AnalysisResult>({
      action: 'analyzePdfWithVision',
      pageImages, // Send rendered images
      maxPages
    });
  }

  console.log('🔍 Using Gemini Vision (Direct)...');
  console.log(`📏 First page image size: ${(pageImages[0].length / 1024).toFixed(0)} KB`);

  // Build multimodal content with images
  const parts: any[] = [
    { text: buildVisionAnalyzePrompt() }
  ];

  // Add each page as an image
  pageImages.forEach((imageDataUrl, idx) => {
    // Remove data:image/png;base64, prefix
    const base64Data = imageDataUrl.split(',')[1];
    parts.push({
      inlineData: {
        mimeType: 'image/png',
        data: base64Data
      }
    });
  });

  try {
    const response = await getAI().models.generateContent({
      model: 'gemini-2.5-flash', // Gemini 2.5 Flash with vision support
      contents: parts,
      config: {
        systemInstruction: "You are a precise document structuring assistant with advanced vision capabilities. Focus on accurate table extraction while ignoring watermarks and stamps.",
        temperature: 0.1, // Lower temperature for more consistent output
      }
    });

    const content = response.text || "";
    
    // Apply post-processing
    let normalizedContent = removeRedundantTableHeaders(content);
    normalizedContent = normalizeSectionFormatting(normalizedContent);
    normalizedContent = normalizeKeyValueBolding(normalizedContent);

    // Extract variables
    const regex = /\{\{([^}]+)\}\}/g;
    const matches = new Set<string>();
    let match;
    while ((match = regex.exec(normalizedContent)) !== null) {
      matches.add(match[1]);
    }

    console.log(`✅ Vision analysis complete: ${matches.size} variables detected`);

    return {
      content: normalizedContent,
      detectedVariables: Array.from(matches)
    };

  } catch (error: any) {
    console.error("Error calling Gemini Vision:", error);
    
    // Provide detailed error information
    let errorMessage = "Failed to analyze PDF with vision model.";
    
    if (error?.message) {
      errorMessage += ` Error: ${error.message}`;
    }
    
    if (error?.status === 404) {
      errorMessage += " (Model not found - ensure you're using a vision-capable model like gemini-2.5-flash)";
    } else if (error?.status === 401 || error?.status === 403) {
      errorMessage += " (Authentication failed - check your API key)";
    } else if (error?.status === 429) {
      errorMessage += " (Rate limit exceeded - please try again later)";
    }
    
    console.error('💡 Tip: Make sure VITE_API_KEY is set in your .env.local file');
    console.error('💡 Get API key from: https://aistudio.google.com/app/apikey');
    
    throw new Error(errorMessage);
  }
};

/**
 * Helper: Convert File to base64 string
 */
const fileToBase64 = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      resolve(result);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
};

/**
 * Analyzes raw text from a PDF and converts it into a structured template.
 * DEPRECATED: Use analyzePdfWithVision for better accuracy
 */
export const analyzePdfStructure = async (rawText: string): Promise<AnalysisResult> => {
  console.warn('⚠️ Using legacy text-based analysis. Consider using analyzePdfWithVision for better table accuracy.');
  const openAISettings = getOpenAISettings();
  if (openAISettings) {
    if (useServerless) {
      return callOpenAICompatibleServerless<AnalysisResult>({
        action: 'analyzePdfStructure',
        rawText,
        config: {
          endpoint: openAISettings.endpoint,
          model: openAISettings.model,
          apiKey: openAISettings.apiKey
        }
      });
    }

    const content = await callOpenAICompatibleDirect(
      openAISettings,
      buildAnalyzePrompt(rawText),
      'You are a precise document structuring assistant. You output only Markdown.'
    );

    // Apply formatting normalization (MUST match serverless path)
    let normalizedContent = removeRedundantTableHeaders(content);
    normalizedContent = normalizeSectionFormatting(normalizedContent);
    normalizedContent = normalizeKeyValueBolding(normalizedContent);
    
    const regex = /\{\{([^}]+)\}\}/g;
    const matches = new Set<string>();
    let match;
    while ((match = regex.exec(normalizedContent)) !== null) {
      matches.add(match[1]);
    }

    return {
      content: normalizedContent,
      detectedVariables: Array.from(matches)
    };
  }

  if (useServerless) {
    return callServerless<AnalysisResult>({
      action: 'analyzePdfStructure',
      rawText
    });
  }

  const prompt = buildAnalyzePrompt(rawText);

  try {
    const response = await getAI().models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
      config: {
        systemInstruction: "You are a precise document structuring assistant. You output only Markdown.",
      }
    });

    const content = response.text || "";
    // Apply formatting normalization
    let normalizedContent = removeRedundantTableHeaders(content);
    normalizedContent = normalizeSectionFormatting(normalizedContent);
    normalizedContent = normalizeKeyValueBolding(normalizedContent);
    
    // Simple regex to extract variables for convenience
    const regex = /\{\{([^}]+)\}\}/g;
    const matches = new Set<string>();
    let match;
    while ((match = regex.exec(normalizedContent)) !== null) {
      matches.add(match[1]);
    }

    return {
      content: normalizedContent,
      detectedVariables: Array.from(matches)
    };

  } catch (error) {
    console.error("Error calling Gemini:", error);
    throw new Error("Failed to analyze document structure.");
  }
};

export const suggestVariableMappingsFromDocument = async (params: {
  documentText: string;
  templateContent: string;
  variables: string[];
}): Promise<DocumentMappingResult> => {
  const openAISettings = getOpenAISettings();
  if (openAISettings) {
    if (useServerless) {
      return callOpenAICompatibleServerless<DocumentMappingResult>({
        action: 'suggestVariableMappingsFromDocument',
        params,
        config: {
          endpoint: openAISettings.endpoint,
          model: openAISettings.model,
          apiKey: openAISettings.apiKey
        }
      });
    }

    const prompt = buildMappingPrompt(params);
    const content = await callOpenAICompatibleDirect(
      openAISettings,
      prompt,
      'You output ONLY valid JSON.'
    );

    const parsed = safeParseJson(content);
    return parsed as DocumentMappingResult;
  }

  if (useServerless) {
    return callServerless<DocumentMappingResult>({
      action: 'suggestVariableMappingsFromDocument',
      params
    });
  }

  const { documentText, templateContent, variables } = params;

  const prompt = buildMappingPrompt({ documentText, templateContent, variables });

  try {
    const response = await getAI().models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
      config: {
        systemInstruction: "You output ONLY valid JSON.",
      }
    });

    const content = response.text || "";
    const parsed = safeParseJson(content);
    return parsed as DocumentMappingResult;
  } catch (error) {
    console.error("Error calling Gemini for mapping:", error);
    throw new Error("Failed to analyze document for variable mapping.");
  }
};

export const testOpenAICompatibleConnection = async (settings: LLMSettings): Promise<void> => {
  if (!settings.endpoint || !settings.model || !settings.apiKey) {
    throw new Error('请填写访问点、模型名称与 API Key。');
  }
  if (!settings.multimodalConfirmed) {
    throw new Error('请确认所选模型为多模态模型。');
  }

  if (useServerless) {
    await callOpenAICompatibleServerless({
      action: 'testConnection',
      config: {
        endpoint: settings.endpoint,
        model: settings.model,
        apiKey: settings.apiKey
      }
    });
    return;
  }

  await callOpenAICompatibleDirect(
    settings,
    'ping',
    undefined,
    1
  );
};

/**
 * Format selected text to match document standards
 */
export const formatSelectedText = async (selectedText: string, documentContext: string): Promise<string> => {
  const openAISettings = getOpenAISettings();
  
  const prompt = `You are a document formatting expert. Format the following text to match MSDS/technical document standards.

FORMATTING REQUIREMENTS:
1. Section headings: Use ## for main sections (e.g., ## Section 7-Handling and Storage)
2. Subsection labels: Bold with colon on separate line (e.g., **Handling:**)
3. Key-value pairs: Bold labels (e.g., **Product Name**: {{Value}})
4. Tables: Use standard Markdown format with pipes |
5. Preserve {{placeholders}} exactly as they are
6. Add proper line breaks between paragraphs
7. Fix run-on text by adding appropriate breaks

DOCUMENT CONTEXT (for reference):
${documentContext.substring(0, 2000)}

TEXT TO FORMAT:
${selectedText}

OUTPUT:
Return ONLY the formatted text. No explanations, no code fences.`;

  if (openAISettings) {
    if (useServerless) {
      const result = await callOpenAICompatibleServerless<{ formatted: string }>({
        action: 'formatText',
        text: selectedText,
        context: documentContext,
        config: {
          endpoint: openAISettings.endpoint,
          model: openAISettings.model,
          apiKey: openAISettings.apiKey
        }
      });
      return result.formatted;
    }

    const content = await callOpenAICompatibleDirect(
      openAISettings,
      prompt,
      'You are a precise document formatting assistant.',
      2000
    );
    
    // Apply post-processing
    let formatted = normalizeSectionFormatting(content);
    formatted = normalizeKeyValueBolding(formatted);
    return formatted;
  }

  // Fallback to Gemini
  if (useServerless) {
    const result = await callServerless<{ formatted: string }>({
      action: 'formatText',
      text: selectedText,
      context: documentContext
    });
    return result.formatted;
  }

  const response = await getAI().models.generateContent({
    model: 'gemini-2.5-flash',
    contents: prompt,
    config: {
      systemInstruction: "You are a precise document formatting assistant.",
    }
  });

  let formatted = response.text || selectedText;
  formatted = normalizeSectionFormatting(formatted);
  formatted = normalizeKeyValueBolding(formatted);
  return formatted;
};