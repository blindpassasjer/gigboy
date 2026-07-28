type BandPublicResourceType = 'setlists' | 'stageplots' | 'riders';

function slugifyPublicSegment(value: string): string {
  const normalized = value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-');

  return normalized || 'band';
}

export function buildBandPublicShareUrl(
  origin: string,
  bandId: string,
  bandName: string,
  resourceType: BandPublicResourceType,
  resourceId: string
): string {
  return `${origin}/public/bands/${bandId}/${slugifyPublicSegment(bandName)}/${resourceType}/${resourceId}`;
}