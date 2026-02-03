import React, { useState, useMemo, useEffect } from 'react';
import { Template, ExcelData } from '../types';
import { parseExcelFile } from '../utils/fileProcessors';
import { ArrowLeft, Table, ChevronRight, ChevronLeft, FileCheck, AlertCircle, Download, Search, X, Check } from 'lucide-react';

interface ReportGeneratorProps {
  template: Template;
  onBack: () => void;
}

const ReportGenerator: React.FC<ReportGeneratorProps> = ({ template, onBack }) => {
  const [excelData, setExcelData] = useState<ExcelData | null>(null);
  const [columnMapping, setColumnMapping] = useState<Record<string, string>>({});
  const [previewRowIndex, setPreviewRowIndex] = useState(0);
  const [editingVariable, setEditingVariable] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');

  // Auto-map columns when data is loaded
  useEffect(() => {
    if (excelData && template.variables.length > 0) {
      const initialMapping: Record<string, string> = {};
      const headersLower = excelData.headers.map(h => h.toLowerCase());
      
      template.variables.forEach(v => {
        // 1. Try exact match (case-insensitive)
        const vLower = v.toLowerCase();
        let matchIndex = headersLower.indexOf(vLower);
        
        // 2. Try match without underscores/spaces (e.g. "Product_Name" -> "productname")
        if (matchIndex === -1) {
             const vClean = vLower.replace(/[_\s]/g, '');
             matchIndex = headersLower.findIndex(h => h.replace(/[_\s]/g, '') === vClean);
        }
        
        // 3. Try fuzzy match for common prefixes (e.g. "Ingredient1_Name" -> "Ingredient1")
        // This helps with the table structure in the screenshot
        if (matchIndex === -1 && vLower.includes('_')) {
             const prefix = vLower.split('_')[0];
             matchIndex = headersLower.indexOf(prefix);
        }

        if (matchIndex !== -1) {
          initialMapping[v] = excelData.headers[matchIndex];
        } else {
           initialMapping[v] = '';
        }
      });
      setColumnMapping(initialMapping);
    }
  }, [excelData, template.variables]);

  const handleExcelUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const data = await parseExcelFile(file);
      setExcelData(data);
    } catch (err) {
      console.error(err);
      alert("Failed to parse Excel file.");
    }
  };

  const updateMapping = (variable: string, column: string) => {
    setColumnMapping(prev => ({ ...prev, [variable]: column }));
    setEditingVariable(null);
  };

  const segments = useMemo(() => {
    // Split by {{variable}} but keep the delimiter
    return template.content.split(/(\{\{[^}]+\}\})/g);
  }, [template.content]);

  const allMapped = template.variables.every(v => !!columnMapping[v]);
  const mappedCount = Object.values(columnMapping).filter(Boolean).length;

  const handleDownload = () => {
    alert(`Generating ${excelData?.rows.length} reports... (Mock functionality)`);
  };

  return (
    <div className="flex flex-col h-full bg-slate-50 dark:bg-slate-950">
      {/* Top Header */}
      <div className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 px-6 py-4 flex items-center justify-between sticky top-0 z-20">
        <div className="flex items-center gap-4">
          <button onClick={onBack} className="text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200 transition-colors">
            <ArrowLeft size={20} />
          </button>
          <div>
            <h2 className="text-lg font-bold text-slate-800 dark:text-white flex items-center gap-2">
              <FileCheck size={18} className="text-blue-600 dark:text-blue-400" />
              Report Preview & Mapping
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
               {excelData ? `${mappedCount}/${template.variables.length} variables mapped` : 'Upload data to begin'}
            </p>
          </div>
        </div>

        {excelData && (
          <div className="flex items-center gap-4">
            {/* Pagination */}
            <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800 p-1 rounded-lg border border-slate-200 dark:border-slate-700">
              <button 
                onClick={() => setPreviewRowIndex(Math.max(0, previewRowIndex - 1))}
                disabled={previewRowIndex === 0}
                className="p-1.5 rounded-md hover:bg-white dark:hover:bg-slate-700 hover:shadow-sm disabled:opacity-30 disabled:hover:shadow-none transition-all text-slate-600 dark:text-slate-300"
              >
                <ChevronLeft size={16} />
              </button>
              <span className="text-xs font-medium w-24 text-center text-slate-600 dark:text-slate-300">
                Row {previewRowIndex + 1} / {excelData.rows.length}
              </span>
              <button 
                onClick={() => setPreviewRowIndex(Math.min(excelData.rows.length - 1, previewRowIndex + 1))}
                disabled={previewRowIndex === excelData.rows.length - 1}
                className="p-1.5 rounded-md hover:bg-white dark:hover:bg-slate-700 hover:shadow-sm disabled:opacity-30 disabled:hover:shadow-none transition-all text-slate-600 dark:text-slate-300"
              >
                <ChevronRight size={16} />
              </button>
            </div>

            <button 
              onClick={handleDownload}
              className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-all shadow-sm"
            >
              <Download size={16} />
              Generate All
            </button>
          </div>
        )}
      </div>

      {/* Main Content Area */}
      <div className="flex-1 overflow-hidden relative">
        {!excelData ? (
          <div className="h-full flex flex-col items-center justify-center p-8 text-center animate-in fade-in duration-500">
            <div className="bg-white dark:bg-slate-800 p-8 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-xl max-w-md w-full">
              <div className="w-16 h-16 bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 rounded-2xl flex items-center justify-center mx-auto mb-6">
                <Table size={32} />
              </div>
              <h3 className="text-xl font-bold text-slate-800 dark:text-white mb-2">Connect Data Source</h3>
              <p className="text-slate-500 dark:text-slate-400 mb-8 text-sm leading-relaxed">
                Upload an Excel file to automatically map data to your template variables. 
                We'll try to match columns for you.
              </p>
              
              <label className="cursor-pointer group block w-full">
                <input type="file" accept=".xlsx, .xls" className="hidden" onChange={handleExcelUpload} />
                <div className="bg-blue-600 group-hover:bg-blue-700 text-white py-3 rounded-xl font-medium shadow-lg shadow-blue-600/20 transition-all flex items-center justify-center gap-2">
                  <span>Select Excel File</span>
                </div>
              </label>
              <p className="mt-4 text-xs text-slate-400">Supports .xlsx and .xls files</p>
            </div>
          </div>
        ) : (
          <div className="h-full overflow-auto bg-slate-100 dark:bg-slate-950 p-8">
             {/* Document Canvas */}
             <div className="max-w-[210mm] mx-auto bg-white dark:bg-slate-900 shadow-xl min-h-[297mm] p-[20mm] relative transition-colors duration-200">
               <div className="font-mono text-sm leading-relaxed whitespace-pre-wrap text-slate-800 dark:text-slate-200">
                 {segments.map((segment, idx) => {
                   if (segment.match(/^\{\{[^}]+\}\}$/)) {
                     const variableName = segment.slice(2, -2);
                     const mappedCol = columnMapping[variableName];
                     const currentRow = excelData.rows[previewRowIndex];
                     const value = mappedCol ? currentRow[mappedCol] : null;
                     const isMapped = !!mappedCol;
                     const displayValue = isMapped ? (value !== undefined ? String(value) : '') : segment;

                     return (
                       <span 
                         key={idx}
                         onClick={() => {
                           setEditingVariable(variableName);
                           setSearchTerm('');
                         }}
                         className={`
                           inline-block cursor-pointer px-1 rounded mx-0.5 border transition-all duration-200 select-none
                           ${isMapped 
                             ? 'bg-green-50 dark:bg-green-900/30 border-green-200 dark:border-green-800 text-green-800 dark:text-green-300 hover:bg-green-100 dark:hover:bg-green-900/50 hover:border-green-300' 
                             : 'bg-amber-50 dark:bg-amber-900/30 border-amber-200 dark:border-amber-800 text-amber-700 dark:text-amber-300 hover:bg-amber-100 dark:hover:bg-amber-900/50 hover:border-amber-300 animate-pulse'
                           }
                         `}
                         title={isMapped ? `Mapped to: ${mappedCol}` : 'Click to map data'}
                       >
                         {displayValue || <span className="text-slate-300 dark:text-slate-600 italic">Empty</span>}
                       </span>
                     );
                   }
                   return <span key={idx}>{segment}</span>;
                 })}
               </div>
             </div>
          </div>
        )}

        {/* Column Selection Modal */}
        {editingVariable && excelData && (
          <div className="absolute inset-0 z-50 flex items-center justify-center bg-slate-900/20 dark:bg-slate-900/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
            <div className="bg-white dark:bg-slate-800 rounded-xl shadow-2xl w-full max-w-md border border-slate-200 dark:border-slate-700 overflow-hidden flex flex-col max-h-[80vh]">
              <div className="p-4 border-b border-slate-100 dark:border-slate-700 flex items-center justify-between bg-slate-50 dark:bg-slate-800">
                <div>
                  <h3 className="font-bold text-slate-800 dark:text-white">Map Variable</h3>
                  <code className="text-xs text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/30 px-1.5 py-0.5 rounded mt-1 inline-block">
                    {`{{${editingVariable}}}`}
                  </code>
                </div>
                <button 
                  onClick={() => setEditingVariable(null)}
                  className="p-1 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-md transition-colors text-slate-500 dark:text-slate-400"
                >
                  <X size={20} />
                </button>
              </div>
              
              <div className="p-3 border-b border-slate-100 dark:border-slate-700">
                <div className="relative">
                  <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input 
                    type="text" 
                    placeholder="Search columns..." 
                    className="w-full pl-9 pr-4 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-sm text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    autoFocus
                  />
                </div>
              </div>

              <div className="overflow-y-auto p-2 flex-1 bg-white dark:bg-slate-800">
                <div className="grid gap-1">
                  <button
                    onClick={() => updateMapping(editingVariable, '')}
                    className="flex items-center gap-3 w-full px-3 py-2.5 rounded-lg text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors text-left font-medium"
                  >
                    <X size={16} />
                    Unmap Variable
                  </button>
                  <div className="h-px bg-slate-100 dark:bg-slate-700 my-1" />
                  
                  {excelData.headers
                    .filter(h => h.toLowerCase().includes(searchTerm.toLowerCase()))
                    .map(header => {
                      const isSelected = columnMapping[editingVariable] === header;
                      // Preview value for first row
                      const previewVal = excelData.rows[0][header];
                      
                      return (
                        <button
                          key={header}
                          onClick={() => updateMapping(editingVariable, header)}
                          className={`
                            flex items-center justify-between w-full px-3 py-2.5 rounded-lg text-sm transition-all group
                            ${isSelected 
                              ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 font-medium' 
                              : 'text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700'
                            }
                          `}
                        >
                          <div className="flex flex-col items-start gap-0.5 overflow-hidden">
                            <span className="truncate w-full">{header}</span>
                            <span className="text-[10px] text-slate-400 dark:text-slate-500 truncate w-full max-w-[200px]">
                              Ex: {previewVal}
                            </span>
                          </div>
                          {isSelected && <Check size={16} className="text-blue-600 dark:text-blue-400" />}
                        </button>
                      );
                  })}
                  
                  {excelData.headers.filter(h => h.toLowerCase().includes(searchTerm.toLowerCase())).length === 0 && (
                    <div className="text-center py-8 text-slate-400 dark:text-slate-500 text-sm">
                      No columns found
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default ReportGenerator;