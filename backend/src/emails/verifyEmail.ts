import { wrapEmail, ctaButton, highlightBox } from "./_layout.js";

export function verifyEmailTemplate(
  name: string,
  verifyUrl: string
): { subject: string; html: string } {
  const safeName = name || "there";

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
          Verify your email
        </h2>
        <p style="color:rgba(255,255,255,0.85);font-size:15px;margin:0;line-height:1.6;">
          One quick click and your Callora account is live.
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
          Thanks for signing up. Verify your email address to unlock your dashboard and start your free trial.
        </p>
        <div style="text-align:center; margin:28px 0 16px;">
          ${ctaButton("Verify email &rarr;", verifyUrl)}
        </div>
        ${highlightBox(`This link expires in <strong>24 hours</strong>. If you didn't create a Callora account, you can safely ignore this email.`)}
        <p style="margin:24px 0 0; color:#888; font-size:13px; line-height:1.6;">
          Trouble with the button? Paste this link into your browser:<br/>
          <a href="${verifyUrl}" style="color:#DC0014; word-break:break-all;">${verifyUrl}</a>
        </p>
      </td>
    </tr>
  `;

  return {
    subject: "Verify your email — Callora",
    html: wrapEmail({ hero, body, includeUnsubscribe: false, transactionalNote: "This is a transactional email." }),
  };
}
