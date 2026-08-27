import { Router } from 'express';

/**
 * Public, unauthenticated instance metadata the SPA needs before login — currently just
 * the operator details the legal pages (Terms/Privacy) interpolate. Every value is
 * optional: when the corresponding env var is unset the field is null and the client
 * falls back to generic "the operator of this Gigboy instance" wording.
 */
export const configRouter = Router();

function trimmedEnv(name: string): string | null {
  const value = process.env[name];
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

configRouter.get('/', (_req, res) => {
  res.json({
    operatorName: trimmedEnv('OPERATOR_NAME'),
    operatorContactEmail: trimmedEnv('OPERATOR_CONTACT_EMAIL'),
    operatorJurisdiction: trimmedEnv('OPERATOR_JURISDICTION'),
  });
});
