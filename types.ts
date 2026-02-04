export interface Template {
  id: string;
  name: string;
  description: string;
  content: string; // The markdown/text content with {{variables}}
  variables: string[]; // List of detected variables
  defaultValues?: Record<string, string>; // Prefill values extracted from the source report
  createdAt: number;
}

export interface ExcelData {
  fileName: string;
  headers: string[];
  rows: Record<string, any>[];
  keyValues?: Record<string, string>;
}

export type ViewState = 'upload-data' | 'select-template' | 'workspace';

export interface AnalysisResult {
  content: string;
  detectedVariables: string[];
}

export interface VariableCandidate {
  value: string;
  confidence: number; // 0~1
  evidence: string;
  rationale?: string;
}

export interface VariableMappingSuggestion {
  variable: string;
  candidates: VariableCandidate[];
}

export interface DocumentMappingResult {
  mappings: VariableMappingSuggestion[];
  notes?: string[];
}

export type LLMProvider = 'gemini' | 'openai-compatible';

export interface LLMSettings {
  provider: LLMProvider;
  endpoint: string;
  model: string;
  apiKey: string;
  rememberSession: boolean;
  multimodalConfirmed: boolean;
}