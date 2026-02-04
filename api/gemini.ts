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
    You are an expert document parser. Your task is to analyze the following text extracted from a PDF report.
    
    GOAL:
    1. Reconstruct the logical structure of the document (headings, paragraphs, bullet points) into a clean Markdown format.
    2. Identify parts of the text that look like specific data points (e.g., Names, Dates, Amounts, Project Titles, ID numbers, Statuses) that would likely change in different reports.
    3. Replace these dynamic data points with Handlebars-style placeholders, e.g., {{ClientName}}, {{ReportDate}}, {{TotalRevenue}}.
    4. Keep static boilerplate text (legal disclaimers, standard introductions) as is.

    MARKDOWN CONSISTENCY RULES (MUST FOLLOW):
    - For any key-value line in the form "Label: Value", ALWAYS bold the label.
      Example: "Report No: {{ReportNumber}}" -> "**Report No**: {{ReportNumber}}".
      Example: "Report date: {{ReportDate}}" -> "**Report date**: {{ReportDate}}".
      Example: "Page: {{PageNumber}} of 7" -> "**Page**: {{PageNumber}} of 7".
    - If a section heading is followed by a single line that is an entry/item name (not a sentence), make that line bold.
      Example:
      "## Section 3-Composition/Information on Ingredient"
      "Pure Admixture"
      ->
      "## Section 3-Composition/Information on Ingredient"
      "**Pure Admixture**"
    - Use the same formatting rules consistently throughout the entire output. Avoid stylistic variations.

    CRITICAL RULES FOR TABLES & LISTS:
    - If you encounter a table with many repeated or empty rows (e.g., an Ingredients table with rows 1 to 20), DO NOT generate a placeholder for every single row.
    - ONLY generate the first 3 rows as examples to establish the pattern (e.g., {{Ingredient1_Name}}, {{Ingredient2_Name}}, {{Ingredient3_Name}}).
    - Stop after 3-5 rows. Do not output 20+ rows of placeholders. It is better to be concise.
    - Do NOT output horizontal rules ("---") outside of Markdown tables. Only use "---" for table header separators.

    INPUT TEXT:
    ${rawText.substring(0, 30000)} 
    (Truncated if too long)

    OUTPUT FORMAT:
    Return ONLY the Markdown text with {{placeholders}}. Do not include introductory text or JSON wrapping.
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
      const regex = /\{\{([^}]+)\}\}/g;
      const matches = new Set<string>();
      let match;
      while ((match = regex.exec(content)) !== null) {
        matches.add(match[1]);
      }

      const result: AnalysisResult = {
        content,
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
