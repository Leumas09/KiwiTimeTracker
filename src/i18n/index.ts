import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import type { Locale } from '../lib/types'
import en from './en'
import fr from './fr'

const KEY = 'kiwi-locale'

function initialLocale(): Locale {
  try {
    const saved = localStorage.getItem(KEY)
    if (saved === 'fr' || saved === 'en') return saved
  } catch {
    // ignore
  }
  return navigator.language.toLowerCase().startsWith('fr') ? 'fr' : 'en'
}

export function setStoredLocale(locale: Locale) {
  try {
    localStorage.setItem(KEY, locale)
  } catch {
    // ignore
  }
}

i18n.use(initReactI18next).init({
  resources: { fr: { translation: fr }, en: { translation: en } },
  lng: initialLocale(),
  fallbackLng: 'fr',
  interpolation: { escapeValue: false },
})

export default i18n
