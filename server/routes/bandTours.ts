import { tours } from '../db/schema.js';
import { buildBandCrudRouter } from './bandResources.js';
import { removeNullish } from '../lib/serialize.js';

type TourRow = typeof tours.$inferSelect;

export function toApi(row: TourRow) {
  return removeNullish({
    id: row.id,
    name: row.name,
    icon: row.icon,
    sortOrder: row.sortOrder,
    createdAt: row.createdAt?.toISOString(),
    updatedAt: row.updatedAt?.toISOString(),
  });
}

function fromBody(body: Record<string, unknown>, id: string, bandId: string) {
  return {
    id,
    bandId,
    name: typeof body.name === 'string' ? body.name : '',
    icon: (body.icon as string | undefined) ?? null,
    sortOrder: (body.sortOrder as number | undefined) ?? null,
    updatedAt: new Date(),
  };
}

export const bandToursRouter = buildBandCrudRouter({
  table: tours,
  idColumn: tours.id,
  bandIdColumn: tours.bandId,
  resourceKey: 'tour',
  pluralKey: 'tours',
  itemType: 'tour',
  toApi,
  fromBody,
});
