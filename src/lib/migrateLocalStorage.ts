/**
 * One-time migration of localStorage keys from the old brand names
 * (folio-*, songbook-*) to the new gigboy-* namespace.
 * Safe to run on every startup — skips keys that have already been migrated.
 */
export function migrateLocalStorageKeys(): void {
  if (typeof window === 'undefined') return;

  // Snapshot all keys before any mutations to avoid iteration issues
  const allKeys: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k !== null) allKeys.push(k);
  }

  // Simple 1-to-1 key renames
  const KEY_MIGRATIONS: [string, string][] = [
    ['folio-dark-mode', 'gigboy-dark-mode'],
    ['folio-folders', 'gigboy-folders'],
    ['folio-song-lists', 'gigboy-song-lists'],
    ['folio-all-songs-icon', 'gigboy-all-songs-icon'],
    ['folio-active-band-id', 'gigboy-active-band-id'],
    ['folio-sort-by', 'gigboy-sort-by'],
    ['folio-view-mode', 'gigboy-view-mode'],
    ['folio-local-songs', 'gigboy-local-songs'],
    ['songbook-setlists', 'gigboy-setlists'],
    ['songbook-active-setlist', 'gigboy-active-setlist'],
    ['songbook-technical-riders', 'gigboy-technical-riders'],
    ['songbook-active-technical-rider', 'gigboy-active-technical-rider'],
    ['songbook-stageplots', 'gigboy-stageplots'],
    ['songbook-active-stageplot', 'gigboy-active-stageplot'],
  ];

  for (const [oldKey, newKey] of KEY_MIGRATIONS) {
    if (!allKeys.includes(oldKey)) continue;
    const value = localStorage.getItem(oldKey);
    if (value !== null && localStorage.getItem(newKey) === null) {
      localStorage.setItem(newKey, value);
    }
    localStorage.removeItem(oldKey);
  }

  // Prefix-based renames (e.g. folio-bands-migration:<marker>:<uid>)
  const PREFIX_MIGRATIONS: [string, string][] = [
    ['folio-bands-migration:', 'gigboy-bands-migration:'],
    ['folio-seen-accepted-invites:', 'gigboy-seen-accepted-invites:'],
  ];

  for (const key of allKeys) {
    for (const [oldPrefix, newPrefix] of PREFIX_MIGRATIONS) {
      if (key.startsWith(oldPrefix)) {
        const newKey = newPrefix + key.slice(oldPrefix.length);
        const value = localStorage.getItem(key);
        if (value !== null && localStorage.getItem(newKey) === null) {
          localStorage.setItem(newKey, value);
        }
        localStorage.removeItem(key);
      }
    }
  }
}
