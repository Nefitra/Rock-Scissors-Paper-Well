import ar from '../../locales/ar.json';
import de from '../../locales/de.json';
import en from '../../locales/en.json';
import es from '../../locales/es.json';
import fr from '../../locales/fr.json';
import hi from '../../locales/hi.json';
import id from '../../locales/id.json';
import ja from '../../locales/ja.json';
import pt from '../../locales/pt.json';
import ru from '../../locales/ru.json';
import tr from '../../locales/tr.json';
import zhCN from '../../locales/zh-CN.json';

export const locales: Record<string, any> = {
  'en': en,
  'zh-CN': zhCN,
  'fr': fr,
  'ja': ja,
  'pt': pt,
  'hi': hi,
  'tr': tr,
  'id': id,
  'ru': ru,
  'ar': ar,
  'de': de,
  'es': es
};

export const languageNames: Record<string, string> = {
  'en': 'English',
  'zh-CN': '中文',
  'fr': 'Français',
  'ja': '日本語',
  'pt': 'Português',
  'hi': 'हिन्दी',
  'tr': 'Türkçe',
  'id': 'Bahasa Indonesia',
  'ru': 'Русский',
  'ar': 'العربية',
  'de': 'Deutsch',
  'es': 'Español'
};

export function detectLanguage(): string {
  if (typeof window !== 'undefined') {
    const saved = localStorage.getItem('rspw_lang');
    if (saved && locales[saved]) return saved;
  }

  if (typeof window !== 'undefined') {
    const tgLang = (window as any).Telegram?.WebApp?.initDataUnsafe?.user?.language_code;
    if (tgLang) {
      if (locales[tgLang]) return tgLang;
      if (tgLang.startsWith('zh')) return 'zh-CN';
      const base = tgLang.split('-')[0];
      if (locales[base]) return base;
    }
  }

  if (typeof navigator !== 'undefined') {
    const browserLang = navigator.language;
    if (browserLang) {
      if (locales[browserLang]) return browserLang;
      if (browserLang.startsWith('zh')) return 'zh-CN';
      const base = browserLang.split('-')[0];
      if (locales[base]) return base;
    }
  }

  return 'en';
}

export function getTranslation(lang: string, key: string, params?: Record<string, any>): string {
  const dict = locales[lang] || locales['en'];
  const parts = key.split('.');
  let current = dict;
  
  for (const part of parts) {
    if (current && typeof current === 'object' && part in current) {
      current = current[part];
    } else {
      // Fallback to English
      let fallbackCurrent = locales['en'];
      for (const fPart of parts) {
        if (fallbackCurrent && typeof fallbackCurrent === 'object' && fPart in fallbackCurrent) {
          fallbackCurrent = fallbackCurrent[fPart];
        } else {
          return key;
        }
      }
      current = fallbackCurrent;
      break;
    }
  }

  if (typeof current !== 'string') {
    return key;
  }

  let text = current;
  if (params) {
    Object.entries(params).forEach(([k, v]) => {
      text = text.replace(new RegExp(`{${k}}`, 'g'), String(v));
    });
  }
  return text;
}
