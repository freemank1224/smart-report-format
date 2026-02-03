import { GoogleGenAI } from "@google/genai";
import { AnalysisResult, DocumentMappingResult } from "../types";

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
 * Analyzes raw text from a PDF and converts it into a structured template.
 */
export const analyzePdfStructure = async (rawText: string): Promise<AnalysisResult> => {
  const prompt = `
    You are an expert document parser. Your task is to analyze the following text extracted from a PDF report.
    
    GOAL:
    1. Reconstruct the logical structure of the document (headings, paragraphs, bullet points) into a clean Markdown format.
    2. Identify parts of the text that look like specific data points (e.g., Names, Dates, Amounts, Project Titles, ID numbers, Statuses) that would likely change in different reports.
    3. Replace these dynamic data points with Handlebars-style placeholders, e.g., {{ClientName}}, {{ReportDate}}, {{TotalRevenue}}.
    4. Keep static boilerplate text (legal disclaimers, standard introductions) as is.

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

  try {
    const response = await getAI().models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: prompt,
      config: {
        systemInstruction: "You are a precise document structuring assistant. You output only Markdown.",
      }
    });

    const content = response.text || "";
    
    // Simple regex to extract variables for convenience
    const regex = /\{\{([^}]+)\}\}/g;
    const matches = new Set<string>();
    let match;
    while ((match = regex.exec(content)) !== null) {
      matches.add(match[1]);
    }

    return {
      content,
      detectedVariables: Array.from(matches)
    };

  } catch (error) {
    console.error("Error calling Gemini:", error);
    throw new Error("Failed to analyze document structure.");
  }
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

export const suggestVariableMappingsFromDocument = async (params: {
  documentText: string;
  templateContent: string;
  variables: string[];
}): Promise<DocumentMappingResult> => {
  const { documentText, templateContent, variables } = params;

  const prompt = `
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

  try {
    const response = await getAI().models.generateContent({
      model: 'gemini-3-flash-preview',
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