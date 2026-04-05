import React, { createContext, useCallback, useEffect, useState } from 'react'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { dark, light, ThemePalette } from './tokens'

const THEME_KEY = '@portal/theme'

interface ThemeContextValue {
  theme: ThemePalette
  isDark: boolean
  toggleTheme: () => void
  isLoading: boolean
}

export const ThemeContext = createContext<ThemeContextValue | null>(null)

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [isDark, setIsDark] = useState(true) // dark-first default
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    AsyncStorage.getItem(THEME_KEY).then((stored) => {
      if (stored !== null) {
        setIsDark(stored === 'dark')
      }
      // If no stored value, stays dark (default)
      setIsLoading(false)
    })
  }, [])

  const toggleTheme = useCallback(() => {
    setIsDark((prev) => {
      const next = !prev
      AsyncStorage.setItem(THEME_KEY, next ? 'dark' : 'light')
      return next
    })
  }, [])

  const theme = isDark ? dark : light

  return (
    <ThemeContext.Provider value={{ theme, isDark, toggleTheme, isLoading }}>
      {children}
    </ThemeContext.Provider>
  )
}
