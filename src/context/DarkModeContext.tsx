import { createContext, useContext } from 'react';
import type { ReactNode } from 'react';
import { useDarkMode } from '../hooks/useDarkMode';

type DarkModeContextValue = {
  dark: boolean;
  toggle: () => void;
};

const DarkModeContext = createContext<DarkModeContextValue | undefined>(undefined);

export function DarkModeProvider({ children }: { children: ReactNode }) {
  const value = useDarkMode();
  return <DarkModeContext.Provider value={value}>{children}</DarkModeContext.Provider>;
}

export function useDarkModeContext() {
  const value = useContext(DarkModeContext);
  if (!value) {
    throw new Error('useDarkModeContext must be used within DarkModeProvider');
  }
  return value;
}
