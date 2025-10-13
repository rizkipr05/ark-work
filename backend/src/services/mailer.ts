import nodemailer from 'nodemailer';

const SMTP_HOST = process.env.SMTP_HOST || 'smtp.gmail.com';
const SMTP_PORT = Number(process.env.SMTP_PORT || 465);
const SMTP_SECURE = (process.env.SMTP_SECURE ?? 'true') === 'true'; // 465 = true
const SMTP_USER = process.env.SMTP_USER || '';
const SMTP_PASS = process.env.SMTP_PASS || '';
const MAIL_FROM = process.env.MAIL_FROM || `ArkWork <${SMTP_USER}>`;

if (!SMTP_USER || !SMTP_PASS) {
  console.warn('[mailer] SMTP_USER/SMTP_PASS kosong. Email tidak bisa terkirim.');
}

export const mailer = nodemailer.createTransport({
  host: SMTP_HOST,
  port: SMTP_PORT,
  secure: SMTP_SECURE,
  auth: { user: SMTP_USER, pass: SMTP_PASS },
});

export async function sendMail(to: string | string[], subject: string, html: string) {
  if (!SMTP_USER || !SMTP_PASS) {
    console.log('[mailer] (DRY-RUN) ->', { to, subject });
    return;
  }
  await mailer.sendMail({
    from: MAIL_FROM,
    to,
    subject,
    html,
  });
}
