import nodemailer from 'nodemailer';
import { config } from '../config/index.js';

export async function sendPasswordResetEmail(email: string, token: string): Promise<void> {
  if (!config.smtpHost || !config.smtpUser || !config.smtpPassword) {
    throw new Error('Password reset email is not configured. Set the SMTP environment variables.');
  }

  const transporter = nodemailer.createTransport({
    host: config.smtpHost,
    port: config.smtpPort,
    secure: config.smtpSecure,
    auth: { user: config.smtpUser, pass: config.smtpPassword },
  });

  const resetUrl = `${config.passwordResetUrl}?token=${encodeURIComponent(token)}`;
  await transporter.sendMail({
    from: config.smtpFrom,
    to: email,
    subject: 'Reset your Ledger password',
    text: `Use this link to reset your Ledger password: ${resetUrl}\n\nThis link expires in one hour.`,
  });
}
