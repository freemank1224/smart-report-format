import { LLMSettings } from '../types';

const CONFIG_KEY = 'smartdoc_llm_config_v1';
const API_KEY_KEY = 'smartdoc_llm_api_key_v1';

let inMemoryApiKey = '';

const defaultSettings: LLMSettings = {
  provider: 'gemini',
  endpoint: 'https://api.openai.com',
  model: 'gpt-4o-mini',
  apiKey: '',
  rememberSession: false,
  multimodalConfirmed: false
};

const readSessionJson = (key: string) => {
  try {
    const raw = sessionStorage.getItem(key);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
};

export const getLLMSettings = (): LLMSettings => {
  const stored = readSessionJson(CONFIG_KEY) || {};
  const rememberSession = Boolean(stored.rememberSession);
  const apiKey = rememberSession ? (sessionStorage.getItem(API_KEY_KEY) || '') : inMemoryApiKey;

  return {
    ...defaultSettings,
    ...stored,
    apiKey: apiKey || ''
  };
};

export const saveLLMSettings = (settings: LLMSettings) => {
  inMemoryApiKey = settings.apiKey || '';
  const { apiKey, ...rest } = settings;

  try {
    sessionStorage.setItem(CONFIG_KEY, JSON.stringify(rest));
    if (settings.rememberSession && apiKey) {
      sessionStorage.setItem(API_KEY_KEY, apiKey);
    } else {
      sessionStorage.removeItem(API_KEY_KEY);
    }
  } catch {
    // ignore storage errors
  }
};

export const clearLLMSettings = () => {
  inMemoryApiKey = '';
  try {
    sessionStorage.removeItem(API_KEY_KEY);
    sessionStorage.removeItem(CONFIG_KEY);
  } catch {
    // ignore storage errors
  }
};
