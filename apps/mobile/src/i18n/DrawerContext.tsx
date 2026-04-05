import React, { createContext, useCallback, useContext, useState } from 'react'

interface DrawerContextValue {
  isOpen: boolean
  openDrawer: () => void
  closeDrawer: () => void
}

const DrawerContext = createContext<DrawerContextValue>({
  isOpen: false,
  openDrawer: () => {},
  closeDrawer: () => {},
})

export function DrawerProvider({ children }: { children: React.ReactNode }) {
  const [isOpen, setIsOpen] = useState(false)
  const openDrawer = useCallback(() => setIsOpen(true), [])
  const closeDrawer = useCallback(() => setIsOpen(false), [])

  return (
    <DrawerContext.Provider value={{ isOpen, openDrawer, closeDrawer }}>
      {children}
    </DrawerContext.Provider>
  )
}

export function useDrawer(): DrawerContextValue {
  return useContext(DrawerContext)
}
