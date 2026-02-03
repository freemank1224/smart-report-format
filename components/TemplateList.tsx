import React from 'react';
import { Template } from '../types';
import { Plus, Edit, Trash2, FileOutput, FileText } from 'lucide-react';

interface TemplateListProps {
  templates: Template[];
  onCreate: () => void;
  onEdit: (template: Template) => void;
  onDelete: (id: string) => void;
  onGenerate: (template: Template) => void;
}

const TemplateList: React.FC<TemplateListProps> = ({ templates, onCreate, onEdit, onDelete, onGenerate }) => {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Document Templates</h1>
          <p className="text-slate-500 mt-1">Manage your AI-extracted templates and generate reports.</p>
        </div>
        <button
          onClick={onCreate}
          className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-5 py-2.5 rounded-lg font-medium shadow-sm transition-all"
        >
          <Plus size={18} />
          Create New Template
        </button>
      </div>

      {templates.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 bg-white rounded-xl border border-dashed border-slate-300 text-slate-400">
          <div className="bg-slate-50 p-4 rounded-full mb-4">
             <i className="fas fa-folder-open text-3xl"></i>
          </div>
          <p className="text-lg font-medium">No templates found</p>
          <p className="text-sm">Upload a PDF to create your first automation template.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {templates.map((template) => (
            <div key={template.id} className="bg-white rounded-xl border border-slate-200 shadow-sm hover:shadow-md transition-shadow flex flex-col overflow-hidden group">
              <div className="p-6 flex-1">
                <div className="flex justify-between items-start mb-4">
                  <div className="p-3 bg-indigo-50 text-indigo-600 rounded-lg">
                    <FileText size={24} />
                  </div>
                  <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button 
                      onClick={() => onEdit(template)}
                      className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-md transition-colors"
                      title="Edit"
                    >
                      <Edit size={16} />
                    </button>
                    <button 
                      onClick={() => onDelete(template.id)}
                      className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-md transition-colors"
                      title="Delete"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
                <h3 className="text-lg font-bold text-slate-800 mb-2">{template.name}</h3>
                <p className="text-sm text-slate-500 line-clamp-2 mb-4">{template.description}</p>
                
                <div className="flex flex-wrap gap-2">
                  {template.variables.slice(0, 3).map((v) => (
                    <span key={v} className="px-2 py-1 bg-slate-100 text-slate-600 text-xs rounded-md font-mono border border-slate-200">
                      {v}
                    </span>
                  ))}
                  {template.variables.length > 3 && (
                    <span className="px-2 py-1 bg-slate-50 text-slate-400 text-xs rounded-md">
                      +{template.variables.length - 3} more
                    </span>
                  )}
                </div>
              </div>
              
              <div className="p-4 border-t border-slate-100 bg-slate-50">
                <button
                  onClick={() => onGenerate(template)}
                  className="w-full flex items-center justify-center gap-2 bg-white border border-slate-300 hover:border-indigo-500 hover:text-indigo-600 text-slate-700 py-2 rounded-lg font-medium transition-all text-sm shadow-sm"
                >
                  <FileOutput size={16} />
                  Generate Reports
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default TemplateList;