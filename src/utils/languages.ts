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

export const LANGUAGE_ABBR: Record<string, string> = {
  en: 'ENG',
  es: 'ESP',
  no: 'NOR',
  pt: 'POR',
  fr: 'FRA',
  de: 'GER',
  it: 'ITA',
  la: 'LAT',
};

export function languageAbbr(code: string): string {
  return LANGUAGE_ABBR[code] ?? code.slice(0, 3).toUpperCase();
}
