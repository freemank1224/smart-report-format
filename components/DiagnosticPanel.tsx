import React, { useState } from 'react';
import { AlertCircle, CheckCircle, Info } from 'lucide-react';
import { generateDiagnosticReport } from '../utils/environmentDiagnostics';

interface DiagnosticResult {
  environment: any;
  apiConfiguration: any;
  workerStatus: any;
  timestamp: string;
  recommendations: string[];
}

export const EnvironmentDiagnostics: React.FC = () => {
  const [result, setResult] = useState<DiagnosticResult | null>(null);
  const [loading, setLoading] = useState(false);

  const runDiagnostics = async () => {
    setLoading(true);
    try {
      const report = await generateDiagnosticReport();
      setResult(report);
    } catch (error) {
      console.error('诊断失败:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-slate-800 dark:text-white flex items-center gap-2">
          <AlertCircle size={20} className="text-blue-600" />
          环境诊断工具
        </h3>
        <button
          onClick={runDiagnostics}
          disabled={loading}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium disabled:opacity-50 transition-colors"
        >
          {loading ? '检测中...' : '运行诊断'}
        </button>
      </div>

      {result && (
        <div className="space-y-3">
          {/* 环境信息 */}
          <div className="bg-slate-50 dark:bg-slate-900 rounded-lg p-4">
            <h4 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">
              环境信息
            </h4>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div>
                <span className="text-slate-500">平台:</span>{' '}
                <span className="font-mono">{result.environment.platform}</span>
              </div>
              <div>
                <span className="text-slate-500">Vercel:</span>{' '}
                <span className="font-mono">{result.environment.isVercel ? '是' : '否'}</span>
              </div>
              <div>
                <span className="text-slate-500">生产模式:</span>{' '}
                <span className="font-mono">{result.environment.isProduction ? '是' : '否'}</span>
              </div>
              <div>
                <span className="text-slate-500">Serverless:</span>{' '}
                <span className="font-mono">{result.environment.useServerless ? '是' : '否'}</span>
              </div>
            </div>
          </div>

          {/* Worker 状态 */}
          <div className="bg-slate-50 dark:bg-slate-900 rounded-lg p-4">
            <h4 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2 flex items-center gap-2">
              {result.workerStatus.success ? (
                <CheckCircle size={16} className="text-green-600" />
              ) : (
                <AlertCircle size={16} className="text-red-600" />
              )}
              PDF Worker 状态
            </h4>
            <div className="text-xs space-y-1">
              <div>
                <span className="text-slate-500">状态:</span>{' '}
                <span className={`font-semibold ${result.workerStatus.success ? 'text-green-600' : 'text-red-600'}`}>
                  {result.workerStatus.success ? '正常' : '失败'}
                </span>
              </div>
              {result.workerStatus.loadTime && (
                <div>
                  <span className="text-slate-500">加载时间:</span>{' '}
                  <span className="font-mono">{result.workerStatus.loadTime.toFixed(0)} ms</span>
                  {result.workerStatus.loadTime > 1000 && (
                    <span className="ml-2 text-orange-600">⚠️ 较慢</span>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* 建议 */}
          {result.recommendations.length > 0 && (
            <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg p-4">
              <h4 className="text-sm font-semibold text-amber-800 dark:text-amber-300 mb-2 flex items-center gap-2">
                <Info size={16} />
                建议
              </h4>
              <ul className="text-xs text-amber-700 dark:text-amber-400 space-y-1">
                {result.recommendations.map((rec, idx) => (
                  <li key={idx} className="flex items-start gap-2">
                    <span className="mt-0.5">•</span>
                    <span>{rec}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* 时间戳 */}
          <div className="text-xs text-slate-400 text-right">
            检测时间: {new Date(result.timestamp).toLocaleString('zh-CN')}
          </div>
        </div>
      )}

      {!result && !loading && (
        <div className="text-center py-8 text-slate-500 dark:text-slate-400">
          <Info size={32} className="mx-auto mb-2 opacity-50" />
          <p className="text-sm">点击"运行诊断"检查环境配置</p>
        </div>
      )}
    </div>
  );
};

/**
 * 表格验证组件 - 用于验证生成的模板的表格结构
 */
interface TableValidatorProps {
  markdown: string;
}

export const TableValidator: React.FC<TableValidatorProps> = ({ markdown }) => {
  const [validation, setValidation] = useState<any>(null);

  React.useEffect(() => {
    if (!markdown) return;

    const lines = markdown.split('\n');
    const tables: Array<{ start: number; columns: number; rows: number; issues: string[] }> = [];

    let inTable = false;
    let currentTable: any = null;

    lines.forEach((line, idx) => {
      const trimmed = line.trim();

      if (trimmed.startsWith('|')) {
        if (!inTable) {
          inTable = true;
          currentTable = { start: idx, columns: 0, rows: 0, issues: [] };
          tables.push(currentTable);
        }

        const cells = trimmed.split('|').filter((c) => c.trim() !== '');

        if (trimmed.includes('---')) {
          // 分隔行
          currentTable.columns = cells.length;
        } else {
          currentTable.rows++;

          if (currentTable.columns > 0 && cells.length !== currentTable.columns) {
            currentTable.issues.push(`第 ${idx + 1} 行: 期望 ${currentTable.columns} 列，实际 ${cells.length} 列`);
          }
        }
      } else if (inTable && trimmed === '') {
        inTable = false;
        currentTable = null;
      }
    });

    setValidation({ tables, totalTables: tables.length });
  }, [markdown]);

  if (!validation || validation.totalTables === 0) {
    return null;
  }

  const hasIssues = validation.tables.some((t: any) => t.issues.length > 0);

  return (
    <div className={`rounded-lg border p-4 ${hasIssues ? 'bg-red-50 border-red-200 dark:bg-red-900/20 dark:border-red-800' : 'bg-green-50 border-green-200 dark:bg-green-900/20 dark:border-green-800'}`}>
      <h4 className={`text-sm font-semibold mb-2 flex items-center gap-2 ${hasIssues ? 'text-red-800 dark:text-red-300' : 'text-green-800 dark:text-green-300'}`}>
        {hasIssues ? <AlertCircle size={16} /> : <CheckCircle size={16} />}
        表格验证 {hasIssues ? '⚠️ 发现问题' : '✅ 通过'}
      </h4>

      <div className="space-y-2 text-xs">
        <div className={hasIssues ? 'text-red-700 dark:text-red-400' : 'text-green-700 dark:text-green-400'}>
          检测到 {validation.totalTables} 个表格
        </div>

        {validation.tables.map((table: any, idx: number) => (
          <div key={idx} className="bg-white dark:bg-slate-800 rounded p-2 border border-slate-200 dark:border-slate-700">
            <div className="font-semibold mb-1">表格 {idx + 1}</div>
            <div className="text-slate-600 dark:text-slate-400">
              列数: {table.columns}, 行数: {table.rows - 1}
            </div>
            {table.issues.length > 0 && (
              <div className="mt-2 space-y-1">
                {table.issues.map((issue: string, i: number) => (
                  <div key={i} className="text-red-600 dark:text-red-400 flex items-start gap-1">
                    <span>⚠️</span>
                    <span>{issue}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};
