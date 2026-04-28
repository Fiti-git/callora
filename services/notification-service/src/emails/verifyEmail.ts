import { wrapEmail, ctaButton, highlightBox } from "./_layout.js";

export function verifyEmail(
  data: { name?: string; verifyUrl: string }
): { subject: string; html: string } {
  const safeName = (data?.name && data.name.trim()) || "there";
  const verifyUrl = data?.verifyUrl ?? "";

  const hero = `
    <tr>
      <td style="background:#DC0014; padding:48px 40px 40px; text-align:center;">
        <table cellpadding="0" cellspacing="0" border="0" style="margin:0 auto 16px;">
          <tr>
            <td style="width:56px; height:56px; background:rgba(255,255,255,0.15); border-radius:50%; text-align:center; vertical-align:middle;">
              <span style="font-size:28px; line-height:56px; display:block;">&#9993;</span>
            </td>
          </tr>
        </table>
        <h2 style="color:#fff;font-size:28px;font-weight:700;margin:0 0 12px;line-height:1.3;">
          Verify your Callora email
        </h2>
        <p style="color:rgba(255,255,255,0.85);font-size:15px;margin:0;line-height:1.6;">
          One quick click and you're in.
        </p>
      </td>
    </tr>
  `;

  const body = `
    <tr>
      <td style="padding:40px 40px 32px; color:#444; font-size:15px; line-height:1.7;">
        <p style="margin:0 0 12px; color:#0D0D0D; font-weight:600; font-size:17px;">
          Hi ${escapeHtml(safeName)},
        </p>
        <p style="margin:0 0 24px;">
          Welcome to <strong>Callora</strong>! Tap the button below to confirm your email
          address and finish setting up your account.
        </p>
        <div style="text-align:center; margin:0 0 24px;">
          ${ctaButton("Verify Email", verifyUrl)}
        </div>
        ${highlightBox(`This link expires in <strong>24 hours</strong>. If it expires, you can request a new one from the app.`)}
        <p style="margin:24px 0 0; color:#888; font-size:13px; line-height:1.6; border-top:1px solid #EEE; padding-top:20px;">
          If you didn't sign up for Callora, you can safely ignore this email — no account will be activated.
        </p>
      </td>
    </tr>
  `;

  return {
    subject: "Verify your Callora account",
    html: wrapEmail({ hero, body, includeUnsubscribe: false }),
  };
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" }[c]!)
  );
}
