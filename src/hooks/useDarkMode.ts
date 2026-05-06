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
    const root = document.documentElement;
    const nextTheme = dark ? 'dark' : 'light';
    root.classList.add('theme-switching');
    if (root.getAttribute('data-theme') !== nextTheme) {
      root.setAttribute('data-theme', nextTheme);
    }

    // Keep transition suppression for two frames so style recalc + paint settle first.
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        root.classList.remove('theme-switching');
      });
    });

    if (typeof window !== 'undefined') {
      localStorage.setItem(KEY, String(dark));
    }
  }, [dark]);

  const toggle = useCallback(() => {
    setDark((v) => !v);
  }, []);

  return { dark, toggle };
}
