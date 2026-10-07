export const LANGUAGE_NAMES: Record<string, string> = {
  en: 'English',
  es: 'Español',
  no: 'Norsk',
  pt: 'Português',
  fr: 'Français',
  de: 'Deutsch',
  it: 'Italiano',
  la: 'Latin',
};

export function languageName(code: string): string {
  if (code in LANGUAGE_NAMES) return LANGUAGE_NAMES[code];
  // Custom free-text languages are shown as typed; short codes are uppercased.
  return code.length <= 3 ? code.toUpperCase() : code;
}
