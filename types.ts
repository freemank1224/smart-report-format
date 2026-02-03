export interface Template {
  id: string;
  name: string;
  description: string;
  content: string; // The markdown/text content with {{variables}}
  variables: string[]; // List of detected variables
  createdAt: number;
}

export interface ExcelData {
  fileName: string;
  headers: string[];
  rows: Record<string, any>[];
}

export type ViewState = 'upload-data' | 'select-template' | 'workspace';

export interface AnalysisResult {
  content: string;
  detectedVariables: string[];
}