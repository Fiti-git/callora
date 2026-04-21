import { wrapEmail, ctaButton, highlightBox } from "./_layout.js";

export function passwordResetEmail(
  name: string,
  resetUrl: string
): { subject: string; html: string } {
  const safeName = name || "there";

  const hero = `
    <tr>
      <td style="background:#0D0D0D; padding:48px 40px 40px; text-align:center;">
        <table cellpadding="0" cellspacing="0" border="0" style="margin:0 auto 16px;">
          <tr>
            <td style="width:56px; height:56px; background:rgba(255,255,255,0.15); border-radius:50%; text-align:center; vertical-align:middle;">
              <span style="font-size:28px; line-height:56px; display:block;">&#128274;</span>
            </td>
          </tr>
        </table>
        <h2 style="color:#fff;font-size:28px;font-weight:700;margin:0 0 12px;line-height:1.3;">
          Reset your password
        </h2>
        <p style="color:rgba(255,255,255,0.85);font-size:15px;margin:0;line-height:1.6;">
          We received a request to reset your Callora password.
        </p>
      </td>
    </tr>
  `;

  const body = `
    <tr>
      <td style="padding:40px 40px 32px; color:#444; font-size:15px; line-height:1.7;">
        <p style="margin:0 0 12px; color:#0D0D0D; font-weight:600; font-size:17px;">
          Hi ${safeName},
        </p>
        <p style="margin:0 0 24px;">
          Click the button below to set a new password. This link is valid for <strong>1 hour</strong> and can only be used once.
        </p>
        <div style="text-align:center; margin:0 0 24px;">
          ${ctaButton("Reset Password &rarr;", resetUrl)}
        </div>
        ${highlightBox("If you didn't request a password reset, you can safely ignore this email. Your password will not change.")}
        <hr style="border:none; border-top:1px solid #EEE; margin:24px 0;"/>
        <p style="margin:0 0 6px; color:#888; font-size:12px;">
          Or copy this link into your browser:
        </p>
        <p style="margin:0; color:#888; font-size:12px; word-break:break-all;">
          ${resetUrl}
        </p>
      </td>
    </tr>
  `;

  return {
    subject: "Reset your Callora password",
    html: wrapEmail({
      hero,
      body,
      includeUnsubscribe: false,
      transactionalNote: "This is a transactional security email — you cannot unsubscribe from security emails.",
    }),
  };
}
