import React, { useCallback, useState } from 'react';
import { ExcelData } from '../types';
import { parseExcelFile } from '../utils/fileProcessors';
import { FileSpreadsheet, Upload, AlertCircle } from 'lucide-react';

interface DataUploaderProps {
  onDataLoaded: (data: ExcelData) => void;
}

const DataUploader: React.FC<DataUploaderProps> = ({ onDataLoaded }) => {
  const [isDragging, setIsDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const processFile = async (file: File) => {
    setError(null);
    try {
      const data = await parseExcelFile(file);
      onDataLoaded(data);
    } catch (err) {
      console.error(err);
      setError("Failed to parse the Excel file. Please ensure it's a valid .xlsx or .xls file.");
    }
  };

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) processFile(file);
  }, []);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) processFile(file);
  };

  return (
    <div className="max-w-3xl mx-auto">
      <div className="text-center mb-10">
        <h1 className="text-3xl font-bold text-slate-800 mb-4">Step 1: Upload Product Data</h1>
        <p className="text-slate-500 text-lg">
          Start by uploading your product ingredients or specification table (Excel). 
          We'll use this data to populate your reports.
        </p>
      </div>

      <div 
        className={`
          relative border-2 border-dashed rounded-2xl p-12 text-center transition-all duration-200
          ${isDragging ? 'border-blue-500 bg-blue-50 scale-[1.02]' : 'border-slate-300 bg-white hover:border-blue-400'}
        `}
        onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
      >
        <div className="w-20 h-20 bg-green-50 text-green-600 rounded-2xl flex items-center justify-center mx-auto mb-6">
          <FileSpreadsheet size={40} />
        </div>
        
        <h3 className="text-xl font-bold text-slate-800 mb-2">
          Drag & Drop Excel File
        </h3>
        <p className="text-slate-500 mb-8">
          Supports .xlsx and .xls files
        </p>

        <label className="inline-block">
          <input type="file" accept=".xlsx, .xls" className="hidden" onChange={handleChange} />
          <span className="cursor-pointer bg-blue-600 hover:bg-blue-700 text-white px-8 py-4 rounded-xl font-bold text-lg shadow-lg shadow-blue-600/20 transition-all flex items-center gap-3">
            <Upload size={24} />
            Browse Files
          </span>
        </label>

        {error && (
          <div className="mt-8 p-4 bg-red-50 text-red-600 rounded-lg flex items-center gap-2 justify-center">
            <AlertCircle size={20} />
            {error}
          </div>
        )}
      </div>

      <div className="mt-12 grid grid-cols-1 md:grid-cols-3 gap-6">
        {[
          { title: 'Auto-Analysis', desc: 'We identify headers and data structure automatically.' },
          { title: 'Batch Processing', desc: 'Generate reports for every row in your Excel file at once.' },
          { title: 'Smart Mapping', desc: 'We match your columns to template variables instantly.' }
        ].map((feat, i) => (
          <div key={i} className="bg-white p-6 rounded-xl border border-slate-200 text-center">
            <h4 className="font-bold text-slate-800 mb-2">{feat.title}</h4>
            <p className="text-sm text-slate-500">{feat.desc}</p>
          </div>
        ))}
      </div>
    </div>
  );
};

export default DataUploader;