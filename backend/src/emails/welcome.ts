import { APP_URL, wrapEmail, ctaButton, highlightBox } from "./_layout.js";

export function welcomeEmail(
  name: string,
  orgName: string,
  trialEndDate: Date | null
): { subject: string; html: string } {
  const safeName = name || "there";
  const formattedDate = trialEndDate
    ? new Date(trialEndDate).toLocaleDateString("en-US", {
        month: "long",
        day: "numeric",
        year: "numeric",
      })
    : "the end of your trial";

  const hero = `
    <tr>
      <td style="background:#DC0014; padding:48px 40px 40px; text-align:center;">
        <table cellpadding="0" cellspacing="0" border="0" style="margin:0 auto 16px;">
          <tr>
            <td style="width:56px; height:56px; background:rgba(255,255,255,0.15); border-radius:50%; text-align:center; vertical-align:middle;">
              <span style="font-size:28px; line-height:56px; display:block;">&#128075;</span>
            </td>
          </tr>
        </table>
        <h2 style="color:#fff;font-size:28px;font-weight:700;margin:0 0 12px;line-height:1.3;">
          Welcome to Callora, ${safeName}
        </h2>
        <p style="color:rgba(255,255,255,0.85);font-size:15px;margin:0;line-height:1.6;">
          Your AI-powered calling platform is ready.<br/>You have 14 days to explore everything — free.
        </p>
      </td>
    </tr>
  `;

  const step = (n: number, title: string, desc: string) => `
    <tr>
      <td style="padding:8px 0; vertical-align:top;">
        <table cellpadding="0" cellspacing="0" border="0"><tr>
          <td style="width:32px; vertical-align:top;">
            <div style="width:28px; height:28px; border-radius:14px; background:#DC0014; color:#fff; font-weight:700; font-size:13px; text-align:center; line-height:28px;">
              ${n}
            </div>
          </td>
          <td style="padding-left:14px;">
            <p style="margin:0 0 4px; color:#0D0D0D; font-weight:600; font-size:15px;">${title}</p>
            <p style="margin:0; color:#444; font-size:14px; line-height:1.6;">${desc}</p>
          </td>
        </tr></table>
      </td>
    </tr>
  `;

  const body = `
    <tr>
      <td style="padding:40px 40px 32px; color:#444; font-size:15px; line-height:1.7;">
        <p style="margin:0 0 12px; color:#0D0D0D; font-weight:600; font-size:17px;">
          Hi ${safeName}, you're all set.
        </p>
        <p style="margin:0 0 24px;">
          <strong>${orgName}</strong> is now live on Callora. Here's how to get your first qualified lead in the next 48 hours:
        </p>
        <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 8px;">
          ${step(1, "Connect your API keys", "Add your Google Maps, Gemini, and Vapi keys in Settings to unlock the full pipeline.")}
          ${step(2, "Create your first campaign", "Pick a business category, set a radius, and let Callora discover your leads automatically.")}
          ${step(3, "Launch and let the AI call", "Your AI agent calls, qualifies, and logs every conversation while you focus on closing.")}
        </table>
        ${highlightBox(`Your free trial ends on <strong>${formattedDate}</strong>. No credit card needed until then — explore everything.`)}
        <div style="text-align:center; margin:28px 0 16px;">
          ${ctaButton("Go to Dashboard &rarr;", `${APP_URL}/dashboard`)}
        </div>
        <p style="text-align:center; margin:0 0 24px;">
          <a href="${APP_URL}/settings" style="color:#DC0014; font-size:14px; text-decoration:none;">Connect API keys first</a>
        </p>
        <p style="margin:0; color:#888; font-size:13px; line-height:1.6; border-top:1px solid #EEE; padding-top:20px;">
          Questions? Just reply to this email — we're a small team and we actually read these.
        </p>
      </td>
    </tr>
  `;

  return {
    subject: `Welcome to Callora, ${safeName}`,
    html: wrapEmail({ hero, body, includeUnsubscribe: true }),
  };
}
