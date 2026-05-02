import type { CSSProperties } from 'react';

export interface ToastAnchor {
  top: number;
  left: number;
}

const VIEWPORT_MARGIN = 12;
const DEFAULT_TOAST_WIDTH = 320;
const TOAST_GAP = 10;
let listenersAttached = false;
let lastAnchor: ToastAnchor | null = null;

function anchorFromElement(element: EventTarget | null): ToastAnchor | null {
  if (!(element instanceof HTMLElement)) return null;
  if (!element.isConnected) return null;

  const rect = element.getBoundingClientRect();
  if (rect.width === 0 && rect.height === 0) return null;

  return {
    top: rect.bottom + TOAST_GAP,
    left: rect.left + rect.width / 2,
  };
}

function ensureAnchorListeners() {
  if (listenersAttached || typeof document === 'undefined') return;
  listenersAttached = true;

  document.addEventListener('pointerdown', (event) => {
    const anchor = anchorFromElement(event.target);
    if (anchor) {
      lastAnchor = anchor;
    }
  });

  document.addEventListener('keydown', () => {
    const anchor = anchorFromElement(document.activeElement);
    if (anchor) {
      lastAnchor = anchor;
    }
  });
}

export function getActiveToastAnchor(): ToastAnchor | null {
  ensureAnchorListeners();

  if (typeof document === 'undefined') return null;

  const activeAnchor = anchorFromElement(document.activeElement);
  if (activeAnchor) {
    lastAnchor = activeAnchor;
    return activeAnchor;
  }

  return lastAnchor;
}

export function getAnchoredToastStyle(anchor: ToastAnchor | null): CSSProperties {
  if (!anchor || typeof window === 'undefined') {
    return {};
  }

  const maxLeft = Math.max(VIEWPORT_MARGIN, window.innerWidth - VIEWPORT_MARGIN - DEFAULT_TOAST_WIDTH);
  const left = Math.min(Math.max(anchor.left - DEFAULT_TOAST_WIDTH / 2, VIEWPORT_MARGIN), maxLeft);
  const top = Math.min(Math.max(anchor.top, VIEWPORT_MARGIN), window.innerHeight - VIEWPORT_MARGIN);

  return {
    position: 'fixed',
    top,
    left,
    margin: 0,
    pointerEvents: 'auto',
    zIndex: 9999,
  };
}
