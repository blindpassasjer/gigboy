import { languageName, LANGUAGE_FLAGS } from '../utils/languages';

interface Props {
  code: string;
  size?: 'sm' | 'md';
  flagOnly?: boolean;
}

export default function LanguageBadge({ code, size = 'md', flagOnly = false }: Props) {
  const flag = LANGUAGE_FLAGS[code] ?? '🌐';
  return (
    <span className={`lang-badge lang-badge--${size}`} title={languageName(code)}>
      {flagOnly ? flag : <>{flag} {languageName(code)}</>}
    </span>
  );
}
