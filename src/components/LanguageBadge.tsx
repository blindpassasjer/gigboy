import { languageName, languageAbbr } from '../utils/languages';

interface Props {
  code: string;
  size?: 'sm' | 'md';
  flagOnly?: boolean;
}

export default function LanguageBadge({ code, size = 'md', flagOnly = false }: Props) {
  const abbr = languageAbbr(code);
  return (
    <span className={`lang-badge lang-badge--${size}`} title={languageName(code)}>
      {flagOnly ? abbr : languageName(code)}
    </span>
  );
}
