import { APP_URL } from "../lib/email.js";

export { APP_URL };

function header(): string {
  return `
    <tr>
      <td style="background:#0D0D0D; padding:16px 40px;">
        <img
          src="https://ik.imagekit.io/z85ct1wzn/callora-logo-dark.png"
          alt="Callora"
          width="160"
          style="display:block; height:auto; width:160px; border:0;"
        />
      </td>
    </tr>
  `;
}

function footer(includeUnsubscribe: boolean, transactionalNote?: string): string {
  const unsubLink = includeUnsubscribe
    ? `<a href="#" style="color:#666; font-size:12px; text-decoration:none; margin:0 8px;">Unsubscribe</a>`
    : "";
  const note = transactionalNote
    ? `<p style="color:#666; font-size:12px; margin:8px 0 0; line-height:1.6;">${transactionalNote}</p>`
    : "";
  return `
    <tr>
      <td style="background:#0D0D0D; padding:28px 40px; text-align:center;">
        <p style="color:#DC0014; font-size:13px; font-weight:700; margin:0 0 10px;">
          Callora by Redot Global
        </p>
        <p style="margin:0 0 10px;">
          <a href="${APP_URL}/terms" style="color:#666; font-size:12px; text-decoration:none; margin:0 8px;">Terms</a>
          <a href="${APP_URL}/privacy" style="color:#666; font-size:12px; text-decoration:none; margin:0 8px;">Privacy</a>
          ${unsubLink}
        </p>
        <p style="color:#444; font-size:12px; margin:0; line-height:1.6;">
          &copy; ${new Date().getFullYear()} Redot Global. All rights reserved.
        </p>
        ${note}
      </td>
    </tr>
  `;
}

export function wrapEmail(options: {
  hero: string;
  body: string;
  includeUnsubscribe?: boolean;
  transactionalNote?: string;
}): string {
  const { hero, body, includeUnsubscribe = false, transactionalNote } = options;
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
</head>
<body style="margin:0; padding:0; background:#F0F0F0; font-family:Arial,Helvetica,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" border="0">
    <tr>
      <td align="center" style="padding:40px 20px;">
        <table width="600" cellpadding="0" cellspacing="0" border="0"
               style="background:#ffffff; border-radius:8px; overflow:hidden;
                      box-shadow:0 4px 32px rgba(0,0,0,0.10); max-width:600px; width:100%;">
          ${header()}
          ${hero}
          ${body}
          ${footer(includeUnsubscribe, transactionalNote)}
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

export function ctaButton(label: string, url: string): string {
  return `
    <table cellpadding="0" cellspacing="0" border="0" style="margin:0 auto;">
      <tr>
        <td style="background:#DC0014; border-radius:6px;">
          <a href="${url}" style="display:inline-block; color:#FFFFFF; text-decoration:none; padding:14px 36px; font-weight:700; font-family:Arial,Helvetica,sans-serif; font-size:15px;">
            ${label}
          </a>
        </td>
      </tr>
    </table>
  `;
}

export function highlightBox(htmlContent: string): string {
  return `
    <div style="background:#FFF5F5; border-left:3px solid #DC0014; padding:16px 20px; margin:24px 0; border-radius:4px;">
      <p style="margin:0; color:#444; font-size:14px; line-height:1.6;">${htmlContent}</p>
    </div>
  `;
}
