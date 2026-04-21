import { wrapEmail, ctaButton } from "./_layout.js";

export function qualifiedLeadEmail(
  adminName: string,
  lead: { businessName: string; phone: string; interestScore: number },
  campaignName: string,
  leadUrl: string
): { subject: string; html: string } {
  const safeName = adminName || "there";

  const hero = `
    <tr>
      <td style="background:#DC0014; padding:48px 40px 40px; text-align:center;">
        <table cellpadding="0" cellspacing="0" border="0" style="margin:0 auto 16px;">
          <tr>
            <td style="width:56px; height:56px; background:rgba(255,255,255,0.15); border-radius:50%; text-align:center; vertical-align:middle;">
              <span style="font-size:28px; line-height:56px; display:block;">&#11088;</span>
            </td>
          </tr>
        </table>
        <h2 style="color:#fff;font-size:28px;font-weight:700;margin:0 0 12px;line-height:1.3;">
          New Qualified Lead
        </h2>
        <p style="color:rgba(255,255,255,0.85);font-size:15px;margin:0;line-height:1.6;">
          Callora just identified a prospect worth your attention.
        </p>
      </td>
    </tr>
  `;

  const body = `
    <tr>
      <td style="padding:40px 40px 32px; color:#444; font-size:15px; line-height:1.7;">
        <p style="margin:0 0 12px; color:#0D0D0D; font-weight:600; font-size:17px;">
          Hi ${safeName}, your AI caller found a match.
        </p>
        <p style="margin:0 0 24px;">
          A business scored highly on your qualification criteria during the <strong>${campaignName}</strong> campaign. Here are the details:
        </p>
        <div style="background:#0D0D0D; border-radius:8px; padding:24px; margin:0 0 24px;">
          <p style="margin:0 0 12px; color:#FFFFFF; font-size:20px; font-weight:700;">
            ${lead.businessName}
          </p>
          <p style="margin:0 0 16px; color:#aaa; font-size:14px;">
            <span style="vertical-align:middle; margin-right:6px;">&#128222;</span>
            ${lead.phone}
          </p>
          <table cellpadding="0" cellspacing="0" border="0" style="margin:0 0 16px;">
            <tr>
              <td style="background:#DC0014; border-radius:20px; padding:4px 12px;">
                <span style="color:#FFFFFF; font-size:13px; font-weight:700;">Score: ${lead.interestScore}/100</span>
              </td>
              <td style="padding-left:12px; color:#888; font-size:14px;">Highly interested</td>
            </tr>
          </table>
          <div style="border-top:1px solid #222; padding-top:12px; margin-top:4px;">
            <span style="color:#888; font-size:13px;">Campaign: </span>
            <span style="color:#DC0014; font-size:13px; font-weight:600;">${campaignName}</span>
          </div>
        </div>
        <p style="margin:0 0 28px;">
          The full call transcript, AI summary, and contact details are waiting for you in the dashboard. Strike while it's hot.
        </p>
        <div style="text-align:center; margin:0 0 20px;">
          ${ctaButton("View Lead &amp; Transcript &rarr;", leadUrl)}
        </div>
        <p style="margin:24px 0 0; color:#888; font-size:12px; line-height:1.6; border-top:1px solid #EEE; padding-top:20px;">
          This alert was triggered because the lead scored &ge; 60/100. You can adjust your qualification threshold in campaign settings.
        </p>
      </td>
    </tr>
  `;

  return {
    subject: `New qualified lead: ${lead.businessName}`,
    html: wrapEmail({ hero, body, includeUnsubscribe: true }),
  };
}
