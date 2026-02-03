import React, { useState } from 'react';
import { Template } from '../types';
import TemplateEditor from './TemplateEditor';
import { Plus, FileText, ArrowLeft, Search } from 'lucide-react';

interface TemplateSelectorProps {
  templates: Template[];
  onSelect: (template: Template) => void;
  onCreate: (template: Template) => void;
  onBack: () => void;
  excelFileName?: string;
}

const TemplateSelector: React.FC<TemplateSelectorProps> = ({ templates, onSelect, onCreate, onBack, excelFileName }) => {
  const [isCreating, setIsCreating] = useState(false);
  const [search, setSearch] = useState('');

  const filteredTemplates = templates.filter(t => 
    t.name.toLowerCase().includes(search.toLowerCase()) || 
    t.description.toLowerCase().includes(search.toLowerCase())
  );

  if (isCreating) {
    return (
      <TemplateEditor 
        onSave={(t) => { onCreate(t); setIsCreating(false); }}
        onCancel={() => setIsCreating(false)}
      />
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <button onClick={onBack} className="text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200 flex items-center gap-2 mb-2 transition-colors">
            <ArrowLeft size={16} /> Change Data Source
          </button>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Step 2: Select a Template</h1>
          <p className="text-slate-500 dark:text-slate-400 mt-1">
            Choose a structure to apply to <strong className="text-slate-700 dark:text-slate-300">{excelFileName}</strong>.
          </p>
        </div>
        
        <div className="flex gap-3">
          <div className="relative">
            <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input 
              type="text" 
              placeholder="Search templates..." 
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-10 pr-4 py-2.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white placeholder:text-slate-400 focus:ring-2 focus:ring-blue-500 outline-none w-full md:w-64 transition-colors"
            />
          </div>
          <button
            onClick={() => setIsCreating(true)}
            className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-5 py-2.5 rounded-lg font-medium shadow-sm transition-all whitespace-nowrap"
          >
            <Plus size={18} />
            New Template
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {/* Create New Card */}
        <button 
          onClick={() => setIsCreating(true)}
          className="flex flex-col items-center justify-center p-8 bg-white dark:bg-slate-800 border-2 border-dashed border-slate-300 dark:border-slate-700 rounded-xl hover:border-blue-500 dark:hover:border-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/10 group transition-all text-center h-64"
        >
          <div className="w-14 h-14 bg-slate-100 dark:bg-slate-700 group-hover:bg-blue-200 dark:group-hover:bg-blue-900/50 text-slate-400 dark:text-slate-400 group-hover:text-blue-600 dark:group-hover:text-blue-400 rounded-full flex items-center justify-center mb-4 transition-colors">
            <Plus size={28} />
          </div>
          <h3 className="font-bold text-slate-800 dark:text-white text-lg">Upload PDF Template</h3>
          <p className="text-slate-500 dark:text-slate-400 text-sm mt-2 max-w-xs">
            Extract structure and variables from a new PDF file using AI.
          </p>
        </button>

        {filteredTemplates.map((template) => (
          <div 
            key={template.id} 
            onClick={() => onSelect(template)}
            className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm hover:shadow-lg hover:border-blue-300 dark:hover:border-blue-600 cursor-pointer transition-all flex flex-col h-64 group relative overflow-hidden"
          >
            <div className="absolute top-0 left-0 w-1 h-full bg-blue-600 opacity-0 group-hover:opacity-100 transition-opacity" />
            
            <div className="p-6 flex-1 overflow-hidden">
              <div className="flex justify-between items-start mb-4">
                <div className="p-3 bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-300 rounded-lg group-hover:bg-blue-600 group-hover:text-white transition-colors">
                  <FileText size={24} />
                </div>
              </div>
              <h3 className="text-lg font-bold text-slate-800 dark:text-white mb-2 group-hover:text-blue-700 dark:group-hover:text-blue-400 transition-colors">{template.name}</h3>
              <p className="text-sm text-slate-500 dark:text-slate-400 line-clamp-2">{template.description}</p>
            </div>
            
            <div className="px-6 py-4 bg-slate-50 dark:bg-slate-900/50 border-t border-slate-100 dark:border-slate-700 flex items-center justify-between">
              <span className="text-xs font-mono text-slate-500 dark:text-slate-400 bg-white dark:bg-slate-800 px-2 py-1 rounded border border-slate-200 dark:border-slate-700">
                {template.variables.length} Variables
              </span>
              <span className="text-sm font-medium text-blue-600 dark:text-blue-400 opacity-0 group-hover:opacity-100 transform translate-x-2 group-hover:translate-x-0 transition-all flex items-center gap-1">
                Select <ArrowLeft className="rotate-180" size={14} />
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default TemplateSelector;