import { useCallback, useEffect, useState } from 'react';

const KEY = 'gigboy-dark-mode';

function getInitial(): boolean {
  if (typeof window === 'undefined') return false;
  const stored = localStorage.getItem(KEY);
  if (stored !== null) return stored === 'true';
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
}

export function useDarkMode() {
  const [dark, setDark] = useState(getInitial);

  useEffect(() => {
    if (typeof document === 'undefined') return;
    const nextTheme = dark ? 'dark' : 'light';
    if (document.documentElement.getAttribute('data-theme') !== nextTheme) {
      document.documentElement.setAttribute('data-theme', nextTheme);
    }
    if (typeof window !== 'undefined') {
      localStorage.setItem(KEY, String(dark));
    }
  }, [dark]);

  const toggle = useCallback(() => {
    setDark((v) => !v);
  }, []);

  return { dark, toggle };
}
