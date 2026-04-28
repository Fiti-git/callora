import nodemailer, { type Transporter } from "nodemailer";

const FROM = process.env.EMAIL_FROM ?? "Callora <noreply@callora.ai>";
const APP_URL = process.env.APP_URL ?? "http://localhost:3000";

export const LOGO_DARK = "https://ik.imagekit.io/z85ct1wzn/callora-logo-dark.png";
export const LOGO_LIGHT = "https://ik.imagekit.io/z85ct1wzn/callora-logo-light.png";
export const LOGO_ICON = "https://ik.imagekit.io/z85ct1wzn/callora-logo-icon.png";

export { FROM, APP_URL };

let _transporter: Transporter | null = null;
function getTransporter(): Transporter | null {
  if (_transporter) return _transporter;
  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT ?? 587);
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  if (!host) return null;
  _transporter = nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: user && pass ? { user, pass } : undefined,
  });
  return _transporter;
}

export async function sendEmail(args: {
  to: string;
  subject: string;
  html: string;
}): Promise<void> {
  const { to, subject, html } = args;
  try {
    const transporter = getTransporter();
    if (!transporter) {
      console.warn("[email] Skipped — SMTP_HOST is not set");
      return;
    }
    const info = await transporter.sendMail({ from: FROM, to, subject, html });
    console.log(`[email] Sent to=${to} from=${FROM} subject="${subject}" id=${info.messageId}`);
  } catch (err) {
    console.error(`[email] Send failed to=${to} from=${FROM} subject="${subject}":`, err);
    throw err;
  }
}
