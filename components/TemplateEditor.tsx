import React, { useState, useCallback, useRef } from 'react';
import { analyzePdfWithVision, analyzePdfStructure, suggestVariableMappingsFromDocument } from '../services/geminiService';
import { extractTextFromPdf } from '../utils/fileProcessors';
import { Template } from '../types';
import { Loader2, FileText, Wand2, Save, ArrowLeft, Eye, AlertCircle } from 'lucide-react';

interface TemplateEditorProps {
  onSave: (template: Template) => void;
  onCancel: () => void;
  existingTemplate?: Template;
}

const TemplateEditor: React.FC<TemplateEditorProps> = ({ onSave, onCancel, existingTemplate }) => {
  const [step, setStep] = useState<number>(existingTemplate ? 2 : 1);
  const [templateName, setTemplateName] = useState(existingTemplate?.name || '');
  const [templateContent, setTemplateContent] = useState(existingTemplate?.content || '');
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [defaultValues, setDefaultValues] = useState<Record<string, string>>(existingTemplate?.defaultValues || {});

  const normalizeReportTitle = (content: string) => {
    const singleLinePattern = /^#\s*\{\{CompanyName\}\}[^\n]*Material\s+Safety\s+Data\s+Sheet\s*\(MSDS\)[^\n]*$/m;
    const twoLinePattern = /^#\s*\{\{CompanyName\}\}\s*\n\s*(?:\*\*|__)?\s*Material\s+Safety\s+Data\s+Sheet\s*\(MSDS\)\s*(?:\*\*|__)?\s*$/m;

    const replacement = (
      `# {{CompanyName}}\n` +
      `# Material Safety Data Sheet\n` +
      `# (MSDS)`
    );

    if (singleLinePattern.test(content)) {
      return content.replace(singleLinePattern, replacement);
    }

    if (twoLinePattern.test(content)) {
      return content.replace(twoLinePattern, replacement);
    }

    return content;
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsProcessing(true);
    setError(null);
    
    try {
      console.log('🚀 Starting multimodal vision-based PDF analysis...');
      
      // PRIMARY METHOD: Vision-based analysis
      let result;
      let rawText = '';
      
      try {
        // Use vision model for accurate table extraction
        result = await analyzePdfWithVision(file, 10); // Max 10 pages
        
        // Also extract text for variable mapping
        rawText = await extractTextFromPdf(file);
        
        console.log('✅ Vision analysis successful');
      } catch (visionError) {
        console.warn('⚠️ Vision analysis failed, falling back to text extraction:', visionError);
        
        // FALLBACK: Text-based analysis
        rawText = await extractTextFromPdf(file);
        result = await analyzePdfStructure(rawText);
        
        setError('使用备用文本模式（表格识别精度可能较低）。建议重试或检查网络连接。');
      }
      
      const normalizedContent = normalizeReportTitle(result.content);
      setTemplateContent(normalizedContent);

      const variables = result.detectedVariables?.length
        ? result.detectedVariables
        : Array.from(normalizedContent.matchAll(/\{\{([^}]+)\}\}/g)).map(m => m[1]);

      // Try to prefill variable values
      try {
        const mapping = await suggestVariableMappingsFromDocument({
          documentText: rawText || normalizedContent,
          templateContent: normalizedContent,
          variables
        });
        const prefill: Record<string, string> = {};
        mapping.mappings.forEach(m => {
          const value = m.candidates?.[0]?.value?.trim();
          if (value) prefill[m.variable] = value;
        });
        setDefaultValues(prefill);
      } catch (mapErr) {
        console.warn('Failed to prefill variable values from report', mapErr);
        setDefaultValues({});
      }
      
      // Move to editor step
      setStep(2);
    } catch (err: any) {
      setError(err.message || "Failed to process PDF.");
    } finally {
      setIsProcessing(false);
      // Allow re-selecting the same file after failure or retry
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleSave = () => {
    if (!templateName.trim()) {
      setError("Please provide a template name.");
      return;
    }

    // Extract variables again in case user edited them manually
    const regex = /\{\{([^}]+)\}\}/g;
    const matches = new Set<string>();
    let match;
    while ((match = regex.exec(templateContent)) !== null) {
      matches.add(match[1]);
    }

    const newTemplate: Template = {
      id: existingTemplate?.id || crypto.randomUUID(),
      name: templateName,
      description: `Template with ${matches.size} variables`,
      content: templateContent,
      variables: Array.from(matches),
      defaultValues: defaultValues,
      createdAt: existingTemplate?.createdAt || Date.now(),
    };

    onSave(newTemplate);
  };

  return (
    <div className="flex flex-col h-full bg-white dark:bg-slate-900 rounded-xl shadow-sm border border-slate-200 dark:border-slate-800 overflow-hidden">
      {/* Header */}
      <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between bg-slate-50 dark:bg-slate-800">
        <div className="flex items-center gap-4">
           <button onClick={onCancel} className="text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200 transition-colors">
            <ArrowLeft size={20} />
          </button>
          <h2 className="text-xl font-bold text-slate-800 dark:text-white">
            {existingTemplate ? 'Edit Template' : 'New Template Builder'}
          </h2>
        </div>
        <div className="flex items-center gap-2">
           <span className={`px-3 py-1 rounded-full text-xs font-medium ${step === 1 ? 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300' : 'bg-slate-100 text-slate-500 dark:bg-slate-700 dark:text-slate-400'}`}>
             1. Upload & Analyze
           </span>
           <span className="text-slate-300 dark:text-slate-600">/</span>
           <span className={`px-3 py-1 rounded-full text-xs font-medium ${step === 2 ? 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300' : 'bg-slate-100 text-slate-500 dark:bg-slate-700 dark:text-slate-400'}`}>
             2. Review & Save
           </span>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-8 bg-white dark:bg-slate-900">
        {step === 1 && (
          <div className="max-w-xl mx-auto flex flex-col items-center justify-center h-full text-center space-y-6">
            <div className="p-6 bg-blue-50 dark:bg-blue-900/20 rounded-full">
              <Eye size={48} className="text-blue-500" />
            </div>
            <div>
              <h3 className="text-2xl font-semibold text-slate-800 dark:text-white">
                上传 PDF 报告
                <span className="ml-2 text-sm px-2 py-1 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 rounded-full">
                  🤖 多模态视觉识别
                </span>
              </h3>
              <p className="text-slate-500 dark:text-slate-400 mt-2">
                使用 Gemini Vision AI 精确提取表格结构，自动去除水印和印章
              </p>
              <div className="mt-4 text-xs text-slate-400 dark:text-slate-500 space-y-1">
                <div className="flex items-center justify-center gap-2">
                  <span>✓</span>
                  <span>视觉识别表格边框和单元格</span>
                </div>
                <div className="flex items-center justify-center gap-2">
                  <span>✓</span>
                  <span>智能去除水印、印章和背景</span>
                </div>
                <div className="flex items-center justify-center gap-2">
                  <span>✓</span>
                  <span>准确保持列数和格式</span>
                </div>
              </div>
            </div>
            
            <label className="relative cursor-pointer group">
               <input 
                type="file" 
                accept="application/pdf" 
                className="hidden" 
                onChange={handleFileUpload}
                  onClick={(e) => {
                    const input = e.currentTarget as HTMLInputElement;
                    input.value = '';
                    setError(null);
                  }}
                disabled={isProcessing}
                  ref={fileInputRef}
              />
              <div className={`
                flex items-center gap-3 px-8 py-4 rounded-lg font-medium text-white transition-all shadow-lg shadow-blue-500/20
                ${isProcessing ? 'bg-blue-400 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-700 hover:shadow-blue-500/40'}
              `}>
                {isProcessing ? <Loader2 className="animate-spin" /> : <Eye />}
                {isProcessing ? '🔍 视觉分析中...' : '选择 PDF 开始分析'}
              </div>
            </label>
            
            {error && (
              <div className="flex items-start gap-2 text-amber-600 bg-amber-50 dark:bg-amber-900/20 px-4 py-3 rounded-md text-sm border border-amber-100 dark:border-amber-900">
                <AlertCircle size={16} className="mt-0.5 flex-shrink-0" />
                <span>{error}</span>
              </div>
            )}
          </div>
        )}

        {step === 2 && (
          <div className="flex flex-col h-full gap-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 h-full">
              {/* Left Column: Metadata & Instructions */}
              <div className="md:col-span-1 space-y-6">
                <div className="space-y-2">
                  <label className="text-sm font-semibold text-slate-700 dark:text-slate-300">Template Name</label>
                  <input
                    type="text"
                    value={templateName}
                    onChange={(e) => setTemplateName(e.target.value)}
                    className="w-full px-4 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white placeholder:text-slate-400 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all"
                    placeholder="e.g. Monthly Sales Report"
                  />
                </div>

                <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg p-4 text-amber-900 dark:text-amber-200 text-sm space-y-2">
                  <h4 className="font-semibold flex items-center gap-2">
                    <i className="fas fa-info-circle"></i> Instructions
                  </h4>
                  <p>Review the AI-generated template on the right.</p>
                  <ul className="list-disc pl-4 space-y-1 opacity-90">
                    <li>Variables are marked as <code>{`{{VariableName}}`}</code>.</li>
                    <li>You can manually add or rename variables.</li>
                    <li>Ensure variable names match your future Excel headers roughly (we'll map them later).</li>
                  </ul>
                </div>

                 <button
                  onClick={handleSave}
                  className="w-full flex items-center justify-center gap-2 bg-green-600 hover:bg-green-700 text-white py-3 rounded-lg font-medium shadow-md transition-all"
                >
                  <Save size={18} />
                  Save Template
                </button>
              </div>

              {/* Right Column: Editor */}
              <div className="md:col-span-2 flex flex-col h-full">
                <label className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2 flex justify-between">
                  <span>Template Content (Markdown)</span>
                  <span className="text-xs text-slate-400 font-normal">Auto-generated by Gemini</span>
                </label>
                <textarea
                  value={templateContent}
                  onChange={(e) => setTemplateContent(e.target.value)}
                  className="flex-1 w-full p-4 rounded-lg border border-slate-300 dark:border-slate-700 font-mono text-sm leading-relaxed focus:ring-2 focus:ring-blue-500 outline-none resize-none bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white placeholder:text-slate-400"
                  placeholder="Template content will appear here..."
                />
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default TemplateEditor;