import React, { useState, useMemo, useRef, useEffect } from 'react';
import { Template, ExcelData, DocumentMappingResult } from '../types';
import { ArrowLeft, Download, Search, Edit3, Eye, Save, Table as TableIcon, ChevronUp, ChevronDown, CheckSquare, Plus, Settings, RefreshCw, Link as LinkIcon, FileText, X, Check, Wand2, FileType, AlertTriangle, XCircle, CheckCircle } from 'lucide-react';
import { extractTextFromPdf, extractTextFromDocx, extractTextFromPlainText, extractTextFromSpreadsheet } from '../utils/fileProcessors';
import { suggestVariableMappingsFromDocument } from '../services/geminiService';

interface ReportWorkspaceProps {
  template: Template;
  data: ExcelData;
  onUpdateTemplate: (template: Template) => void;
  onBack: () => void;
}

interface TableConfig {
  mode: 'template-driven' | 'manual';
  // Template Driven Mode
  targetHeaders: string[]; // The headers defined in the PDF template
  columnMapping: Record<string, string>; // Map TargetHeader -> ExcelHeader
  replaceRange: { start: number; end: number } | null; // Lines in editor to replace
  
  // Manual Mode (Fallback)
  selectedColumns: string[];
  headerRenames: Record<string, string>;
}

const ReportWorkspace: React.FC<ReportWorkspaceProps> = ({ template, data, onUpdateTemplate, onBack }) => {
  // --- Editor State ---
  const [localContent, setLocalContent] = useState(template.content);
  const [mode, setMode] = useState<'edit' | 'preview'>('edit');
  const editorRef = useRef<HTMLTextAreaElement>(null);

  // --- Data Grid State ---
  const [gridData, setGridData] = useState<ExcelData>(data);
  const [showDataPanel, setShowDataPanel] = useState(true);
  const [dataSearch, setDataSearch] = useState('');
  const [selectedRowIndices, setSelectedRowIndices] = useState<Set<number>>(new Set());

  // --- Table Insertion Config ---
  const [showTableModal, setShowTableModal] = useState(false);
  const [tableConfig, setTableConfig] = useState<TableConfig>({
    mode: 'manual',
    targetHeaders: [],
    columnMapping: {},
    replaceRange: null,
    selectedColumns: [],
    headerRenames: {}
  });


    // --- Finalize / Export Config ---
  const [showExportModal, setShowExportModal] = useState(false);
  const [detectedVariables, setDetectedVariables] = useState<string[]>([]);
  const [variableValues, setVariableValues] = useState<Record<string, string>>({});
  const [isExportingPdf, setIsExportingPdf] = useState(false);
    const [isAutoMapping, setIsAutoMapping] = useState(false);
    const [autoMapError, setAutoMapError] = useState<string | null>(null);
    const [showAutoMapModal, setShowAutoMapModal] = useState(false);
    const [autoMapSuggestions, setAutoMapSuggestions] = useState<DocumentMappingResult | null>(null);
    const [autoMapSelections, setAutoMapSelections] = useState<Record<string, string>>({});
    const autoMapFileRef = useRef<HTMLInputElement>(null);
    const storageKey = `smartdoc_variable_values_${template.id}`;


    const getVariableStatus = (value?: string) => {
        const trimmed = (value || '').trim();
        if (!trimmed) return 'missing';
        if (trimmed.toLowerCase() === 'no data') return 'no-data';
        return 'filled';
    };

    const statusCounts = useMemo(() => {
        const counts = { filled: 0, noData: 0, missing: 0 };
        detectedVariables.forEach(variable => {
            const status = getVariableStatus(variableValues[variable]);
            if (status === 'filled') counts.filled += 1;
            else if (status === 'no-data') counts.noData += 1;
            else counts.missing += 1;
        });
        return counts;
    }, [detectedVariables, variableValues]);

    const groupedVariables = useMemo(() => {
        const sectionMap = new Map<string, string>();
        const sectionOrder: string[] = [];
        let currentSection = 'Uncategorized';
        sectionOrder.push(currentSection);

        const detectedSet = new Set(detectedVariables);
        const lines = localContent.split('\n');
        const headingPattern = /^#{2,4}\s+(.+)$/;
        const varPattern = /\{\{([^}]+)\}\}/g;

        for (const rawLine of lines) {
            const line = rawLine.trim();
            const headingMatch = line.match(headingPattern);
            if (headingMatch) {
                currentSection = headingMatch[1].trim();
                if (!sectionOrder.includes(currentSection)) {
                    sectionOrder.push(currentSection);
                }
                continue;
            }

            let match;
            while ((match = varPattern.exec(line)) !== null) {
                const variable = match[1];
                if (detectedSet.has(variable) && !sectionMap.has(variable)) {
                    sectionMap.set(variable, currentSection);
                }
            }
        }

        const groupMap = new Map<string, string[]>();
        detectedVariables.forEach(variable => {
            const section = sectionMap.get(variable) || 'Uncategorized';
            if (!groupMap.has(section)) {
                groupMap.set(section, []);
                if (!sectionOrder.includes(section)) sectionOrder.push(section);
            }
            groupMap.get(section)!.push(variable);
        });

        return sectionOrder
            .filter(section => groupMap.has(section))
            .map(section => ({ section, variables: groupMap.get(section)! }));
    }, [detectedVariables, localContent]);


    // --- Markdown Rendering ---
    const markdownStyles = `
        .markdown-body {
            box-sizing: border-box;
            min-width: 200px;
            max-width: 980px;
            margin: 0 auto;
            padding: 20mm;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif, "Apple Color Emoji", "Segoe UI Emoji";
            font-size: 14px;
            line-height: 1.7;
            color: #000;
            background-color: #fff;
            word-wrap: break-word;
        }
        .markdown-body h1 {
            padding-bottom: 0;
            font-size: 2em;
            border-bottom: none;
            margin-top: 24px;
            margin-bottom: 16px;
            font-weight: 600;
            line-height: 1.25;
            color: #000;
        }
        .markdown-body h2 {
            padding-bottom: 0;
            font-size: 1.5em;
            border-bottom: none;
            margin-top: 24px;
            margin-bottom: 16px;
            font-weight: 600;
            line-height: 1.25;
            color: #000;
        }
        .markdown-body h3 {
            font-size: 1.25em;
            margin-top: 24px;
            margin-bottom: 16px;
            font-weight: 600;
            line-height: 1.25;
            color: #000;
        }
        .markdown-body h4 {
            font-size: 1em;
            margin-top: 24px;
            margin-bottom: 16px;
            font-weight: 600;
            line-height: 1.25;
            color: #000;
        }
        .markdown-body p {
            margin-top: 0;
            margin-bottom: 16px;
            color: #000;
        }
        .markdown-body blockquote {
            padding: 0 1em;
            color: #6a737d;
            border-left: 0.25em solid #dfe2e5;
            margin: 0 0 16px 0;
        }
        .markdown-body ul, .markdown-body ol {
            padding-left: 2em;
            margin-top: 0;
            margin-bottom: 16px;
        }
        .markdown-body table {
            border-spacing: 0;
            border-collapse: collapse;
            display: table;
            width: 100%;
            max-width: 100%;
            margin-top: 0;
            margin-bottom: 16px;
        }
        .markdown-body table tr {
            background-color: #fff;
            border-top: 1px solid #000;
        }
        .markdown-body table tr:nth-child(2n) {
            background-color: #fff;
        }
        .markdown-body table th, 
        .markdown-body table td {
            padding: 6px 13px;
            border: 1px solid #dfe2e5;
        }
        .markdown-body table th {
            font-weight: 600;
            background-color: #fff;
            color: #000;
        }
        .markdown-body code {
            padding: 0.2em 0.4em;
            margin: 0;
            font-size: 85%;
            background-color: #fff;
            border-radius: 3px;
            font-family: SFMono-Regular, Consolas, "Liberation Mono", Menlo, monospace;
            color: #000;
        }
        .markdown-body pre {
            padding: 16px;
            overflow: auto;
            font-size: 85%;
            line-height: 1.45;
            background-color: #fff;
            border-radius: 3px;
            margin-bottom: 16px;
            color: #000;
        }
        .markdown-body pre code {
            background-color: transparent;
            padding: 0;
        }
        .markdown-body hr {
            height: 0.25em;
            padding: 0;
            margin: 24px 0;
            background-color: #000;
            border: 0;
        }
        .markdown-body img {
            max-width: 100%;
            box-sizing: content-box;
            background-color: #fff;
        }
        .markdown-body h1:nth-of-type(-n+3) {
            text-align: center;
            margin-top: 0;
        }
    `;

    const normalizeReportTitle = (content: string) => {
        const placeholderSingleLine = /^#\s*\{\{CompanyName\}\}[^\n]*Material\s+Safety\s+Data\s+Sheet\s*\(MSDS\)[^\n]*$/m;
        const placeholderTwoLine = /^#\s*\{\{CompanyName\}\}\s*\n\s*(?:\*\*|__)?\s*Material\s+Safety\s+Data\s+Sheet\s*\(MSDS\)\s*(?:\*\*|__)?\s*$/m;
        const genericSingleLine = /^#\s*(.+?)\s+Material\s+Safety\s+Data\s+Sheet\s*\(MSDS\)\s*$/m;
        const genericTwoLine = /^#\s*(.+?)\s*\n\s*(?:\*\*|__)?\s*Material\s+Safety\s+Data\s+Sheet\s*\(MSDS\)\s*(?:\*\*|__)?\s*$/m;

        const placeholderReplacement = (
            `# {{CompanyName}}\n` +
            `# Material Safety Data Sheet\n` +
            `# (MSDS)`
        );

        if (placeholderSingleLine.test(content)) {
            return content.replace(placeholderSingleLine, placeholderReplacement);
        }

        if (placeholderTwoLine.test(content)) {
            return content.replace(placeholderTwoLine, placeholderReplacement);
        }

        if (genericSingleLine.test(content)) {
            return content.replace(genericSingleLine, (_, company) => (
                `# ${company.trim()}\n` +
                `# Material Safety Data Sheet\n` +
                `# (MSDS)`
            ));
        }

        if (genericTwoLine.test(content)) {
            return content.replace(genericTwoLine, (_, company) => (
                `# ${company.trim()}\n` +
                `# Material Safety Data Sheet\n` +
                `# (MSDS)`
            ));
        }

        return content;
    };

    const normalizeSectionBullets = (content: string) => {
        const lines = content.split('\n');
        let inSection = false;
        let inCodeBlock = false;

        const normalized = lines.map(line => {
            const trimmed = line.trim();

            if (trimmed.startsWith('```')) {
                inCodeBlock = !inCodeBlock;
                return line;
            }

            if (!inCodeBlock && /^#{1,3}\s+Section\s+\d+/i.test(trimmed)) {
                inSection = true;
                return line;
            }

            if (!inCodeBlock && /^#{1,3}\s+Section\s+\d+/i.test(trimmed) === false && /^#{1,3}\s+/.test(trimmed)) {
                inSection = false;
                return line;
            }

            if (!inCodeBlock && inSection) {
                if (trimmed.startsWith('|') && trimmed.endsWith('|')) {
                    return line;
                }
                return line.replace(/^\s*[-*+]\s+/, '');
            }

            return line;
        });

        return normalized.join('\n');
    };

    const normalizeInlineFields = (content: string) => {
        // Insert line breaks before inline bold labels on the same line,
        // but do NOT touch lines inside Markdown tables.
        const lines = content.split('\n');
        const normalized = lines.map(line => {
            const trimmed = line.trim();
            if (trimmed.startsWith('|') && trimmed.endsWith('|')) {
                return line;
            }
            const isListLine = /^([-*+]|\d+\.)\s+/.test(trimmed);
            const isHeadingLine = /^#{1,6}\s+/.test(trimmed);
            const isQuoteLine = /^>\s+/.test(trimmed);
            if (isListLine || isHeadingLine || isQuoteLine) {
                return line;
            }
            return line.replace(/([^\n])\s+(?=\*\*[^*]+?:\*\*)/g, '$1  \n');
        });
        return normalized.join('\n');
    };

    const previewHtml = useMemo(() => {
        // @ts-ignore
        if (typeof window.marked === 'undefined') return null;
        // @ts-ignore
        window.marked.setOptions({ breaks: true, gfm: true });
        // @ts-ignore
        return window.marked.parse(normalizeInlineFields(normalizeSectionBullets(normalizeReportTitle(localContent))));
    }, [localContent]);

  // --- Helpers ---

  const toggleRowSelection = (index: number) => {
    const newSet = new Set(selectedRowIndices);
    if (newSet.has(index)) newSet.delete(index);
    else newSet.add(index);
    setSelectedRowIndices(newSet);
  };

  const toggleAllSelection = () => {
      if (selectedRowIndices.size === gridData.rows.length) {
          setSelectedRowIndices(new Set());
      } else {
          const all = new Set(gridData.rows.map((_, i) => i));
          setSelectedRowIndices(all);
      }
  };

  const handleCellEdit = (rowIndex: number, column: string, value: string) => {
      const newRows = [...gridData.rows];
      newRows[rowIndex] = { ...newRows[rowIndex], [column]: value };
      setGridData({ ...gridData, rows: newRows });
  };

  // --- Core Logic: Analyze Template & Auto-Map ---

  const findTableInContent = (content: string) => {
    const lines = content.split('\n');
    let headerLineIdx = -1;
    let tableEndIdx = -1;
    let headers: string[] = [];

    // Simple parser to find the first Markdown table structure
    // Looks for: | Header | Header | followed by | --- | --- |
    for (let i = 0; i < lines.length - 1; i++) {
      const line = lines[i].trim();
      if (line.startsWith('|') && line.endsWith('|')) {
         const nextLine = lines[i+1].trim();
         // Check for separator row
         if (nextLine.startsWith('|') && nextLine.includes('---') && nextLine.endsWith('|')) {
             headerLineIdx = i;
             // Extract clean headers
             headers = line.split('|').map(s => s.trim()).filter(s => s !== '');
             
             // Find end of this table block
             for (let j = i + 2; j < lines.length; j++) {
                 if (!lines[j].trim().startsWith('|')) {
                     tableEndIdx = j;
                     break;
                 }
             }
             if (tableEndIdx === -1) tableEndIdx = lines.length;
             break; // Found the first table, stop here.
         }
      }
    }

    if (headerLineIdx !== -1) {
        return { headers, startLine: headerLineIdx, endLine: tableEndIdx };
    }
    return null;
  };

  const smartMapColumns = (targetHeaders: string[], excelHeaders: string[]) => {
      const mapping: Record<string, string> = {};
      
      targetHeaders.forEach(target => {
          const tLow = target.toLowerCase();
          
          // 1. Exact Match
          let match = excelHeaders.find(eh => eh.toLowerCase() === tLow);

          // 2. Keyword / Partial Match
          if (!match) {
              if (tLow.includes('no.') || tLow.includes('序号')) match = excelHeaders.find(eh => eh.includes('序号') || eh.toLowerCase().includes('no.'));
              else if (tLow.includes('inci') || tLow.includes('name')) match = excelHeaders.find(eh => eh.toLowerCase().includes('inci') || eh.includes('名称') || eh.includes('name'));
              else if (tLow.includes('cas')) match = excelHeaders.find(eh => eh.toLowerCase().includes('cas'));
              else if (tLow.includes('weight') || tLow.includes('%') || tLow.includes('content') || tLow.includes('含量')) match = excelHeaders.find(eh => eh.includes('含量') || eh.includes('%') || eh.toLowerCase().includes('content'));
              else if (tLow.includes('function') || tLow.includes('作用')) match = excelHeaders.find(eh => eh.includes('作用') || eh.includes('功能'));
          }

          // 3. Fallback: Containment
          if (!match) {
             match = excelHeaders.find(eh => eh.toLowerCase().includes(tLow) || tLow.includes(eh.toLowerCase()));
          }

          if (match) mapping[target] = match;
          else mapping[target] = ''; // Unmapped
      });
      return mapping;
  };

  const initTableModal = () => {
      if (selectedRowIndices.size === 0) {
          alert("Please select at least one row from the Data Source panel below to insert.");
          return;
      }

      // 1. Detect existing table in template
      const existingTable = findTableInContent(localContent);

      if (existingTable) {
          // MODE: TEMPLATE DRIVEN
          const mapping = smartMapColumns(existingTable.headers, gridData.headers);
          
          setTableConfig({
              mode: 'template-driven',
              targetHeaders: existingTable.headers,
              columnMapping: mapping,
              replaceRange: { start: existingTable.startLine, end: existingTable.endLine },
              selectedColumns: [],
              headerRenames: {}
          });
      } else {
          // MODE: MANUAL (Fallback if no table found in template)
          const initialRenames: Record<string, string> = {};
          gridData.headers.forEach(h => initialRenames[h] = h);
          setTableConfig({
              mode: 'manual',
              targetHeaders: [],
              columnMapping: {},
              replaceRange: null,
              selectedColumns: gridData.headers,
              headerRenames: initialRenames
          });
      }

      setShowTableModal(true);
  };

  const handleInsertTable = () => {
    let markdownTable = '';
    
    // Sort rows by index
    const sortedIndices = Array.from(selectedRowIndices).sort((a, b) => a - b);
    const { replaceRange, mode, targetHeaders, columnMapping, selectedColumns, headerRenames } = tableConfig;

    if (mode === 'template-driven') {
        // Construct table based on TEMPLATE headers
        const headerRow = `| ${targetHeaders.join(' | ')} |`;
        const separatorRow = `| ${targetHeaders.map(() => '---').join(' | ')} |`;
        
        const dataRows = sortedIndices.map(idx => {
            const rowData = gridData.rows[idx];
            return `| ${targetHeaders.map(targetH => {
                const sourceCol = columnMapping[targetH];
                return sourceCol ? (rowData[sourceCol] || '') : '';
            }).join(' | ')} |`;
        });

        markdownTable = `${headerRow}\n${separatorRow}\n${dataRows.join('\n')}`;

    } else {
        // Manual Construction
        const cols = selectedColumns;
        const headerRow = `| ${cols.map(c => headerRenames[c] || c).join(' | ')} |`;
        const separatorRow = `| ${cols.map(() => '---').join(' | ')} |`;
        const dataRows = sortedIndices.map(idx => {
            const rowData = gridData.rows[idx];
            return `| ${cols.map(c => rowData[c] || '').join(' | ')} |`;
        });
        markdownTable = `${headerRow}\n${separatorRow}\n${dataRows.join('\n')}`;
    }

    // Insert or Replace in Editor
    if (replaceRange && mode === 'template-driven') {
        const { start, end } = replaceRange;
        const lines = localContent.split('\n');
        // Remove old table lines and insert new table
        lines.splice(start, end - start, markdownTable);
        setLocalContent(lines.join('\n'));
    } else {
        // Standard Insert at cursor
        if (editorRef.current) {
            const start = editorRef.current.selectionStart;
            const end = editorRef.current.selectionEnd;
            const text = localContent;
            // Add newlines if needed
            const prefix = start > 0 && text[start-1] !== '\n' ? '\n' : '';
            const suffix = '\n';
            const newText = text.substring(0, start) + prefix + markdownTable + suffix + text.substring(end);
            setLocalContent(newText);
        } else {
            setLocalContent(prev => prev + '\n' + markdownTable);
        }
    }

    setShowTableModal(false);
  };

  // --- Finalize & Export Logic ---

  const initExportModal = () => {
      // Scan content for {{variables}}
      const regex = /\{\{([^}]+)\}\}/g;
      const matches = new Set<string>();
      let match;
      while ((match = regex.exec(localContent)) !== null) {
          matches.add(match[1]);
      }
      
      const allVars = Array.from(matches);
      
      // EXCLUDE AUTOMATIC VARIABLES from user input list
      // TotalPages and CurrentPage will be handled automatically
      const autoVars = ['TotalPages', 'CurrentPage'];
      const userVars = allVars.filter(v => !autoVars.includes(v));
      
      setDetectedVariables(userVars);
      
            // Initialize values with empty strings, but restore from storage if available
            const initialValues: Record<string, string> = {};
            userVars.forEach(v => initialValues[v] = '');
            try {
                const saved = localStorage.getItem(storageKey);
                if (saved) {
                    const parsed = JSON.parse(saved) as Record<string, string>;
                    userVars.forEach(v => {
                        if (parsed[v]) initialValues[v] = parsed[v];
                    });
                }
            } catch (e) {
                console.warn('Failed to restore variable values', e);
            }

            // Auto-fill from Excel key-value pairs if available
            const normalizeKey = (value: string) =>
                value.toLowerCase().replace(/[\s_\-:：()（）]/g, '');

            const excelKeyValues = data.keyValues || {};
            const keyLookup = new Map<string, string>();
            Object.entries(excelKeyValues).forEach(([k, v]) => {
                const normalized = normalizeKey(k);
                if (!keyLookup.has(normalized)) {
                    keyLookup.set(normalized, v);
                }
            });

            const variableAliases: Record<string, string[]> = {
                ProductName: ['产品名称', '产品名', '商品名称', '品名', 'Product Name', 'ProductName'],
                CompanyName: ['公司名称', '企业名称', '生产商', '制造商', '供应商', 'Company Name', 'CompanyName'],
                ClientName: ['客户名称', '客户', '委托单位', 'Client Name', 'ClientName'],
                ReportDate: ['报告日期', '日期', 'Report Date', 'ReportDate']
            };

            userVars.forEach(variable => {
                if (initialValues[variable]) return;
                const direct = keyLookup.get(normalizeKey(variable));
                if (direct) {
                    initialValues[variable] = direct;
                    return;
                }
                const aliases = variableAliases[variable] || [];
                for (const alias of aliases) {
                    const candidate = keyLookup.get(normalizeKey(alias));
                    if (candidate) {
                        initialValues[variable] = candidate;
                        break;
                    }
                }
            });

            // Auto-fill from template default values (Section 2+ only)
            const defaultValues = template.defaultValues || {};
            if (Object.keys(defaultValues).length > 0) {
                const sectionMap = new Map<string, string>();
                let currentSection = 'Uncategorized';
                const headingPattern = /^#{2,4}\s+(.+)$/;
                const varPattern = /\{\{([^}]+)\}\}/g;
                const lines = localContent.split('\n');

                for (const rawLine of lines) {
                    const line = rawLine.trim();
                    const headingMatch = line.match(headingPattern);
                    if (headingMatch) {
                        currentSection = headingMatch[1].trim();
                        continue;
                    }
                    let match;
                    while ((match = varPattern.exec(line)) !== null) {
                        const variable = match[1];
                        if (!sectionMap.has(variable)) {
                            sectionMap.set(variable, currentSection);
                        }
                    }
                }

                const getSectionNumber = (sectionName?: string) => {
                    if (!sectionName) return null;
                    const match = sectionName.match(/Section\s+(\d+)/i);
                    if (!match) return null;
                    const num = Number.parseInt(match[1], 10);
                    return Number.isNaN(num) ? null : num;
                };

                userVars.forEach(variable => {
                    if (initialValues[variable]) return;
                    const sectionName = sectionMap.get(variable);
                    const sectionNumber = getSectionNumber(sectionName);
                    if (sectionNumber === null || sectionNumber < 2) return;
                    const fallbackValue = defaultValues[variable];
                    if (fallbackValue && fallbackValue.trim() !== '') {
                        initialValues[variable] = fallbackValue;
                    }
                });
            }

            setVariableValues(initialValues);
      setAutoMapError(null);
      
      setShowExportModal(true);
  };

    useEffect(() => {
        if (!showExportModal) return;
        try {
            localStorage.setItem(storageKey, JSON.stringify(variableValues));
        } catch (e) {
            console.warn('Failed to persist variable values', e);
        }
    }, [variableValues, showExportModal, storageKey]);

  const fillNoData = () => {
      const newValues = { ...variableValues };
      detectedVariables.forEach(v => {
          if (!newValues[v] || newValues[v].trim() === '') {
              newValues[v] = 'No data';
          }
      });
      setVariableValues(newValues);
  };

    const clearAllValues = () => {
        const cleared: Record<string, string> = {};
        detectedVariables.forEach(v => { cleared[v] = ''; });
        setVariableValues(cleared);
        try {
            localStorage.removeItem(storageKey);
        } catch (e) {
            console.warn('Failed to clear stored variable values', e);
        }
    };

    const extractTextFromAnyDocument = async (file: File): Promise<string> => {
        const ext = file.name.split('.').pop()?.toLowerCase();
        if (ext === 'pdf') return await extractTextFromPdf(file);
        if (ext === 'docx') return await extractTextFromDocx(file);
        if (ext === 'txt') return await extractTextFromPlainText(file);
        if (ext === 'xlsx' || ext === 'xls' || ext === 'csv') return await extractTextFromSpreadsheet(file);
        throw new Error('Unsupported file type.');
    };

    const handleAutoMapFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        if (detectedVariables.length === 0) {
            setAutoMapError('No variables to map.');
            return;
        }

        setIsAutoMapping(true);
        setAutoMapError(null);
        try {
            const text = await extractTextFromAnyDocument(file);
            const result = await suggestVariableMappingsFromDocument({
                documentText: text,
                templateContent: localContent,
                variables: detectedVariables
            });

            const initialSelections: Record<string, string> = {};
            result.mappings.forEach(m => {
                initialSelections[m.variable] = m.candidates?.[0]?.value || '';
            });

            setAutoMapSelections(initialSelections);
            setAutoMapSuggestions(result);
            setShowAutoMapModal(true);
        } catch (err: any) {
            setAutoMapError(err.message || 'Failed to analyze document.');
        } finally {
            setIsAutoMapping(false);
            if (autoMapFileRef.current) {
                autoMapFileRef.current.value = '';
            }
        }
    };

    const applyAutoMapSelections = () => {
        if (!autoMapSuggestions) return;
        setVariableValues(prev => {
            const next = { ...prev };
            autoMapSuggestions.mappings.forEach(m => {
                const selected = autoMapSelections[m.variable];
                if (selected) {
                    next[m.variable] = selected;
                }
            });
            return next;
        });
        setShowAutoMapModal(false);
    };

  // Prepare content with all variables (user input + auto-calculated)
  const getProcessedContent = () => {
    let content = normalizeInlineFields(normalizeSectionBullets(normalizeReportTitle(localContent)));
      
      // 1. Replace User Variables
      detectedVariables.forEach(v => {
          const val = variableValues[v] || 'No data';
          content = content.split(`{{${v}}}`).join(val);
      });

      // 2. Auto Calculate Page Variables
      // Heuristic: Approx 3000 chars per A4 page for standard text size
      const totalChars = content.length;
      const estimatedPages = Math.max(1, Math.ceil(totalChars / 3000)).toString();

      content = content.split('{{TotalPages}}').join(estimatedPages);
      content = content.split('{{CurrentPage}}').join('1');

      return content;
  };

  const handleDownloadMarkdown = () => {
      const finalContent = getProcessedContent();

      // Create blob and download
      const blob = new Blob([finalContent], { type: 'text/markdown' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${template.name.replace(/\s+/g, '_')}_Report.md`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      
      setShowExportModal(false);
  };

    const handleExportPDF = async () => {
      setIsExportingPdf(true);
      const finalContent = getProcessedContent();

            // Check if marked is available
            // @ts-ignore
            if (typeof window.marked === 'undefined') {
                alert('Markdown parser not loaded. Please refresh the page.');
                setIsExportingPdf(false);
                return;
            }

            // Parse Markdown to HTML
            // @ts-ignore
            window.marked.setOptions({ breaks: true, gfm: true });
            // @ts-ignore
            const htmlContent = window.marked.parse(finalContent);

            // Use a hidden iframe to avoid popup issues and blank windows
            const iframe = document.createElement('iframe');
            iframe.style.position = 'fixed';
            iframe.style.right = '0';
            iframe.style.bottom = '0';
            iframe.style.width = '0';
            iframe.style.height = '0';
            iframe.style.border = '0';
            iframe.setAttribute('aria-hidden', 'true');
            document.body.appendChild(iframe);

            const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;
            if (!iframeDoc || !iframe.contentWindow) {
                alert('Failed to initialize print frame.');
                document.body.removeChild(iframe);
                setIsExportingPdf(false);
                return;
            }

            iframeDoc.open();
            iframeDoc.write(`
                <!doctype html>
                <html>
                    <head>
                        <meta charset="utf-8" />
                        <title>${template.name.replace(/\s+/g, '_')}_Report</title>
                        <style>
                            @page { size: A4; margin: 0; }
                            html, body { margin: 0; padding: 0; background: #ffffff; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
                            ${markdownStyles}
                            @media print { body { background: #ffffff; } }
                        </style>
                    </head>
                    <body>
                        <div class="markdown-body">${htmlContent}</div>
                    </body>
                </html>
            `);
            iframeDoc.close();

            const cleanup = () => {
                if (document.body.contains(iframe)) {
                    document.body.removeChild(iframe);
                }
                setIsExportingPdf(false);
                setShowExportModal(false);
            };

            const printFrame = () => {
                try {
                    iframe.contentWindow?.focus();
                    iframe.contentWindow?.print();
                } catch (e) {
                    console.error('Print failed', e);
                    alert('Failed to open print dialog.');
                    cleanup();
                }
            };

            // Ensure resources are ready before printing
            iframe.onload = () => printFrame();
            // Fallback in case onload doesn't fire
            setTimeout(() => printFrame(), 300);

            // Cleanup after printing
            iframe.contentWindow.onafterprint = () => cleanup();
  };

  const handleSaveTemplate = () => {
    onUpdateTemplate({ ...template, content: localContent });
    alert("Template updated successfully.");
  };

  const filteredRows = gridData.rows.map((r, i) => ({...r, _originalIndex: i})).filter(row => {
     if (!dataSearch) return true;
     return Object.values(row).some(val => String(val).toLowerCase().includes(dataSearch.toLowerCase()));
  });

  return (
    <div className="flex flex-col h-[calc(100vh-100px)] gap-4">
      
      {/* 1. Toolbar */}
      <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-3 flex items-center justify-between shadow-sm shrink-0">
        <div className="flex items-center gap-4">
          <button onClick={onBack} className="text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200 transition-colors">
            <ArrowLeft size={20} />
          </button>
          <div>
            <h2 className="text-lg font-bold text-slate-800 dark:text-white">Report Editor</h2>
            <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
               <span className="bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 px-1.5 py-0.5 rounded font-mono">{template.name}</span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
             <button 
                onClick={handleSaveTemplate}
                className="text-slate-600 dark:text-slate-300 hover:text-blue-600 dark:hover:text-blue-400 flex items-center gap-2 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm font-medium transition-all"
             >
                <Save size={16} /> Save Template
             </button>
             <button 
                onClick={initExportModal}
                className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-bold flex items-center gap-2 hover:bg-blue-700 shadow-sm transition-all"
             >
                <Download size={16} /> Finalize & Export
            </button>
        </div>
      </div>

      {/* 2. Editor */}
      <div className="flex-1 min-h-0 flex gap-4">
          <div className="flex-1 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 flex flex-col shadow-sm overflow-hidden relative">
             <div className="p-2 border-b border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 flex items-center justify-between">
                 <div className="flex gap-1 bg-slate-200 dark:bg-slate-800 p-1 rounded-lg">
                    <button onClick={() => setMode('edit')} className={`px-3 py-1 text-xs font-medium rounded-md flex items-center gap-2 ${mode === 'edit' ? 'bg-white dark:bg-slate-700 shadow text-slate-800 dark:text-white' : 'text-slate-500 dark:text-slate-400'}`}>
                        <Edit3 size={14} /> Editor
                    </button>
                    <button onClick={() => setMode('preview')} className={`px-3 py-1 text-xs font-medium rounded-md flex items-center gap-2 ${mode === 'preview' ? 'bg-white dark:bg-slate-700 shadow text-slate-800 dark:text-white' : 'text-slate-500 dark:text-slate-400'}`}>
                        <Eye size={14} /> Preview
                    </button>
                 </div>

                 {mode === 'edit' && (
                     <button 
                        onClick={initTableModal}
                        className="flex items-center gap-2 px-3 py-1.5 bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 hover:bg-indigo-100 dark:hover:bg-indigo-900/50 border border-indigo-200 dark:border-indigo-800 rounded-md text-xs font-bold transition-all"
                     >
                        <TableIcon size={14} /> 
                        Insert Rows ({selectedRowIndices.size})
                     </button>
                 )}
             </div>

             <div className={`flex-1 ${mode === 'edit' ? 'overflow-hidden' : 'overflow-auto'} relative bg-white dark:bg-slate-900`}>
                 {mode === 'edit' ? (
                     <textarea
                        ref={editorRef}
                        value={localContent}
                        onChange={(e) => setLocalContent(e.target.value)}
                        className="w-full h-full p-8 font-mono text-sm leading-relaxed text-slate-800 dark:text-slate-200 bg-white dark:bg-slate-900 outline-none resize-none placeholder:text-slate-300 dark:placeholder:text-slate-600"
                        placeholder="Start typing your report..."
                     />
                                 ) : (
                                         <div className="p-0 w-full max-w-none bg-white">
                                                 <style>{markdownStyles}</style>
                                                 {previewHtml ? (
                                                     <div className="markdown-body" dangerouslySetInnerHTML={{ __html: previewHtml }} />
                                                 ) : (
                                                     <div className="p-8 whitespace-pre-wrap font-sans text-slate-800 dark:text-slate-200 leading-relaxed">
                                                         {localContent}
                                                     </div>
                                                 )}
                                         </div>
                                 )}
             </div>
          </div>
      </div>

      {/* 3. Data Panel */}
      <div className={`bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-[0_-4px_10px_-2px_rgba(0,0,0,0.1)] flex flex-col transition-all duration-300 ${showDataPanel ? 'h-72' : 'h-10'}`}>
          <div 
             className="px-4 py-2 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between bg-slate-50 dark:bg-slate-900 cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800/50"
             onClick={() => setShowDataPanel(!showDataPanel)}
          >
             <div className="flex items-center gap-2 font-bold text-slate-700 dark:text-slate-300 text-sm">
                 <TableIcon size={16} /> 
                 Data Source ({gridData.rows.length} Records) <span className="text-slate-400 font-normal ml-2">Select rows to insert into the report table</span>
             </div>
             <div className="flex items-center gap-4" onClick={(e) => e.stopPropagation()}>
                 {showDataPanel && (
                     <div className="relative">
                         <Search size={14} className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-400"/>
                         <input 
                            type="text" 
                            placeholder="Filter data..." 
                            value={dataSearch}
                            onChange={(e) => setDataSearch(e.target.value)}
                            className="pl-7 pr-3 py-1 text-xs border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200 placeholder:text-slate-400 rounded-md focus:ring-1 focus:ring-blue-500 outline-none"
                         />
                     </div>
                 )}
                 <button className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200">
                     {showDataPanel ? <ChevronDown size={18} /> : <ChevronUp size={18} />}
                 </button>
             </div>
          </div>

          {showDataPanel && (
              <div className="flex-1 overflow-auto bg-white dark:bg-slate-900">
                  <table className="w-full text-sm text-left border-collapse relative">
                      <thead className="bg-slate-50 dark:bg-slate-900 sticky top-0 z-10 shadow-sm text-slate-600 dark:text-slate-400">
                          <tr>
                              <th className="px-3 py-2 border-b border-slate-200 dark:border-slate-700 w-10 text-center bg-slate-50 dark:bg-slate-900">
                                  <input 
                                    type="checkbox" 
                                    className="rounded border-slate-300 cursor-pointer"
                                    checked={gridData.rows.length > 0 && selectedRowIndices.size === gridData.rows.length}
                                    onChange={toggleAllSelection}
                                  />
                              </th>
                              <th className="px-3 py-2 border-b border-slate-200 dark:border-slate-700 text-xs font-semibold w-12 text-center bg-slate-50 dark:bg-slate-900">#</th>
                              {gridData.headers.map(h => (
                                  <th key={h} className="px-3 py-2 border-b border-slate-200 dark:border-slate-700 text-xs font-semibold whitespace-nowrap bg-slate-50 dark:bg-slate-900">
                                      {h}
                                  </th>
                              ))}
                          </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                          {filteredRows.map((row) => {
                              const isSelected = selectedRowIndices.has(row._originalIndex);
                              return (
                                  <tr key={row._originalIndex} className={`transition-colors ${isSelected ? 'bg-blue-50 dark:bg-blue-900/20' : 'hover:bg-slate-50 dark:hover:bg-slate-800'}`}>
                                      <td className="px-3 py-2 text-center border-r border-slate-100 dark:border-slate-800">
                                          <input 
                                            type="checkbox" 
                                            className="rounded border-slate-300 cursor-pointer"
                                            checked={isSelected}
                                            onChange={() => toggleRowSelection(row._originalIndex)}
                                          />
                                      </td>
                                      <td className="px-3 py-2 text-center text-xs text-slate-400 border-r border-slate-100 dark:border-slate-800">
                                          {row._originalIndex + 1}
                                      </td>
                                      {gridData.headers.map(h => (
                                          <td key={h} className="px-1 py-1 border-r border-slate-100 dark:border-slate-800 min-w-[100px]">
                                              <input 
                                                type="text" 
                                                value={row[h] || ''}
                                                onChange={(e) => handleCellEdit(row._originalIndex, h, e.target.value)}
                                                className={`w-full px-2 py-1 rounded text-sm bg-transparent outline-none focus:bg-white dark:focus:bg-slate-800 focus:ring-1 focus:ring-blue-500 ${isSelected ? 'text-blue-900 dark:text-blue-300 font-medium' : 'text-slate-600 dark:text-slate-300'}`}
                                              />
                                          </td>
                                      ))}
                                  </tr>
                              );
                          })}
                      </tbody>
                  </table>
              </div>
          )}
      </div>

      {/* 4. Table Mapping Modal */}
      {showTableModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4">
              <div className="bg-white dark:bg-slate-800 rounded-xl shadow-2xl w-full max-w-3xl border border-slate-200 dark:border-slate-700 flex flex-col max-h-[90vh]">
                  <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-700 flex justify-between items-center bg-slate-50 dark:bg-slate-800 rounded-t-xl">
                      <div>
                          <h3 className="text-lg font-bold text-slate-800 dark:text-white flex items-center gap-2">
                             <RefreshCw size={18} className="text-blue-600 dark:text-blue-400"/>
                             {tableConfig.mode === 'template-driven' ? 'Map Excel Data to Template Table' : 'Construct New Table'}
                          </h3>
                          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
                              {tableConfig.mode === 'template-driven' 
                                ? 'We detected a table in your report. Match your Excel columns to the template headers below.' 
                                : 'Select columns to include in your new table.'}
                          </p>
                      </div>
                      <button onClick={() => setShowTableModal(false)} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"><Settings size={20}/></button>
                  </div>
                  
                  <div className="flex-1 overflow-auto p-6 bg-slate-50/50 dark:bg-slate-900/50">
                      {tableConfig.mode === 'template-driven' ? (
                        /* Template Driven UI */
                        <div className="space-y-4">
                            <div className="grid grid-cols-2 gap-4 text-xs font-bold text-slate-400 uppercase tracking-wider mb-2 px-2">
                                <div>Template Column (Fixed)</div>
                                <div>Excel Source Column (Select)</div>
                            </div>
                            
                            {tableConfig.targetHeaders.map((targetH, idx) => (
                                <div key={idx} className="grid grid-cols-2 gap-4 items-center bg-white dark:bg-slate-700 p-3 rounded-lg border border-slate-200 dark:border-slate-600 shadow-sm">
                                    <div className="flex items-center gap-2 font-mono text-sm font-semibold text-slate-700 dark:text-slate-200">
                                        <div className="w-6 h-6 rounded-full bg-slate-100 dark:bg-slate-600 flex items-center justify-center text-xs text-slate-500 dark:text-slate-300">{idx+1}</div>
                                        {targetH}
                                    </div>
                                    <div className="relative">
                                        <select
                                            value={tableConfig.columnMapping[targetH] || ''}
                                            onChange={(e) => setTableConfig({
                                                ...tableConfig,
                                                columnMapping: { ...tableConfig.columnMapping, [targetH]: e.target.value }
                                            })}
                                            className="w-full pl-8 pr-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none appearance-none bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200"
                                        >
                                            <option value="">-- Leave Empty --</option>
                                            {gridData.headers.map(h => (
                                                <option key={h} value={h}>{h}</option>
                                            ))}
                                        </select>
                                        <LinkIcon size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none"/>
                                        <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none"/>
                                    </div>
                                </div>
                            ))}
                        </div>
                      ) : (
                         /* Manual UI (Fallback) */
                         <div className="space-y-4">
                            <p className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">Select Columns</p>
                            {gridData.headers.map(header => (
                              <div key={header} className="grid grid-cols-12 gap-4 items-center bg-white dark:bg-slate-700 p-3 rounded-lg border border-slate-200 dark:border-slate-600">
                                  <div className="col-span-1 flex justify-center">
                                      <input 
                                        type="checkbox"
                                        checked={tableConfig.selectedColumns.includes(header)}
                                        onChange={(e) => {
                                            const selected = e.target.checked 
                                                ? [...tableConfig.selectedColumns, header]
                                                : tableConfig.selectedColumns.filter(c => c !== header);
                                            setTableConfig({...tableConfig, selectedColumns: selected});
                                        }}
                                        className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500"
                                      />
                                  </div>
                                  <div className="col-span-5 text-sm text-slate-600 dark:text-slate-300 font-mono truncate" title={header}>{header}</div>
                                  <div className="col-span-6">
                                      <input 
                                        type="text" 
                                        value={tableConfig.headerRenames[header]}
                                        onChange={(e) => setTableConfig({...tableConfig, headerRenames: { ...tableConfig.headerRenames, [header]: e.target.value }})}
                                        disabled={!tableConfig.selectedColumns.includes(header)}
                                        className="w-full px-3 py-1.5 border border-slate-300 dark:border-slate-600 rounded text-sm outline-none disabled:bg-slate-100 dark:disabled:bg-slate-800/50 bg-white dark:bg-slate-800 text-slate-800 dark:text-white placeholder-slate-400"
                                        placeholder="Rename Header..."
                                      />
                                  </div>
                              </div>
                            ))}
                         </div>
                      )}
                  </div>

                  <div className="px-6 py-4 border-t border-slate-100 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 rounded-b-xl flex justify-between items-center">
                      <div className="text-xs text-slate-500 dark:text-slate-400">
                          {tableConfig.mode === 'template-driven' && tableConfig.replaceRange 
                             ? '⚠️ This will replace the existing table in your template.' 
                             : 'This will insert a new markdown table at your cursor.'}
                      </div>
                      <div className="flex gap-3">
                        <button onClick={() => setShowTableModal(false)} className="px-4 py-2 text-slate-600 dark:text-slate-400 font-medium hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg transition-colors">Cancel</button>
                        <button 
                            onClick={handleInsertTable}
                            className="px-6 py-2 bg-blue-600 text-white font-bold rounded-lg hover:bg-blue-700 shadow-lg shadow-blue-500/20 transition-all flex items-center gap-2"
                        >
                            <Plus size={18} />
                            {tableConfig.mode === 'template-driven' ? 'Populate Template Table' : 'Insert Custom Table'}
                        </button>
                      </div>
                  </div>
              </div>
          </div>
      )}

      {/* 5. Final Export & Variable Fill Modal */}
      {showExportModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
              <div className="bg-white dark:bg-slate-800 rounded-xl shadow-2xl w-full max-w-4xl border border-slate-200 dark:border-slate-700 flex flex-col h-[90vh]">
                                    <style>{`
                                        @keyframes pulseSoft {
                                            0% { box-shadow: 0 0 0 0 rgba(248, 113, 113, 0); }
                                            50% { box-shadow: 0 0 0 6px rgba(248, 113, 113, 0.25); }
                                            100% { box-shadow: 0 0 0 0 rgba(248, 113, 113, 0); }
                                        }
                                        .pulse-slow { animation: pulseSoft 2.8s ease-in-out infinite; }
                                    `}</style>
                  <div className="px-8 py-5 border-b border-slate-100 dark:border-slate-700 flex justify-between items-center bg-slate-50 dark:bg-slate-800 rounded-t-xl">
                      <div>
                          <h3 className="text-xl font-bold text-slate-800 dark:text-white flex items-center gap-2">
                             <FileText size={20} className="text-blue-600 dark:text-blue-400"/>
                             Finalize Report Variables
                          </h3>
                          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
                              We found {detectedVariables.length} remaining placeholders. Fill them in below before generating the report.
                          </p>
                      </div>
                      <div className="flex items-center gap-4">
                          <div className="flex items-center gap-3 text-xs font-semibold text-slate-600 dark:text-slate-300">
                              <span className="flex items-center gap-1">
                                  <CheckCircle size={14} className="text-emerald-500" /> {statusCounts.filled}
                              </span>
                              <span className="flex items-center gap-1">
                                  <AlertTriangle size={14} className="text-yellow-500" /> {statusCounts.noData}
                              </span>
                              <span className="flex items-center gap-1">
                                  <XCircle size={14} className="text-rose-500" /> {statusCounts.missing}
                              </span>
                          </div>
                          <button onClick={() => setShowExportModal(false)} className="p-2 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-full text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors">
                              <X size={24}/>
                          </button>
                      </div>
                  </div>
                  
                  <div className="flex-1 overflow-auto p-8 bg-slate-50/30 dark:bg-slate-900/30">
                                            {autoMapError && (
                                                <div className="mb-4 text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 p-3 rounded-lg">
                                                    {autoMapError}
                                                </div>
                                            )}
                      {detectedVariables.length === 0 ? (
                          <div className="flex flex-col items-center justify-center h-full text-center text-slate-400">
                              <CheckCircleIcon />
                              <h4 className="text-lg font-medium text-slate-700 dark:text-slate-200 mt-4">All Set!</h4>
                              <p>No extra variables found in the document.</p>
                          </div>
                      ) : (
                          <div className="space-y-8">
                              {groupedVariables.map(group => (
                                  <div key={group.section}>
                                      <div className="mb-3 flex items-center gap-2">
                                          <div className="h-5 w-1.5 rounded-full bg-slate-300 dark:bg-slate-600" />
                                          <h4 className="text-sm font-bold text-slate-700 dark:text-slate-200">
                                              {group.section}
                                          </h4>
                                      </div>
                                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                          {group.variables.map((variable) => {
                                  const status = getVariableStatus(variableValues[variable]);
                                  const statusClass = status === 'filled'
                                      ? 'bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-800'
                                      : status === 'no-data'
                                          ? 'bg-yellow-50 dark:bg-yellow-900/20 border-yellow-200 dark:border-yellow-800'
                                          : 'bg-rose-50 dark:bg-rose-900/20 border-rose-200 dark:border-rose-800 pulse-slow';

                                  return (
                                  <div key={variable} className={`p-4 rounded-lg border shadow-sm focus-within:ring-2 focus-within:ring-blue-500 transition-all ${statusClass}`}>
                                      <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2">
                                          {variable}
                                      </label>
                                      <input 
                                          type="text"
                                          placeholder={`Enter value for ${variable}`}
                                          value={variableValues[variable] || ''}
                                          onChange={(e) => setVariableValues({ ...variableValues, [variable]: e.target.value })}
                                          className="w-full text-sm text-slate-800 dark:text-white font-medium placeholder:text-slate-300 dark:placeholder:text-slate-600 outline-none border-b border-transparent focus:border-blue-500 transition-colors bg-transparent"
                                      />
                                      {status === 'missing' && (
                                          <div className="mt-2 text-[10px] text-rose-500 flex items-center gap-1 font-medium">
                                              <span className="w-1.5 h-1.5 rounded-full bg-rose-500 inline-block"></span>
                                              Missing value
                                          </div>
                                      )}
                                      {status === 'no-data' && (
                                          <div className="mt-2 text-[10px] text-yellow-600 dark:text-yellow-400 flex items-center gap-1 font-medium">
                                              <span className="w-1.5 h-1.5 rounded-full bg-yellow-500 inline-block"></span>
                                              Marked as "No data"
                                          </div>
                                      )}
                                      {status === 'filled' && (
                                          <div className="mt-2 text-[10px] text-emerald-600 dark:text-emerald-400 flex items-center gap-1 font-medium">
                                              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 inline-block"></span>
                                              Filled
                                          </div>
                                      )}
                                  </div>
                              );
                                          })}
                                      </div>
                                  </div>
                              ))}
                          </div>
                      )}
                  </div>

                  <div className="px-8 py-5 border-t border-slate-100 dark:border-slate-700 bg-white dark:bg-slate-800 rounded-b-xl flex justify-between items-center shadow-[0_-4px_10px_-4px_rgba(0,0,0,0.05)]">
                                            <div className="flex items-center gap-3">
                                                <button 
                                                    onClick={fillNoData}
                                                    className="flex items-center gap-2 text-indigo-600 dark:text-indigo-400 hover:text-indigo-800 dark:hover:text-indigo-300 text-sm font-semibold px-4 py-2 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 rounded-lg transition-colors"
                                                >
                                                        <Wand2 size={16} />
                                                        Fill empty fields with "No data"
                                                </button>

                                                <input
                                                    ref={autoMapFileRef}
                                                    type="file"
                                                    accept=".txt,.pdf,.docx,.xlsx,.xls,.csv"
                                                    className="hidden"
                                                    onChange={handleAutoMapFileUpload}
                                                />
                                                <button
                                                    onClick={() => autoMapFileRef.current?.click()}
                                                    className="flex items-center gap-2 text-white text-sm font-semibold px-4 py-2 rounded-lg transition-all bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 shadow-lg shadow-blue-500/30 hover:shadow-blue-500/50"
                                                    disabled={isAutoMapping}
                                                >
                                                    <Wand2 size={16} />
                                                    {isAutoMapping ? 'Analyzing document...' : 'Auto match from document'}
                                                </button>
                                            </div>

                      <div className="flex gap-4">
                        <button 
                            onClick={() => setShowExportModal(false)} 
                            className="px-5 py-2.5 text-slate-600 dark:text-slate-300 font-medium hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors"
                        >
                            Cancel
                        </button>

                        <button 
                            onClick={clearAllValues}
                            className="px-5 py-2.5 text-slate-600 dark:text-slate-300 font-medium hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors"
                        >
                            Clear All
                        </button>
                        
                        <button 
                            onClick={handleExportPDF}
                            disabled={isExportingPdf}
                            className="px-6 py-2.5 bg-rose-600 text-white font-bold rounded-lg hover:bg-rose-700 shadow-lg shadow-rose-500/20 transition-all flex items-center gap-2 transform hover:-translate-y-0.5 disabled:opacity-50 disabled:cursor-wait"
                        >
                            <FileType size={20} />
                            {isExportingPdf ? 'Exporting...' : 'Export PDF'}
                        </button>

                        <button 
                            onClick={handleDownloadMarkdown}
                            className="px-6 py-2.5 bg-green-600 text-white font-bold rounded-lg hover:bg-green-700 shadow-lg shadow-green-500/20 transition-all flex items-center gap-2 transform hover:-translate-y-0.5"
                        >
                            <Download size={20} />
                            Save Markdown
                        </button>
                      </div>
                  </div>
              </div>
          </div>
      )}

            {showAutoMapModal && autoMapSuggestions && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
                    <div className="bg-white dark:bg-slate-800 rounded-xl shadow-2xl w-full max-w-4xl border border-slate-200 dark:border-slate-700 flex flex-col max-h-[90vh]">
                        <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-700 flex justify-between items-center bg-slate-50 dark:bg-slate-800 rounded-t-xl">
                            <div>
                                <h3 className="text-lg font-bold text-slate-800 dark:text-white">Review Auto-Match Suggestions</h3>
                                <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
                                    Please confirm the mappings. You have the final decision.
                                </p>
                            </div>
                            <button onClick={() => setShowAutoMapModal(false)} className="p-2 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-full text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors">
                                <X size={20} />
                            </button>
                        </div>

                        <div className="flex-1 overflow-auto p-6 bg-slate-50/30 dark:bg-slate-900/30">
                            {autoMapSuggestions.notes && autoMapSuggestions.notes.length > 0 && (
                                <div className="mb-4 text-xs text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 p-3 rounded-lg">
                                    {autoMapSuggestions.notes.join(' ')}
                                </div>
                            )}

                            <div className="space-y-4">
                                {autoMapSuggestions.mappings.map((m) => (
                                    <div key={m.variable} className="bg-white dark:bg-slate-900 p-4 rounded-lg border border-slate-200 dark:border-slate-700 shadow-sm">
                                        <div className="flex items-center justify-between mb-3">
                                            <span className="text-sm font-bold text-slate-700 dark:text-slate-200">{m.variable}</span>
                                            <span className="text-xs text-slate-400">Current: {variableValues[m.variable] || 'Empty'}</span>
                                        </div>

                                        {m.candidates.length === 0 ? (
                                            <div className="text-sm text-slate-400">No candidates found.</div>
                                        ) : (
                                            <div className="space-y-2">
                                                {m.candidates.map((c, idx) => (
                                                    <label key={`${m.variable}-${idx}`} className="flex items-start gap-3 p-3 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800/50 cursor-pointer">
                                                        <input
                                                            type="radio"
                                                            name={`auto-${m.variable}`}
                                                            checked={autoMapSelections[m.variable] === c.value}
                                                            onChange={() => setAutoMapSelections(prev => ({ ...prev, [m.variable]: c.value }))}
                                                            className="mt-1"
                                                        />
                                                        <div className="flex-1">
                                                            <div className="text-sm font-semibold text-slate-800 dark:text-slate-100">{c.value}</div>
                                                            <div className="text-xs text-slate-500 dark:text-slate-400 mt-1">Evidence: {c.evidence}</div>
                                                            <div className="text-[10px] text-slate-400 mt-1">Confidence: {Math.round((c.confidence || 0) * 100)}%</div>
                                                        </div>
                                                    </label>
                                                ))}
                                                <label className="flex items-center gap-3 p-3 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800/50 cursor-pointer">
                                                    <input
                                                        type="radio"
                                                        name={`auto-${m.variable}`}
                                                        checked={!autoMapSelections[m.variable]}
                                                        onChange={() => setAutoMapSelections(prev => ({ ...prev, [m.variable]: '' }))}
                                                    />
                                                    <span className="text-sm text-slate-500">Keep current value</span>
                                                </label>
                                            </div>
                                        )}
                                    </div>
                                ))}
                            </div>
                        </div>

                        <div className="px-6 py-4 border-t border-slate-100 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 rounded-b-xl flex justify-end gap-3">
                            <button onClick={() => setShowAutoMapModal(false)} className="px-4 py-2 text-slate-600 dark:text-slate-300 font-medium hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors">Cancel</button>
                            <button onClick={applyAutoMapSelections} className="px-6 py-2 bg-blue-600 text-white font-bold rounded-lg hover:bg-blue-700 shadow-lg shadow-blue-500/20 transition-all">Apply Selected</button>
                        </div>
                    </div>
                </div>
            )}

    </div>
  );
};

const CheckCircleIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" className="text-green-500 bg-green-50 dark:bg-green-900/20 rounded-full p-3 mb-2">
        <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
        <polyline points="22 4 12 14.01 9 11.01"></polyline>
    </svg>
);

export default ReportWorkspace;