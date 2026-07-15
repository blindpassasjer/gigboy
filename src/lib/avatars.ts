export const AVATAR_OPTIONS = [
  // Instruments
  '🎸',
  '🥁',
  '🎹',
  '🎤',
  '🎷',
  '🎺',
  '🪕',
  '🎻',
  '🪘',
  '🪗',
  '🪈',
  // Music & sound
  '🎧',
  '🎼',
  '🎵',
  '🎶',
  '🎙️',
  '🎚️',
  '🎛️',
  '🔊',
  // Performance
  '🎭',
  '🎬',
  '🎪',
  // Nature & animals
  '🦋',
  '🦅',
  '🐉',
  '🦁',
  '🦊',
  '🐺',
  '🐸',
  '🐧',
  // Space & elements
  '🌙',
  '☀️',
  '⭐',
  '🌟',
  '✨',
  '🔥',
  '⚡',
  '🌈',
  '🌊',
  '🚀',
  // Fun & misc
  '💎',
  '🏆',
  '🎯',
  '🎮',
  '🕹️',
  '👾',
  '🤖',
  '💥',
  '🎃',
] as const;

export type AvatarOption = typeof AVATAR_OPTIONS[number];

export const DEFAULT_AVATAR: AvatarOption = AVATAR_OPTIONS[0];

export function isValidAvatar(value: string): value is AvatarOption {
  return AVATAR_OPTIONS.includes(value as AvatarOption);
}
