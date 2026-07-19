/**
 * Inserts a chord tag at the current selection. If text is selected (e.g. a
 * marked syllable), the tag goes immediately before it and the selected text
 * is preserved — mirroring how the Section toolbar buttons wrap a selection,
 * rather than replacing it the way a plain cursor-insert would.
 */
export function insertChordAtSelection(
  textarea: HTMLTextAreaElement,
  chordName: string,
  value: string,
  onChange: (value: string) => void,
) {
  const start = textarea.selectionStart;
  const end = textarea.selectionEnd;
  const tag = `[${chordName}]`;
  const before = value.slice(0, start);
  const marked = value.slice(start, end);
  const after = value.slice(end);
  onChange(before + tag + marked + after);
  const newPos = start + tag.length + marked.length;
  requestAnimationFrame(() => {
    textarea.focus({ preventScroll: true });
    textarea.setSelectionRange(newPos, newPos);
  });
}
