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
 * Analyzes raw text from a PDF and converts it into a structured template.
 */
export const analyzePdfStructure = async (rawText: string): Promise<AnalysisResult> => {
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

    const normalizedContent = normalizeKeyValueBolding(content);
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
      model: 'gemini-3-flash-preview',
      contents: prompt,
      config: {
        systemInstruction: "You are a precise document structuring assistant. You output only Markdown.",
      }
    });

    const content = response.text || "";
    const normalizedContent = normalizeKeyValueBolding(content);
    
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