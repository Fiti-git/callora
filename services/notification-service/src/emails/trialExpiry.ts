import { wrapEmail, ctaButton, highlightBox } from "./_layout.js";

export function trialExpiryEmail(
  name: string,
  daysLeft: number,
  upgradeUrl: string
): { subject: string; html: string } {
  const safeName = name || "there";
  const dayWord = daysLeft === 1 ? "day" : "days";

  const subject =
    daysLeft === 1
      ? "Your Callora trial ends tomorrow"
      : `Your Callora trial ends in ${daysLeft} days`;

  const hero = `
    <tr>
      <td style="background:#0D0D0D; padding:48px 40px 40px; text-align:center;">
        <table cellpadding="0" cellspacing="0" border="0" style="margin:0 auto 16px;">
          <tr>
            <td style="width:56px; height:56px; background:rgba(255,255,255,0.15); border-radius:50%; text-align:center; vertical-align:middle;">
              <span style="font-size:28px; line-height:56px; display:block;">&#9203;</span>
            </td>
          </tr>
        </table>
        <h2 style="color:#fff;font-size:28px;font-weight:700;margin:0 0 12px;line-height:1.3;">
          Your trial ends in ${daysLeft} ${dayWord}
        </h2>
        <p style="color:rgba(255,255,255,0.85);font-size:15px;margin:0;line-height:1.6;">
          Upgrade now to keep your pipeline running without interruption.
        </p>
      </td>
    </tr>
  `;

  const loss = (title: string, desc: string) => `
    <tr>
      <td style="padding:8px 0; vertical-align:top;">
        <table cellpadding="0" cellspacing="0" border="0"><tr>
          <td style="width:32px; vertical-align:top;">
            <div style="width:26px; height:26px; border-radius:13px; background:#0D0D0D; color:#fff; font-weight:700; font-size:14px; text-align:center; line-height:26px;">
              &times;
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
          Hi ${safeName}, don't lose your momentum.
        </p>
        <p style="margin:0 0 24px;">
          Your Callora free trial ends soon. After it expires, you'll lose access to:
        </p>
        <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 8px;">
          ${loss("AI outbound calling", "All active and scheduled campaigns will be paused immediately.")}
          ${loss("Lead discovery & qualification", "Google Places scraping and Gemini AI scoring will stop.")}
          ${loss("Call transcripts & history", "Your existing data is safe, but new calls won't be logged.")}
        </table>
        ${highlightBox("Plans start at <strong>CA$99/month</strong>. No setup fees. Cancel anytime.")}
        <div style="text-align:center; margin:28px 0 16px;">
          ${ctaButton("Upgrade Now &rarr;", upgradeUrl)}
        </div>
        <p style="text-align:center; margin:0 0 24px;">
          <a href="${upgradeUrl}" style="color:#DC0014; font-size:14px; text-decoration:none;">View all plans</a>
        </p>
        <p style="margin:0; color:#888; font-size:13px; line-height:1.6; border-top:1px solid #EEE; padding-top:20px;">
          Need help deciding which plan is right for you? Reply to this email and we'll help you choose.
        </p>
      </td>
    </tr>
  `;

  return {
    subject,
    html: wrapEmail({ hero, body, includeUnsubscribe: true }),
  };
}
