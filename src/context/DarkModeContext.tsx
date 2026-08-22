/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext } from 'react';
import type { ReactNode } from 'react';
import { useDarkMode } from '../hooks/useDarkMode';
import type { ThemeMode } from '../hooks/useDarkMode';

type DarkModeContextValue = {
  mode: ThemeMode;
  setMode: (mode: ThemeMode) => void;
  cycle: () => void;
  dark: boolean;
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
