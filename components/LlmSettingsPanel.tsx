import React, { useEffect, useState, useRef } from 'react';
import { CheckCircle, RefreshCw, X, XCircle } from 'lucide-react';
import { LLMSettings } from '../types';
import { getLLMSettings, saveLLMSettings, clearLLMSettings } from '../services/llmConfig';
import { testOpenAICompatibleConnection } from '../services/geminiService';

const LlmSettingsPanel: React.FC = () => {
  const [showLlmPanel, setShowLlmPanel] = useState(false);
  const [llmSettings, setLlmSettings] = useState<LLMSettings>(() => getLLMSettings());
  const [showApiKey, setShowApiKey] = useState(false);
  const [llmTestStatus, setLlmTestStatus] = useState<'idle' | 'testing' | 'success' | 'error'>('idle');
  const [llmTestMessage, setLlmTestMessage] = useState<string | null>(null);
  const settingsRef = useRef(llmSettings);

  // 保持 ref 与 state 同步
  useEffect(() => {
    settingsRef.current = llmSettings;
  }, [llmSettings]);

  useEffect(() => {
    const handleTogglePanel = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return;
      if (event.key !== '.' && event.key !== '·' && event.key !== '`') return;

      const target = event.target as HTMLElement | null;
      if (target?.isContentEditable) return;
      const tagName = target?.tagName?.toLowerCase();
      if (tagName && ['input', 'textarea', 'select'].includes(tagName)) return;

      setShowLlmPanel(prev => !prev);
    };

    window.addEventListener('keydown', handleTogglePanel);
    return () => window.removeEventListener('keydown', handleTogglePanel);
  }, []);

  const resetLlmTestState = () => {
    setLlmTestStatus('idle');
    setLlmTestMessage(null);
  };

  // 自动保存设置的辅助函数
  const updateAndSaveSettings = (updater: (prev: LLMSettings) => LLMSettings) => {
    setLlmSettings(prev => {
      const newSettings = updater(prev);
      saveLLMSettings(newSettings);
      return newSettings;
    });
  };

  const handleClearLlmSettings = () => {
    clearLLMSettings();
    setLlmSettings(prev => ({
      ...prev,
      apiKey: '',
      rememberSession: false
    }));
    resetLlmTestState();
  };

  const validateOpenAISettings = (settings: LLMSettings) => {
    if (!settings.endpoint.trim()) return '请填写 LLM 访问点。';
    if (!settings.model.trim()) return '请填写模型名称。';
    if (!settings.apiKey.trim()) return '请填写 API Key。';
    if (!settings.multimodalConfirmed) return '请确认所选模型为多模态模型。';
    return null;
  };

  const handleTestLlmConnection = async () => {
    if (llmSettings.provider !== 'openai-compatible') {
      setLlmTestStatus('error');
      setLlmTestMessage('当前仅支持测试 OpenAI 兼容服务。');
      return;
    }

    const errorMessage = validateOpenAISettings(llmSettings);
    if (errorMessage) {
      setLlmTestStatus('error');
      setLlmTestMessage(errorMessage);
      return;
    }

    setLlmTestStatus('testing');
    setLlmTestMessage(null);
    try {
      await testOpenAICompatibleConnection(llmSettings);
      setLlmTestStatus('success');
      setLlmTestMessage('连接成功，可正常调用模型。');
    } catch (error: any) {
      setLlmTestStatus('error');
      setLlmTestMessage(error?.message || '连接失败，请检查配置。');
    }
  };

  if (!showLlmPanel) return null;

  return (
    <div className="fixed right-6 bottom-6 z-50 w-full max-w-sm bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl shadow-2xl overflow-hidden">
      <div className="px-4 py-3 border-b border-slate-100 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 flex items-center justify-between">
        <div>
          <div className="text-sm font-bold text-slate-800 dark:text-white">LLM 配置面板</div>
          <div className="text-[11px] text-slate-500 dark:text-slate-400">快捷键：· 或 `</div>
        </div>
        <button
          onClick={() => setShowLlmPanel(false)}
          className="p-2 rounded-full text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-700"
        >
          <X size={16} />
        </button>
      </div>

      <div className="p-4 space-y-4">
        <div className="space-y-2">
          <label className="text-xs font-semibold text-slate-600 dark:text-slate-300">提供商</label>
          <select
            value={llmSettings.provider}
            onChange={(e) => {
              const provider = e.target.value as LLMSettings['provider'];
              updateAndSaveSettings(prev => ({ ...prev, provider }));
              resetLlmTestState();
            }}
            className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm text-slate-800 dark:text-slate-200 focus:ring-2 focus:ring-blue-500 outline-none"
          >
            <option value="gemini">Google Gemini (默认)</option>
            <option value="openai-compatible">OpenAI 兼容接口</option>
          </select>
        </div>

        {llmSettings.provider === 'openai-compatible' ? (
          <div className="space-y-3">
            <div className="space-y-2">
              <label className="text-xs font-semibold text-slate-600 dark:text-slate-300">LLM 访问点</label>
              <input
                type="text"
                value={llmSettings.endpoint}
                onChange={(e) => {
                  const newEndpoint = e.target.value;
                  setLlmSettings(prev => ({ ...prev, endpoint: newEndpoint }));
                }}
                onBlur={() => {
                  saveLLMSettings(settingsRef.current);
                }}
                placeholder="https://api.openai.com"
                className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm text-slate-800 dark:text-slate-200 focus:ring-2 focus:ring-blue-500 outline-none"
              />
            </div>

            <div className="space-y-2">
              <label className="text-xs font-semibold text-slate-600 dark:text-slate-300">模型名称（多模态）</label>
              <input
                type="text"
                value={llmSettings.model}
                onChange={(e) => {
                  const newModel = e.target.value;
                  setLlmSettings(prev => ({ ...prev, model: newModel }));
                }}
                onBlur={() => {
                  saveLLMSettings(settingsRef.current);
                }}
                placeholder="gpt-4o-mini"
                className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm text-slate-800 dark:text-slate-200 focus:ring-2 focus:ring-blue-500 outline-none"
              />
            </div>

            <div className="space-y-2">
              <label className="text-xs font-semibold text-slate-600 dark:text-slate-300">API Key</label>
              <div className="flex gap-2">
                <input
                  type={showApiKey ? 'text' : 'password'}
                  value={llmSettings.apiKey}
                  onChange={(e) => {
                    const newApiKey = e.target.value;
                    setLlmSettings(prev => ({ ...prev, apiKey: newApiKey }));
                  }}
                  onBlur={() => {
                    saveLLMSettings(settingsRef.current);
                  }}
                  placeholder="sk-..."
                  className="flex-1 px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm text-slate-800 dark:text-slate-200 focus:ring-2 focus:ring-blue-500 outline-none"
                />
                <button
                  type="button"
                  onClick={() => setShowApiKey(prev => !prev)}
                  className="px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-xs text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
                >
                  {showApiKey ? '隐藏' : '显示'}
                </button>
              </div>
            </div>

            <div className="space-y-2">
              <label className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300">
                <input
                  type="checkbox"
                  checked={llmSettings.multimodalConfirmed}
                  onChange={(e) => updateAndSaveSettings(prev => ({ ...prev, multimodalConfirmed: e.target.checked }))}
                />
                我确认该模型为多模态模型
              </label>
              <label className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300">
                <input
                  type="checkbox"
                  checked={llmSettings.rememberSession}
                  onChange={(e) => updateAndSaveSettings(prev => ({ ...prev, rememberSession: e.target.checked }))}
                />
                仅在本次会话保存 API Key（刷新后失效）
              </label>
              <div className="text-[11px] text-slate-400 dark:text-slate-500">
                💡 所有设置自动保存。API Key 默认仅保存在内存中，不写入 localStorage。
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={handleTestLlmConnection}
                className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-semibold bg-slate-900 text-white hover:bg-slate-700 transition-colors"
                disabled={llmTestStatus === 'testing'}
              >
                {llmTestStatus === 'testing' ? '测试中...' : '测试连接'}
              </button>
              <button
                onClick={handleClearLlmSettings}
                className="px-3 py-2 rounded-lg text-xs font-semibold bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300"
              >
                清除
              </button>
            </div>

            {llmTestStatus !== 'idle' && (
              <div className={`text-xs flex items-center gap-2 ${llmTestStatus === 'success' ? 'text-emerald-600' : llmTestStatus === 'error' ? 'text-rose-600' : 'text-slate-500'}`}>
                {llmTestStatus === 'success' && <CheckCircle size={14} />}
                {llmTestStatus === 'error' && <XCircle size={14} />}
                {llmTestStatus === 'testing' && <RefreshCw size={14} className="animate-spin" />}
                <span>{llmTestMessage || (llmTestStatus === 'testing' ? '正在测试连接...' : '')}</span>
              </div>
            )}
          </div>
        ) : (
          <div className="text-xs text-slate-500 dark:text-slate-400 bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-lg p-3">
            当前使用 Gemini 默认配置。如需切换，请选择 OpenAI 兼容接口并填写配置。
          </div>
        )}
      </div>
    </div>
  );
};

export default LlmSettingsPanel;
