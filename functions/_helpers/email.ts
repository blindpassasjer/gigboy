/// <reference types="@cloudflare/workers-types" />

interface EmailAttachment {
  filename: string;
  content: string;
}

interface SendEmailParams {
  env: Record<string, string | undefined>;
  to: string;
  subject: string;
  html: string;
  attachments?: EmailAttachment[];
}

export async function sendEmail(params: SendEmailParams) {
  const { env, to, subject, html, attachments } = params;

  const apiKey = env.RESEND_API_KEY;
  const from = env.RESEND_FROM_EMAIL;
  if (!apiKey || !from) {
    throw new Error('Email provider is not configured. Set RESEND_API_KEY and RESEND_FROM_EMAIL.');
  }

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from,
      to: [to],
      subject,
      html,
      attachments,
    }),
  });

  if (!response.ok) {
    const details = await response.text();
    throw new Error(`Email provider failed: ${details}`);
  }
}
