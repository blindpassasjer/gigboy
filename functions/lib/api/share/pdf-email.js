"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.onRequestPost = void 0;
/// <reference types="@cloudflare/workers-types" />
const email_1 = require("../../_helpers/email");
const pdf_1 = require("../../_helpers/pdf");
const onRequestPost = async (ctx) => {
    const userId = ctx.data.userId;
    if (!userId) {
        return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const body = await ctx.request.json();
    if (!body.recipientEmail || !body.resourceType || !body.resourceName || !Array.isArray(body.songs)) {
        return Response.json({ error: 'Missing required fields.' }, { status: 400 });
    }
    try {
        const pdfBase64 = await (0, pdf_1.buildSongsPdfBase64)(body.resourceName, body.songs);
        await (0, email_1.sendEmail)({
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
    }
    catch (error) {
        return Response.json({ error: error instanceof Error ? error.message : 'Failed to send PDF email.' }, { status: 500 });
    }
};
exports.onRequestPost = onRequestPost;
