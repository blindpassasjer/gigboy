interface UserAvatarProps {
  label: string;
  size?: 'sm' | 'md' | 'lg';
}

function getInitials(label: string) {
  const parts = label.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export default function UserAvatar({ label, size = 'md' }: UserAvatarProps) {
  return (
    <span className={`user-avatar user-avatar--${size}`} aria-hidden="true">
      {getInitials(label)}
    </span>
  );
}
