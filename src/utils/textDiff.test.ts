import { describe, expect, it } from 'vitest';
import { diffLines, fieldChanges } from './textDiff';

describe('diffLines', () => {
  it('marks added, removed and unchanged lines', () => {
    const ops = diffLines('a\nb\nc', 'a\nB\nc\nd');
    expect(ops).toEqual([
      { type: 'same', text: 'a' },
      { type: 'del', text: 'b' },
      { type: 'add', text: 'B' },
      { type: 'same', text: 'c' },
      { type: 'add', text: 'd' },
    ]);
  });

  it('is all-same for identical text', () => {
    expect(diffLines('x\ny', 'x\ny').every((op) => op.type === 'same')).toBe(true);
  });
});

describe('fieldChanges', () => {
  it('reports only differing metadata fields', () => {
    const changes = fieldChanges(
      { title: 'Song', key: 'C', tags: ['a'] },
      { title: 'Song', key: 'D', tags: ['a', 'b'] },
    );
    expect(changes).toEqual([
      { label: 'Tags', before: 'a', after: 'a, b' },
      { label: 'Key', before: 'C', after: 'D' },
    ]);
  });
});
