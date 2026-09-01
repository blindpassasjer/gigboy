import { useCallback, useEffect, useState } from 'react';
import { readStoredString, writeStoredString } from '../lib/safeStorage';

const KEY = 'gigboy-dark-mode';

export type ThemeMode = 'light' | 'dark' | 'stage';

const MODES: ThemeMode[] = ['light', 'dark', 'stage'];

function getInitial(): ThemeMode {
  if (typeof window === 'undefined') return 'light';
  const stored = readStoredString(KEY);
  if (stored === 'light' || stored === 'dark' || stored === 'stage') return stored;
  // Legacy boolean values from before stage mode existed.
  if (stored === 'true') return 'dark';
  if (stored === 'false') return 'light';
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export function useDarkMode() {
  const [mode, setMode] = useState<ThemeMode>(getInitial);

  useEffect(() => {
    if (typeof document === 'undefined') return;
    const root = document.documentElement;
    root.classList.add('theme-switching');
    if (root.getAttribute('data-theme') !== mode) {
      root.setAttribute('data-theme', mode);
    }

    // Keep transition suppression for two frames so style recalc + paint settle first.
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        root.classList.remove('theme-switching');
      });
    });

    writeStoredString(KEY, mode);
  }, [mode]);

  const cycle = useCallback(() => {
    setMode((current) => MODES[(MODES.indexOf(current) + 1) % MODES.length]);
  }, []);

  return { mode, setMode, cycle, dark: mode !== 'light' };
}
