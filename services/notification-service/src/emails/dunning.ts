import { wrapEmail, ctaButton, highlightBox } from "./_layout.js";

export type DunningEmailKey =
  | "DUNNING_DAY_0_FAILED"
  | "DUNNING_DAY_3_RETRY_FAILED"
  | "DUNNING_DAY_7_FINAL_WARNING"
  | "DUNNING_DAY_10_SUSPENDED"
  | "DUNNING_DAY_30_CANCELED"
  | "DUNNING_RECOVERED";

interface Params {
  name: string;
  billingUrl: string;
  amountFormatted?: string;
}

export function subjectFor(key: DunningEmailKey): string {
  switch (key) {
    case "DUNNING_DAY_0_FAILED":
      return "Action required: your Callora payment failed";
    case "DUNNING_DAY_3_RETRY_FAILED":
      return "We tried again - your Callora payment is still failing";
    case "DUNNING_DAY_7_FINAL_WARNING":
      return "Final warning: your Callora account will be suspended in 3 days";
    case "DUNNING_DAY_10_SUSPENDED":
      return "Your Callora account has been suspended";
    case "DUNNING_DAY_30_CANCELED":
      return "Your Callora subscription has been canceled";
    case "DUNNING_RECOVERED":
      return "Payment received - your Callora account is active";
  }
}

export function dunningEmail(
  key: DunningEmailKey,
  params: Params
): { subject: string; html: string } {
  const safeName = params.name || "there";
  const subject = subjectFor(key);

  const intro: Record<DunningEmailKey, string> = {
    DUNNING_DAY_0_FAILED:
      "We couldn't process your latest Callora subscription payment. We'll automatically retry the charge in 3 days. Update your payment method now to avoid any service interruption.",
    DUNNING_DAY_3_RETRY_FAILED:
      "Our retry of your Callora subscription payment failed again. We'll attempt one more retry in 4 days. Please update your payment method as soon as possible.",
    DUNNING_DAY_7_FINAL_WARNING:
      "We've been unable to collect payment for your Callora subscription. If this isn't resolved within 3 days, your account will be suspended and outbound calling will stop.",
    DUNNING_DAY_10_SUSPENDED:
      "Your Callora account has been suspended due to non-payment. Active campaigns are paused and outbound calling has stopped. You have 20 days to restore the account before it's permanently canceled.",
    DUNNING_DAY_30_CANCELED:
      "Your Callora subscription has been canceled because the failed payment was not resolved in time. We've kept your data so you can return - re-subscribe any time to restore access.",
    DUNNING_RECOVERED:
      "Good news - your payment came through. Your Callora account is active again and any paused campaigns can be resumed.",
  };

  const ctaLabel: Record<DunningEmailKey, string> = {
    DUNNING_DAY_0_FAILED: "Update Payment Method",
    DUNNING_DAY_3_RETRY_FAILED: "Update Payment Method",
    DUNNING_DAY_7_FINAL_WARNING: "Resolve Payment Now",
    DUNNING_DAY_10_SUSPENDED: "Restore My Account",
    DUNNING_DAY_30_CANCELED: "Re-subscribe",
    DUNNING_RECOVERED: "Open Dashboard",
  };

  const hero = `
    <tr>
      <td style="background:#0D0D0D; padding:48px 40px 40px; text-align:center;">
        <h2 style="color:#fff;font-size:26px;font-weight:700;margin:0 0 12px;line-height:1.3;">
          ${subject}
        </h2>
      </td>
    </tr>
  `;

  const amountLine = params.amountFormatted
    ? `<p style="margin:0 0 16px; color:#444;">Amount due: <strong>${params.amountFormatted}</strong></p>`
    : "";

  const body = `
    <tr>
      <td style="padding:40px 40px 32px; color:#444; font-size:15px; line-height:1.7;">
        <p style="margin:0 0 12px; color:#0D0D0D; font-weight:600; font-size:17px;">
          Hi ${safeName},
        </p>
        <p style="margin:0 0 16px;">${intro[key]}</p>
        ${amountLine}
        ${
          key === "DUNNING_RECOVERED"
            ? highlightBox("No further action needed. Your account is fully active.")
            : highlightBox(
                "Updating your payment method takes less than a minute via our secure Stripe portal."
              )
        }
        <div style="text-align:center; margin:28px 0 16px;">
          ${ctaButton(`${ctaLabel[key]} &rarr;`, params.billingUrl)}
        </div>
      </td>
    </tr>
  `;

  return {
    subject,
    html: wrapEmail({ hero, body, includeUnsubscribe: true }),
  };
}
