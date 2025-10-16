// backend/src/lib/mailer.ts
import nodemailer from 'nodemailer';

const SMTP_HOST = process.env.SMTP_HOST || '';
const SMTP_PORT = Number(process.env.SMTP_PORT || 587);
const SMTP_USER = process.env.SMTP_USER || '';
const SMTP_PASS = process.env.SMTP_PASS || '';
const SMTP_FROM = process.env.SMTP_FROM || '"ArkWork Billing" <no-reply@arkwork.app>';

if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS) {
  console.warn('[mailer] SMTP env not fully set. Emails will likely fail.');
}

export const transporter = nodemailer.createTransport({
  host: SMTP_HOST,
  port: SMTP_PORT,
  secure: SMTP_PORT === 465,
  auth: { user: SMTP_USER, pass: SMTP_PASS },
});

export async function sendEmail(
  to: string | string[],
  subject: string,
  html?: string,
  text?: string
) {
  const toHeader = Array.isArray(to) ? to.join(',') : to;
  const info = await transporter.sendMail({
    from: SMTP_FROM,
    to: toHeader,
    subject,
    text,
    html,
  });
  return info;
}
