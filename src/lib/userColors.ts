// Deterministic color palette for user note-taking
// Each user gets a consistent color based on their UID hash
const COLOR_PALETTE = [
  '#ef4444', // red
  '#f97316', // orange
  '#eab308', // yellow
  '#22c55e', // green
  '#06b6d4', // cyan
  '#3b82f6', // blue
  '#8b5cf6', // violet
  '#ec4899', // pink
  '#d946ef', // magenta
  '#f43f5e', // rose
  '#84cc16', // lime
  '#06b6d4', // turquoise
];

export function getUserNoteColor(userId: string | null): string {
  if (!userId) return COLOR_PALETTE[0];
  
  // Simple hash of user ID to get a consistent index
  let hash = 0;
  for (let i = 0; i < userId.length; i++) {
    const char = userId.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  
  const index = Math.abs(hash) % COLOR_PALETTE.length;
  return COLOR_PALETTE[index];
}
