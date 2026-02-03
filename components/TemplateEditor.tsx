import React, { useState, useCallback } from 'react';
import { analyzePdfStructure } from '../services/geminiService';
import { extractTextFromPdf } from '../utils/fileProcessors';
import { Template } from '../types';
import { Loader2, FileText, Wand2, Save, ArrowLeft } from 'lucide-react';

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

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsProcessing(true);
    setError(null);
    try {
      // 1. Extract raw text
      const rawText = await extractTextFromPdf(file);
      
      // 2. AI Analysis
      const result = await analyzePdfStructure(rawText);
      setTemplateContent(result.content);
      
      // Move to editor step
      setStep(2);
    } catch (err: any) {
      setError(err.message || "Failed to process PDF.");
    } finally {
      setIsProcessing(false);
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
              <FileText size={48} className="text-blue-500" />
            </div>
            <div>
              <h3 className="text-2xl font-semibold text-slate-800 dark:text-white">Upload PDF Report</h3>
              <p className="text-slate-500 dark:text-slate-400 mt-2">We'll use Gemini AI to extract the structure and identify variables.</p>
            </div>
            
            <label className="relative cursor-pointer group">
               <input 
                type="file" 
                accept="application/pdf" 
                className="hidden" 
                onChange={handleFileUpload}
                disabled={isProcessing}
              />
              <div className={`
                flex items-center gap-3 px-8 py-4 rounded-lg font-medium text-white transition-all shadow-lg shadow-blue-500/20
                ${isProcessing ? 'bg-blue-400 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-700 hover:shadow-blue-500/40'}
              `}>
                {isProcessing ? <Loader2 className="animate-spin" /> : <Wand2 />}
                {isProcessing ? 'Analyzing Document...' : 'Select PDF to Analyze'}
              </div>
            </label>
            
            {error && (
              <div className="text-red-500 bg-red-50 dark:bg-red-900/20 px-4 py-2 rounded-md text-sm border border-red-100 dark:border-red-900">
                {error}
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