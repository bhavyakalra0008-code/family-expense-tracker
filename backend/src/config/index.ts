import dotenv from 'dotenv';
dotenv.config();

/**
 * Requires a non-empty environment variable.
 * Fails fast with a clear error message without revealing the value.
 * This prevents silent fallback to insecure hardcoded secrets in production.
 */
function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value || value.trim() === '') {
    throw new Error(
      `[Config] Required environment variable "${name}" is not set. ` +
      `Ensure your .env file is present for local development, ` +
      `or that this variable is provided via AWS Secrets Manager / SSM Parameter Store in production.`
    );
  }
  return value.trim();
}

export const config = {
  port: parseInt(process.env.PORT || '4000', 10),
  nodeEnv: process.env.NODE_ENV || 'development',

  // Required — will throw on startup if missing
  databaseUrl: requireEnv('DATABASE_URL'),
  jwtSecret: requireEnv('JWT_SECRET'),

  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '7d',

  // CORS origin defaults to localhost for local dev; override in production
  corsOrigin: process.env.CORS_ORIGIN || 'http://localhost:4000',

  // SMTP configuration — all optional; email features disabled if not configured
  smtpHost: process.env.SMTP_HOST || '',
  smtpPort: parseInt(process.env.SMTP_PORT || '587', 10),
  smtpSecure: process.env.SMTP_SECURE === 'true',
  smtpUser: process.env.SMTP_USER || '',
  smtpPassword: process.env.SMTP_PASSWORD || '',
  smtpFrom: process.env.SMTP_FROM || 'Ledger <no-reply@example.com>',
  passwordResetUrl: process.env.PASSWORD_RESET_URL || 'http://localhost:4000/reset-password',
};
