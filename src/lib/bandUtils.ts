import type { Band, CollaborationPermission } from '../types';

/** Firestore/self-host-agnostic collection-style identifiers still used for band-scoped trash paths. */
export const BANDS_COLLECTION = 'bands';
export const BAND_SETLISTS_COLLECTION = 'setlists';

function readFirstNonEmptyString(...values: unknown[]) {
  for (const value of values) {
    if (typeof value === 'string' && value.trim().length > 0) {
      return value;
    }
  }
  return null;
}

export function compareBands(a: Band, b: Band) {
  const updatedAtA = a.updatedAt ?? a.createdAt;
  const updatedAtB = b.updatedAt ?? b.createdAt;
  if (updatedAtA !== updatedAtB) {
    return updatedAtB.localeCompare(updatedAtA);
  }
  return a.name.localeCompare(b.name);
}

export function mergeBandsById(primary: Band[], secondary: Band[]) {
  const merged = new Map<string, Band>();
  primary.forEach((band) => merged.set(band.id, band));
  secondary.forEach((band) => {
    if (!merged.has(band.id)) {
      merged.set(band.id, band);
    }
  });
  return Array.from(merged.values()).sort(compareBands);
}

export function normalizeBand(id: string, data: Record<string, unknown>): Band {
  const bandName = readFirstNonEmptyString(data.name, data.title) ?? 'Untitled band';

  return {
    id,
    name: bandName,
    description: typeof data.description === 'string' ? data.description : undefined,
    icon: typeof data.icon === 'string' ? data.icon : undefined,
    color: typeof data.color === 'string' ? data.color : undefined,
    logo: typeof data.logo === 'string' ? data.logo : undefined,
    logoStoragePath: typeof data.logoStoragePath === 'string' ? data.logoStoragePath : undefined,
    ownerId: typeof data.ownerId === 'string' ? data.ownerId : '',
    memberIds: Array.isArray(data.memberIds)
      ? data.memberIds.filter((entry): entry is string => typeof entry === 'string')
      : [],
    memberRoles: typeof data.memberRoles === 'object' && data.memberRoles !== null
      ? Object.fromEntries(
          Object.entries(data.memberRoles as Record<string, unknown>).filter(
            ([, role]) => role === 'viewer' || role === 'editor'
          )
        ) as Record<string, CollaborationPermission>
      : {},
    memberEmails: typeof data.memberEmails === 'object' && data.memberEmails !== null
      ? Object.fromEntries(
          Object.entries(data.memberEmails as Record<string, unknown>).filter(
            ([, email]) => typeof email === 'string'
          )
        ) as Record<string, string>
      : {},
    memberUsernames: typeof data.memberUsernames === 'object' && data.memberUsernames !== null
      ? Object.fromEntries(
          Object.entries(data.memberUsernames as Record<string, unknown>).filter(
            ([, username]) => typeof username === 'string'
          )
        ) as Record<string, string>
      : {},
    memberFullNames: typeof data.memberFullNames === 'object' && data.memberFullNames !== null
      ? Object.fromEntries(
          Object.entries(data.memberFullNames as Record<string, unknown>).filter(
            ([, fullName]) => typeof fullName === 'string'
          )
        ) as Record<string, string>
      : {},
    memberAvatars: typeof data.memberAvatars === 'object' && data.memberAvatars !== null
      ? Object.fromEntries(
          Object.entries(data.memberAvatars as Record<string, unknown>).filter(
            ([, avatar]) => typeof avatar === 'string'
          )
        ) as Record<string, string>
      : {},
    createdAt: typeof data.createdAt === 'string' ? data.createdAt : new Date(0).toISOString(),
    updatedAt: typeof data.updatedAt === 'string' ? data.updatedAt : undefined,
  };
}
