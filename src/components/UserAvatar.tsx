interface UserAvatarProps {
  avatar?: string | null;
  label: string;
  size?: 'sm' | 'md' | 'lg';
}

function fallbackInitial(label: string) {
  const trimmed = label.trim();
  if (!trimmed) return '?';
  return trimmed[0]?.toUpperCase() ?? '?';
}

export default function UserAvatar({ avatar, label, size = 'md' }: UserAvatarProps) {
  const resolved = avatar?.trim() || fallbackInitial(label);

  return (
    <span className={`user-avatar user-avatar--${size}`} aria-hidden="true">
      {resolved}
    </span>
  );
}
