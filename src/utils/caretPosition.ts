// Computes the on-screen pixel position of a caret offset inside a <textarea>,
// relative to the textarea's own top-left corner. Used to anchor a popover at
// the exact spot the user is editing, without switching to a contenteditable
// or rendered-lyrics editor.
//
// Technique: render an invisible mirror <div> with the textarea's exact text
// styling and width, fill it with the text up to the caret, and measure the
// position of a marker span at the end of that text. This is the standard
// approach used by libraries like textarea-caret-position.

const MIRROR_PROPERTIES: (keyof CSSStyleDeclaration)[] = [
  'boxSizing', 'width', 'height', 'overflowX', 'overflowY',
  'borderTopWidth', 'borderRightWidth', 'borderBottomWidth', 'borderLeftWidth', 'borderStyle',
  'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft',
  'fontStyle', 'fontVariant', 'fontWeight', 'fontStretch', 'fontSize', 'fontFamily',
  'textAlign', 'textTransform', 'textIndent', 'textDecoration',
  'letterSpacing', 'wordSpacing', 'tabSize', 'lineHeight',
];

export interface CaretCoordinates {
  top: number;
  left: number;
  height: number;
}

export function getCaretCoordinates(textarea: HTMLTextAreaElement, position: number): CaretCoordinates {
  const div = document.createElement('div');
  document.body.appendChild(div);

  const style = div.style;
  const computed = window.getComputedStyle(textarea);

  style.whiteSpace = 'pre-wrap';
  style.wordWrap = 'break-word';
  style.position = 'absolute';
  style.visibility = 'hidden';
  style.left = '-9999px';
  style.top = '0';

  for (const prop of MIRROR_PROPERTIES) {
    const value = computed[prop];
    if (typeof value === 'string') {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (style as any)[prop] = value;
    }
  }

  div.textContent = textarea.value.substring(0, position);

  const span = document.createElement('span');
  // A non-empty marker ensures the span has real dimensions even at line end.
  span.textContent = textarea.value.substring(position) || '.';
  div.appendChild(span);

  const coordinates: CaretCoordinates = {
    top: span.offsetTop - textarea.scrollTop,
    left: span.offsetLeft - textarea.scrollLeft,
    height: span.offsetHeight,
  };

  document.body.removeChild(div);
  return coordinates;
}
