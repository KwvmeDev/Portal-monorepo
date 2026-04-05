import React, { createContext, useCallback, useContext, useEffect, useState } from 'react'
import AsyncStorage from '@react-native-async-storage/async-storage'
import translations, { type Language, type TranslationKey } from './translations'
import { useAuthStore } from '../stores/authStore'

const userLanguageKey = (userId: string) => `@portal/language/${userId}`

interface LanguageContextValue {
  language: Language
  setLanguage: (lang: Language) => void
  t: (key: TranslationKey) => string
}

const LanguageContext = createContext<LanguageContextValue>({
  language: 'en',
  setLanguage: () => {},
  t: (key) => translations.en[key],
})

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [language, setLanguageState] = useState<Language>('en')
  const userId = useAuthStore((s) => s.user?.id)

  // Load user-specific language whenever the logged-in user changes
  useEffect(() => {
    if (userId) {
      AsyncStorage.getItem(userLanguageKey(userId)).then((stored) => {
        if (stored === 'en' || stored === 'pt' || stored === 'am' || stored === 'mg') {
          setLanguageState(stored)
        } else {
          setLanguageState('en')
        }
      })
    } else {
      // No user logged in — reset to default
      setLanguageState('en')
    }
  }, [userId])

  const setLanguage = useCallback((lang: Language) => {
    setLanguageState(lang)
    if (userId) {
      AsyncStorage.setItem(userLanguageKey(userId), lang)
    }
  }, [userId])

  const t = useCallback(
    (key: TranslationKey): string => translations[language][key],
    [language],
  )

  return (
    <LanguageContext.Provider value={{ language, setLanguage, t }}>
      {children}
    </LanguageContext.Provider>
  )
}

export function useLanguage(): LanguageContextValue {
  return useContext(LanguageContext)
}
