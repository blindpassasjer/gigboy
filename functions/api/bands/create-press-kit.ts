/// <reference types="@cloudflare/workers-types" />
import { getFirestoreDocument, setFirestoreDocument, listFirestoreDocuments } from '../../_helpers/firebase-admin';
import { resolveBandHasProOrCrew } from '../../_helpers/band-limits';

const FREE_PRESS_KIT_LIMIT = 1;

interface Data extends Record<string, unknown> {
  userId?: string;
}

export const onRequestPost: PagesFunction<{ bandId: string }, never, Data> = async (ctx) => {
  try {
    const userId = ctx.data.userId;
    if (!userId) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await ctx.request.json<{ bandId?: string; name?: string }>();
    const bandId = body.bandId?.trim() || ctx.params.bandId;
    if (!bandId) {
      return Response.json({ error: 'Band ID is required.' }, { status: 400 });
    }

    const name = body.name?.trim() ?? '';

    if (!name) {
      return Response.json({ error: 'Press kit name is required.' }, { status: 400 });
    }

    if (name.length > 150) {
      return Response.json({ error: 'Press kit name must be 150 characters or fewer.' }, { status: 400 });
    }

    // Get band to check its plan
    const band = await getFirestoreDocument(ctx.env, ['bands', bandId]);
    if (!band) {
      return Response.json({ error: 'Band not found.' }, { status: 404 });
    }

    // Check if user is band owner or editor
    const isBandOwner = band.ownerId === userId;
    const isBandEditor = isBandOwner || (band.memberRoles?.[userId] === 'editor');
    if (!isBandEditor) {
      return Response.json({ error: 'You do not have permission to create press kits for this band.' }, { status: 403 });
    }

    // Free plan bands get one press kit; Pro/Crew get unlimited.
    const ownerId = typeof band.ownerId === 'string' ? band.ownerId : '';
    const hasProOrCrew = ownerId ? await resolveBandHasProOrCrew(ctx.env, ownerId, bandId) : false;
    if (!hasProOrCrew) {
      const existingKits = await listFirestoreDocuments(ctx.env, ['bands', bandId, 'pressKits']);
      if (existingKits.length >= FREE_PRESS_KIT_LIMIT) {
        return Response.json(
          { error: `This band has reached the ${FREE_PRESS_KIT_LIMIT}-press-kit limit for the Free plan. Upgrade to Pro or Crew for unlimited press kits.` },
          { status: 403 }
        );
      }
    }

    // Create the press kit
    const kitId = crypto.randomUUID();
    const now = new Date().toISOString();

    await setFirestoreDocument(ctx.env, ['bands', bandId, 'pressKits', kitId], {
      name: name.trim(),
      richText: '',
      imageIds: [],
      videoUrls: [],
      selectedVideoUrls: [],
      createdAt: now,
      createdBy: userId,
    });

    return Response.json({ ok: true, kitId });
  } catch (error) {
    console.error('Error creating press kit:', error);
    return Response.json(
      { error: error instanceof Error ? error.message : 'Failed to create press kit.' },
      { status: 500 }
    );
  }
};
