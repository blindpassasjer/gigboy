import { languageName } from '../utils/languages';

interface Props {
  code: string;
  size?: 'sm' | 'md';
}

export default function LanguageBadge({ code, size = 'md' }: Props) {
  return (
    <span className={`lang-badge lang-badge--${size}`} title={languageName(code)}>
      {languageName(code)}
    </span>
  );
}
