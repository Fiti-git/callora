import { Resend } from "resend";

const FROM = process.env.FROM_EMAIL ?? "Callora <onboarding@resend.dev>";
const APP_URL = process.env.APP_URL ?? "http://localhost:3000";

export const LOGO_DARK  = "https://ik.imagekit.io/z85ct1wzn/callora-logo-dark.png";
export const LOGO_LIGHT = "https://ik.imagekit.io/z85ct1wzn/callora-logo-light.png";
export const LOGO_ICON  = "https://ik.imagekit.io/z85ct1wzn/callora-logo-icon.png";

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
      console.warn("[email] Skipped — RESEND_API_KEY is not set");
      return;
    }
    const { data, error } = await client.emails.send({ from: FROM, to, subject, html });
    if (error) {
      console.error(`[email] Resend rejected to=${to} from=${FROM} subject="${subject}":`, error);
      return;
    }
    console.log(`[email] Sent to=${to} from=${FROM} subject="${subject}" id=${data?.id}`);
  } catch (err) {
    console.error(`[email] Send failed to=${to} from=${FROM} subject="${subject}":`, err);
  }
}
