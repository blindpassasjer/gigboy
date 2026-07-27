export const AVATAR_OPTIONS = [
  // Animals
  '🐶',
  '🐱',
  '🐭',
  '🐹',
  '🐰',
  '🦊',
  '🐻',
  '🐼',
  '🐨',
  '🐯',
  '🦁',
  '🐮',
  '🐷',
  '🐵',
  '🐔',
  '🐧',
  '🦉',
  '🐺',
  '🐗',
  '🦓',
  '🐘',
  '🦒',
  '🦏',
  '🐢',
  '🐍',
  '🦎',
  '🐙',
  '🦑',
  '🦀',
  '🐬',
  '🐳',
  '🦈',
  '🐝',
  '🦋',
  '🕷️',
  '🦂',
  // Mythical animals
  '🦄',
  '🐉',
  '🐲',
  '🧜‍♀️',
  '🧚',
  '🐦‍🔥',
  '🧌',
  // Monsters
  '👹',
  '👺',
  '👻',
  '💀',
  '☠️',
  '👽',
  '👾',
  '🧟',
  '🧛',
  '🤖',
] as const;

export type AvatarOption = typeof AVATAR_OPTIONS[number];

export const DEFAULT_AVATAR: AvatarOption = AVATAR_OPTIONS[0];

export function isValidAvatar(value: string): value is AvatarOption {
  return AVATAR_OPTIONS.includes(value as AvatarOption);
}
