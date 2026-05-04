/**
 * One-time migration of localStorage keys from the old brand names
 * (folio-*, songbook-*) to the new gigboi-* namespace.
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
    ['folio-dark-mode', 'gigboi-dark-mode'],
    ['folio-folders', 'gigboi-folders'],
    ['folio-song-lists', 'gigboi-song-lists'],
    ['folio-all-songs-icon', 'gigboi-all-songs-icon'],
    ['folio-active-band-id', 'gigboi-active-band-id'],
    ['folio-sort-by', 'gigboi-sort-by'],
    ['folio-view-mode', 'gigboi-view-mode'],
    ['folio-local-songs', 'gigboi-local-songs'],
    ['songbook-setlists', 'gigboi-setlists'],
    ['songbook-active-setlist', 'gigboi-active-setlist'],
    ['songbook-technical-riders', 'gigboi-technical-riders'],
    ['songbook-active-technical-rider', 'gigboi-active-technical-rider'],
    ['songbook-stageplots', 'gigboi-stageplots'],
    ['songbook-active-stageplot', 'gigboi-active-stageplot'],
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
    ['folio-bands-migration:', 'gigboi-bands-migration:'],
    ['folio-seen-accepted-invites:', 'gigboi-seen-accepted-invites:'],
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
