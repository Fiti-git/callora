import { Resend } from "resend";

const FROM = process.env.FROM_EMAIL ?? "hello@callora.ai";
const APP_URL = process.env.APP_URL ?? "http://localhost:3000";

// CDN-hosted logo assets (ImageKit) — always accessible from email clients
export const LOGO_DARK  = "https://ik.imagekit.io/z85ct1wzn/callora-logo-dark.png";
export const LOGO_LIGHT = "https://ik.imagekit.io/z85ct1wzn/callora-logo-light.png";
export const LOGO_ICON  = "https://ik.imagekit.io/z85ct1wzn/callora-logo-icon.png";

// Lazy Resend client — constructing with an undefined key throws at module load.
let _resend: Resend | null = null;
function getResend(): Resend | null {
  if (_resend) return _resend;
  const key = process.env.RESEND_API_KEY;
  if (!key) return null;
  _resend = new Resend(key);
  return _resend;
}

export { FROM, APP_URL };

export async function sendEmail(to: string, subject: string, html: string): Promise<void> {
  try {
    const client = getResend();
    if (!client) {
      console.warn("Email skipped — RESEND_API_KEY is not set");
      return;
    }
    await client.emails.send({ from: FROM, to, subject, html });
  } catch (err) {
    console.error("Email send failed:", err);
    // Never throw — email failures must not crash the app
  }
}
