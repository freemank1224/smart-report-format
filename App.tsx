import React, { useState, useEffect, useRef } from 'react';
import DataUploader from './components/DataUploader';
import TemplateSelector from './components/TemplateSelector';
import ReportWorkspace from './components/ReportWorkspace';
import { Template, ViewState, ExcelData } from './types';
import { FileSpreadsheet, FileText, CheckCircle } from 'lucide-react';

const App: React.FC = () => {
  const [view, setView] = useState<ViewState>('upload-data');
  
  // Application State
  const [excelData, setExcelData] = useState<ExcelData | null>(null);
  const [activeTemplate, setActiveTemplate] = useState<Template | null>(null);
  const [templates, setTemplates] = useState<Template[]>([]);
  const scrollTimeoutRef = useRef<number | null>(null);

  // Load templates persistence
  useEffect(() => {
    const saved = localStorage.getItem('smartdoc_templates');
    if (saved) {
      try {
        setTemplates(JSON.parse(saved));
      } catch (e) {
        console.error("Failed to load templates", e);
      }
    }
  }, []);

  useEffect(() => {
    localStorage.setItem('smartdoc_templates', JSON.stringify(templates));
  }, [templates]);

  useEffect(() => {
    const handleScroll = () => {
      document.body.classList.add('is-scrolling');
      if (scrollTimeoutRef.current) {
        window.clearTimeout(scrollTimeoutRef.current);
      }
      scrollTimeoutRef.current = window.setTimeout(() => {
        document.body.classList.remove('is-scrolling');
      }, 800);
    };

    window.addEventListener('scroll', handleScroll, true);
    return () => {
      window.removeEventListener('scroll', handleScroll, true);
      if (scrollTimeoutRef.current) {
        window.clearTimeout(scrollTimeoutRef.current);
      }
    };
  }, []);

  // Workflow Handlers
  const handleDataLoaded = (data: ExcelData) => {
    setExcelData(data);
    setView('select-template');
  };

  const handleTemplateSelected = (template: Template) => {
    setActiveTemplate(template);
    setView('workspace');
  };

  const handleCreateTemplate = (newTemplate: Template) => {
    setTemplates(prev => [newTemplate, ...prev]);
    // Automatically select the new template and move forward
    setActiveTemplate(newTemplate);
    setView('workspace');
  };

  const handleUpdateTemplate = (updatedTemplate: Template) => {
    setTemplates(prev => prev.map(t => t.id === updatedTemplate.id ? updatedTemplate : t));
    setActiveTemplate(updatedTemplate);
  };

  const renderStepIndicator = () => {
    const steps = [
      { id: 'upload-data', label: '1. Upload Data', icon: FileSpreadsheet },
      { id: 'select-template', label: '2. Select Template', icon: FileText },
      { id: 'workspace', label: '3. Generate & Edit', icon: CheckCircle },
    ];

    return (
      <div className="flex items-center space-x-2 md:space-x-4 text-sm">
        {steps.map((step, index) => {
          const isActive = view === step.id;
          const isCompleted = 
            (step.id === 'upload-data' && excelData) || 
            (step.id === 'select-template' && activeTemplate);
          
          let colorClass = "text-slate-400";
          if (isActive) colorClass = "text-blue-600 font-bold";
          else if (isCompleted) colorClass = "text-green-600";

          return (
            <div key={step.id} className={`flex items-center gap-2 ${colorClass}`}>
              <step.icon size={16} />
              <span className="hidden md:inline">{step.label}</span>
              {index < steps.length - 1 && <span className="text-slate-300">/</span>}
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <nav className="bg-white border-b border-slate-200 sticky top-0 z-50 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2 cursor-pointer" onClick={() => setView('upload-data')}>
            <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center text-white font-bold text-lg">
              S
            </div>
            <span className="text-xl font-bold text-slate-800 tracking-tight hidden sm:block">SmartDoc AI</span>
          </div>
          
          {renderStepIndicator()}
        </div>
      </nav>

      <main className="flex-1 max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-8">
        {view === 'upload-data' && (
          <DataUploader onDataLoaded={handleDataLoaded} />
        )}

        {view === 'select-template' && (
          <TemplateSelector 
            templates={templates}
            onSelect={handleTemplateSelected}
            onCreate={handleCreateTemplate}
            onBack={() => setView('upload-data')}
            excelFileName={excelData?.fileName}
          />
        )}

        {view === 'workspace' && excelData && activeTemplate && (
          <ReportWorkspace
            template={activeTemplate}
            data={excelData}
            onUpdateTemplate={handleUpdateTemplate}
            onBack={() => setView('select-template')}
          />
        )}
      </main>
    </div>
  );
};

export default App;