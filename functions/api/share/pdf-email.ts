/// <reference types="@cloudflare/workers-types" />
import { sendEmail } from '../../_helpers/email';
import { buildSongsPdfBase64 } from '../../_helpers/pdf';

interface Data extends Record<string, unknown> {
  userId?: string;
}

interface PdfSong {
  title: string;
  artist?: string;
  chordpro?: string;
}

export const onRequestPost: PagesFunction<Record<string, string>, never, Data> = async (ctx) => {
  const userId = ctx.data.userId;
  if (!userId) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await ctx.request.json<{
    recipientEmail: string;
    resourceType: string;
    resourceName: string;
    songs: PdfSong[];
    userEmail?: string;
  }>();

  if (!body.recipientEmail || !body.resourceType || !body.resourceName || !Array.isArray(body.songs)) {
    return Response.json({ error: 'Missing required fields.' }, { status: 400 });
  }

  try {
    const pdfBase64 = await buildSongsPdfBase64(body.resourceName, body.songs);

    await sendEmail({
      env: ctx.env,
      to: body.recipientEmail,
      subject: `${body.resourceName} PDF from Folio`,
      html: `
        <p>${body.userEmail ?? 'A collaborator'} sent you a PDF export from Folio.</p>
        <p>Resource: <strong>${body.resourceName}</strong></p>
      `,
      attachments: [
        {
          filename: `${body.resourceName.replace(/[^a-z0-9-_]+/gi, '-').toLowerCase() || 'folio-share'}.pdf`,
          content: pdfBase64,
        },
      ],
    });

    return Response.json({ ok: true });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : 'Failed to send PDF email.' },
      { status: 500 }
    );
  }
};
