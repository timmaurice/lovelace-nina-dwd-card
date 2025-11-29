export interface TranslationEntry {
  headline: string;
  description: string;
  instruction: string;
  timestamp: number;
}

export interface CacheStorage {
  [targetLanguage: string]: {
    [key: string]: TranslationEntry;
  };
}

const CACHE_KEY = 'nina_dwd_translations';
const CACHE_EXPIRY_MS = 24 * 60 * 60 * 1000; // 24 hours

export class TranslationCache {
  private _cache: CacheStorage = {};

  constructor() {
    this._loadCache();
  }

  private _loadCache(): void {
    try {
      const stored = localStorage.getItem(CACHE_KEY);
      if (stored) {
        this._cache = JSON.parse(stored);
        this._pruneCache();
      }
    } catch (e) {
      console.warn('NINA-DWD: Failed to load translation cache', e);
      this._cache = {};
    }
  }

  private _saveCache(): void {
    try {
      localStorage.setItem(CACHE_KEY, JSON.stringify(this._cache));
    } catch (e) {
      console.warn('NINA-DWD: Failed to save translation cache', e);
    }
  }

  private _pruneCache(): void {
    const now = Date.now();
    let changed = false;

    for (const lang in this._cache) {
      const langCache = this._cache[lang];
      for (const key in langCache) {
        if (now - langCache[key].timestamp > CACHE_EXPIRY_MS) {
          delete langCache[key];
          changed = true;
        }
      }
      if (Object.keys(langCache).length === 0) {
        delete this._cache[lang];
        changed = true;
      }
    }

    if (changed) {
      this._saveCache();
    }
  }

  public get(targetLanguage: string, key: string): TranslationEntry | undefined {
    return this._cache[targetLanguage]?.[key];
  }

  public set(targetLanguage: string, key: string, translation: Omit<TranslationEntry, 'timestamp'>): void {
    if (!this._cache[targetLanguage]) {
      this._cache[targetLanguage] = {};
    }

    this._cache[targetLanguage][key] = {
      ...translation,
      timestamp: Date.now(),
    };

    this._saveCache();
  }

  public clear(): void {
    this._cache = {};
    localStorage.removeItem(CACHE_KEY);
  }
}
