import { languageName, LANGUAGE_FLAGS } from '../utils/languages';

interface Props {
  code: string;
  size?: 'sm' | 'md';
}

export default function LanguageBadge({ code, size = 'md' }: Props) {
  const flag = LANGUAGE_FLAGS[code] ?? '🌐';
  return (
    <span className={`lang-badge lang-badge--${size}`} title={languageName(code)}>
      {flag} {languageName(code)}
    </span>
  );
}
