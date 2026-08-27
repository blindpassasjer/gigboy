export type DiffOp = { type: 'same' | 'add' | 'del'; text: string };

/**
 * Minimal line-level diff (LCS) — enough to show what changed between two versions of a
 * song's ChordPro text. Not intended for huge inputs.
 */
export function diffLines(before: string, after: string): DiffOp[] {
  const a = before.split('\n');
  const b = after.split('\n');
  const n = a.length;
  const m = b.length;

  // LCS length table.
  const lcs: number[][] = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i -= 1) {
    for (let j = m - 1; j >= 0; j -= 1) {
      lcs[i][j] = a[i] === b[j] ? lcs[i + 1][j + 1] + 1 : Math.max(lcs[i + 1][j], lcs[i][j + 1]);
    }
  }

  const ops: DiffOp[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      ops.push({ type: 'same', text: a[i] });
      i += 1;
      j += 1;
    } else if (lcs[i + 1][j] >= lcs[i][j + 1]) {
      ops.push({ type: 'del', text: a[i] });
      i += 1;
    } else {
      ops.push({ type: 'add', text: b[j] });
      j += 1;
    }
  }
  while (i < n) {
    ops.push({ type: 'del', text: a[i] });
    i += 1;
  }
  while (j < m) {
    ops.push({ type: 'add', text: b[j] });
    j += 1;
  }
  return ops;
}

export interface FieldChange {
  label: string;
  before: string;
  after: string;
}

const FIELD_LABELS: Record<string, string> = {
  title: 'Title',
  artist: 'Artist',
  author: 'Author',
  language: 'Language',
  secondaryLanguages: 'Languages',
  tags: 'Tags',
  capo: 'Capo',
  key: 'Key',
  tempo: 'Tempo',
  timeSignature: 'Time signature',
};

function displayValue(value: unknown): string {
  if (value === null || value === undefined || value === '') return '—';
  if (Array.isArray(value)) return value.join(', ') || '—';
  return String(value);
}

/** Non-lyrics field differences between two snapshots, for a compact side-by-side table. */
export function fieldChanges(
  before: Record<string, unknown>,
  after: Record<string, unknown>,
): FieldChange[] {
  const changes: FieldChange[] = [];
  for (const [key, label] of Object.entries(FIELD_LABELS)) {
    const b = displayValue(before[key]);
    const a = displayValue(after[key]);
    if (b !== a) changes.push({ label, before: b, after: a });
  }
  return changes;
}
