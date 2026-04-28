import type { CSSProperties } from 'react';

function normalizeHex(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;

  const candidate = trimmed.startsWith('#') ? trimmed : `#${trimmed}`;
  if (!/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(candidate)) {
    return null;
  }

  if (candidate.length === 4) {
    const r = candidate[1];
    const g = candidate[2];
    const b = candidate[3];
    return `#${r}${r}${g}${g}${b}${b}`.toLowerCase();
  }

  return candidate.toLowerCase();
}

function hexToRgb(hex: string): [number, number, number] {
  const normalized = normalizeHex(hex);
  if (!normalized) return [92, 79, 166];

  const value = normalized.slice(1);
  const r = Number.parseInt(value.slice(0, 2), 16);
  const g = Number.parseInt(value.slice(2, 4), 16);
  const b = Number.parseInt(value.slice(4, 6), 16);
  return [r, g, b];
}

function mixChannel(base: number, target: number, ratio: number): number {
  return Math.round(base * (1 - ratio) + target * ratio);
}

function mixRgb(
  color: [number, number, number],
  target: [number, number, number],
  ratio: number,
): [number, number, number] {
  return [
    mixChannel(color[0], target[0], ratio),
    mixChannel(color[1], target[1], ratio),
    mixChannel(color[2], target[2], ratio),
  ];
}

function rgbToCss([r, g, b]: [number, number, number]): string {
  return `rgb(${r}, ${g}, ${b})`;
}

function averageRgb(colors: Array<[number, number, number]>): [number, number, number] {
  if (colors.length === 0) return [92, 79, 166];

  const totals = colors.reduce(
    (acc, [r, g, b]) => [acc[0] + r, acc[1] + g, acc[2] + b] as [number, number, number],
    [0, 0, 0] as [number, number, number],
  );

  return [
    Math.round(totals[0] / colors.length),
    Math.round(totals[1] / colors.length),
    Math.round(totals[2] / colors.length),
  ];
}

function relativeLuminance([r, g, b]: [number, number, number]): number {
  const toLinear = (channel: number) => {
    const s = channel / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };

  const lr = toLinear(r);
  const lg = toLinear(g);
  const lb = toLinear(b);
  return 0.2126 * lr + 0.7152 * lg + 0.0722 * lb;
}

function contrastTextRgb(background: [number, number, number]): [number, number, number] {
  return relativeLuminance(background) > 0.44 ? [30, 24, 20] : [248, 250, 252];
}

export function buildSongSurfaceStyle(accentColor?: string): CSSProperties | undefined {
  if (!accentColor) return undefined;

  const normalized = normalizeHex(accentColor);
  if (!normalized) {
    return { '--song-item-accent': accentColor } as CSSProperties;
  }

  const accentRgb = hexToRgb(normalized);
  const bgRgb = mixRgb(accentRgb, [255, 255, 255], 0.78);
  const borderRgb = mixRgb(accentRgb, [255, 255, 255], 0.58);
  const chipBgRgb = mixRgb(accentRgb, [255, 255, 255], 0.68);
  const textRgb = contrastTextRgb(bgRgb);
  const accentContrastRgb = contrastTextRgb(accentRgb);
  const mutedRgb: [number, number, number] =
    relativeLuminance(bgRgb) > 0.44 ? [77, 64, 55] : [226, 232, 240];

  return {
    '--song-item-accent': normalized,
    '--song-item-bg': rgbToCss(bgRgb),
    '--song-item-border': rgbToCss(borderRgb),
    '--song-item-text': rgbToCss(textRgb),
    '--song-item-muted': rgbToCss(mutedRgb),
    '--song-item-chip-bg': rgbToCss(chipBgRgb),
    '--song-item-chip-text': rgbToCss(textRgb),
    '--song-item-accent-contrast': rgbToCss(accentContrastRgb),
  } as CSSProperties;
}

export function buildSongSurfaceStyleFromPalette(accentColors: string[]): CSSProperties | undefined {
  const normalizedPalette = Array.from(
    new Set(accentColors.map((color) => normalizeHex(color)).filter((color): color is string => Boolean(color)))
  );

  if (normalizedPalette.length === 0) return undefined;
  if (normalizedPalette.length === 1) return buildSongSurfaceStyle(normalizedPalette[0]);

  const accentRgbs = normalizedPalette.map((color) => hexToRgb(color));
  const avgAccentRgb = averageRgb(accentRgbs);
  const borderRgb = mixRgb(avgAccentRgb, [255, 255, 255], 0.56);
  const chipBgRgb = mixRgb(avgAccentRgb, [255, 255, 255], 0.68);
  const textRgb = contrastTextRgb(mixRgb(avgAccentRgb, [255, 255, 255], 0.76));
  const accentContrastRgb = contrastTextRgb(avgAccentRgb);
  const mutedRgb: [number, number, number] =
    relativeLuminance(mixRgb(avgAccentRgb, [255, 255, 255], 0.76)) > 0.44
      ? [77, 64, 55]
      : [226, 232, 240];

  const gradientStops = accentRgbs
    .map((rgb, index) => {
      const stop = accentRgbs.length === 1 ? 0 : Math.round((index / (accentRgbs.length - 1)) * 100);
      const tinted = mixRgb(rgb, [255, 255, 255], 0.8);
      return `${rgbToCss(tinted)} ${stop}%`;
    })
    .join(', ');

  return {
    '--song-item-accent': normalizedPalette[0],
    '--song-item-bg': `linear-gradient(135deg, ${gradientStops})`,
    '--song-item-border': rgbToCss(borderRgb),
    '--song-item-text': rgbToCss(textRgb),
    '--song-item-muted': rgbToCss(mutedRgb),
    '--song-item-chip-bg': rgbToCss(chipBgRgb),
    '--song-item-chip-text': rgbToCss(textRgb),
    '--song-item-accent-contrast': rgbToCss(accentContrastRgb),
  } as CSSProperties;
}
