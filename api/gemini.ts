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
   - Line 1 (company name) → {{CompanyName}}.
   - Lines 2-3 keep exact text from document.

2. METADATA BLOCK (Report No, Report date, Page):
   - These appear AFTER the title block, BEFORE Section 1.
   - Each field: bold label + placeholder value.
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

5. KEY-VALUE PAIRS (★ MOST IMPORTANT ★):
   - For EVERY "Label: Value" line, bold the label.
   - Pattern: "Label: Value" → "**Label**: Value"
   - This applies to ALL sections without exception.
   - Dynamic values (names, dates, numbers, addresses, emails, phones) → use {{Placeholder}}.
   - Static instructional text → keep as-is.

6. MANUFACTURER BLOCK (usually after ingredient table):
   - ALL values must be placeholders:
     **Manufacture**: {{Manufacture}}
     **Address**: {{Address}}
     **Contact Person**: {{ContactPerson}}
     **Tel**: {{Tel}}
     **Fax**: {{Fax}}
     **Email**: {{Email}}

7. TABLES:
   - Keep in Markdown table format.
   - For long tables, only show 3-5 example rows.

=== FINAL CHECKLIST BEFORE OUTPUT ===
✓ Title block is 3 H1 lines at the very top?
✓ Metadata (Report No, date, Page) comes AFTER title, BEFORE Section 1?
✓ Product Name is included in Section 1?
✓ Every "Label: Value" has bold label?
✓ All dynamic values use {{Placeholder}}?
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
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  try {
    const { action, rawText, params } = req.body || {};

    if (action === 'analyzePdfStructure') {
      if (typeof rawText !== 'string') {
        res.status(400).json({ error: 'rawText is required' });
        return;
      }

      const response = await getAI().models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: buildAnalyzePrompt(rawText),
        config: {
          systemInstruction: "You are a precise document structuring assistant. You output only Markdown.",
        }
      });

      const content = response.text || "";
      const normalizedContent = normalizeKeyValueBolding(content);
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
        model: 'gemini-3-flash-preview',
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
