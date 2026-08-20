export function parseBeatsPerBar(timeSignature?: string): number {
  if (!timeSignature) return 4;
  const match = timeSignature.trim().match(/^(\d+)\s*\/\s*\d+$/);
  if (!match) return 4;
  const numerator = Number.parseInt(match[1], 10);
  if (!Number.isFinite(numerator) || numerator < 1) return 4;
  return Math.min(numerator, 12);
}
