# Callora — Phase 1 Implementation: Tasks 3–8

> **For Claude Code:** Tasks 1 and 2 are already complete. Start from Task 3.
> Work through tasks in order. Do not skip ahead.
> Run `npx prisma migrate dev` after any schema change.

---

## Prerequisites — Install First

### Backend (`cd backend`)
```bash
npm install resend
```

### Frontend (`cd frontend`)
```bash
npm install papaparse
npm install -D @types/papaparse
```

---

## Environment Variables to Add to `backend/.env`

```
RESEND_API_KEY=re_xxxxxxxxxxxx
FROM_EMAIL=hello@callora.ai
APP_URL=http://localhost:3000
```

---

## Database Schema Change

Add `PasswordResetToken` model to `backend/prisma/schema.prisma`:

```prisma
model PasswordResetToken {
  id        String   @id @default(cuid())
  userId    String
  token     String   @unique
  expiresAt DateTime
  used      Boolean  @default(false)
  createdAt DateTime @default(now())
  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)
}
```

Add the relation back on the `User` model:
```prisma
passwordResetTokens PasswordResetToken[]
```

**Run after schema changes:**
```bash
cd backend && npx prisma migrate dev --name "add_password_reset_token"
```

---

---

# TASK 3 — Fix the CSV Parser

## Step 3.1 — Rewrite `frontend/src/components/csv-import.tsx` — `parseCSV` function

Replace the existing naive split-on-comma logic entirely with PapaParse:

```typescript
import Papa from "papaparse";

function parseCSV(text: string): ParsedLead[] {
  const result = Papa.parse(text, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h: string) => h.trim().toLowerCase(),
  });

  return (result.data as any[]).map((row) => {
    const rawPhone =
      row.phone ?? row.number ?? row.mobile ?? row.tel ??
      row["phone number"] ?? row["mobile number"] ?? "";
    const rawName =
      row.name ?? row["business name"] ?? row.company ??
      row["company name"] ?? row.business ?? "";
    return {
      phone: normalizePhone(rawPhone),
      name: rawName.trim(),
    };
  }).filter(lead => lead.phone.length >= 7 && lead.name.length > 0);
}

function normalizePhone(raw: string): string {
  let digits = raw.toString().replace(/[^\d+]/g, "");
  if (digits.startsWith("+1")) digits = digits.slice(2);
  else if (digits.startsWith("1") && digits.length === 11) digits = digits.slice(1);
  return digits;
}
```

Update column validation to accept all recognized column name variants (`phone`, `number`, `mobile`, `tel`, `phone number`, `mobile number`) before showing a missing-column error.

## Step 3.2 — Modify `backend/src/routes/campaigns.ts` — POST `/:id/import`

Add backend phone normalization (defense in depth):

```typescript
function normalizePhone(raw: string): string {
  let digits = raw.replace(/[^\d+]/g, "");
  if (digits.startsWith("+1")) digits = digits.slice(2);
  else if (digits.startsWith("1") && digits.length === 11) digits = digits.slice(1);
  return digits;
}
```

Wrap the lead insert loop in a `prisma.$transaction()`. Skip leads where normalized phone is empty or under 7 digits. Normalize phone before the duplicate check.

---

---

# TASK 4 — Close Quota Enforcement Gaps

## Step 4.1 — Modify `backend/src/routes/demo.ts` — POST `/call`

Add quota check before making the demo call:

```typescript
await assertWithinQuota(organizationId, "call");
// ... existing call logic ...
await recordUsage(organizationId, "call", 1);
```

Catch `assertWithinQuota` errors and return them with their status code (429).

## Step 4.2 — Modify `backend/src/routes/campaigns.ts` — POST `/:id/scrape`

After the Places API returns leads, before inserting:

```typescript
const discoveredLeads = await places.searchBusinesses(prompt, apiKey);
await assertWithinQuota(organizationId, "lead", discoveredLeads.length);
// ... insert leads ...
await recordUsage(organizationId, "lead", discoveredLeads.length);
```

---

---

# TASK 5 — Email System with Resend

## Step 5.1 — Create `backend/src/lib/email.ts`

```typescript
import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);
const FROM = process.env.FROM_EMAIL ?? "hello@callora.ai";
const APP_URL = process.env.APP_URL ?? "http://localhost:3000";

export { resend, FROM, APP_URL };

export async function sendEmail(to: string, subject: string, html: string): Promise<void> {
  try {
    await resend.emails.send({ from: FROM, to, subject, html });
  } catch (err) {
    console.error("Email send failed:", err);
    // Never throw — email failures must not crash the app
  }
}
```

---

## Step 5.2 — Email Template Design System

All email templates follow this exact structure and design. Implement as TypeScript functions that return `{ subject: string, html: string }`.

### Design Tokens
```
Background (page):   #F0F0F0
Email card:          #FFFFFF, border-radius: 8px
Header bg:           #0D0D0D
Hero bg (primary):   #DC0014
Hero bg (dark):      #0D0D0D
Body text:           #444444
Lead text:           #0D0D0D, font-weight: 600
Muted text:          #888888
Red accent:          #DC0014
CTA button:          #DC0014, color: #FFFFFF, padding: 14px 36px, border-radius: 6px
Highlight box bg:    #FFF5F5, border-left: 3px solid #DC0014
Dark card bg:        #0D0D0D
Footer bg:           #0D0D0D
Font stack:          Arial, Helvetica, sans-serif
```

### Shared Header Block (use in ALL 4 emails)

The header uses the Callora logo image hosted at a publicly accessible URL. Until the production URL is available, reference it as `${APP_URL}/brand/callora-logo-dark.png`. The header background is `#0D0D0D` — the dark logo blends seamlessly.

```html
<!-- HEADER -->
<tr>
  <td style="background:#0D0D0D; padding:8px 40px;">
    <img
      src="${APP_URL}/brand/callora-logo-dark.png"
      alt="Callora"
      width="200"
      style="display:block; height:auto; width:200px;"
    />
  </td>
</tr>
```

### Shared Footer Block (use in ALL 4 emails)

```html
<!-- FOOTER -->
<tr>
  <td style="background:#0D0D0D; padding:28px 40px; text-align:center;">
    <p style="color:#DC0014; font-size:13px; font-weight:700; margin:0 0 10px;">
      Callora by Redot Global
    </p>
    <p style="margin:0 0 10px;">
      <a href="${APP_URL}/terms" style="color:#666; font-size:12px; text-decoration:none; margin:0 8px;">Terms</a>
      <a href="${APP_URL}/privacy" style="color:#666; font-size:12px; text-decoration:none; margin:0 8px;">Privacy</a>
      ${includeUnsubscribe ? `<a href="#" style="color:#666; font-size:12px; text-decoration:none; margin:0 8px;">Unsubscribe</a>` : ''}
    </p>
    <p style="color:#444; font-size:12px; margin:0; line-height:1.6;">
      © ${new Date().getFullYear()} Redot Global. All rights reserved.
    </p>
  </td>
</tr>
```

### Shared HTML Wrapper (use in ALL 4 emails)

```html
<!DOCTYPE html>
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
          <!-- HEADER goes here -->
          <!-- HERO goes here -->
          <!-- BODY goes here -->
          <!-- FOOTER goes here -->
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
```

---

## Step 5.3 — Create `backend/src/emails/welcome.ts`

**Export:** `welcomeEmail(name: string, orgName: string, trialEndDate: Date): { subject: string, html: string }`

**Subject:** `"Welcome to Callora, ${name}"`

**Hero section** (red `#DC0014` background):
```html
<tr>
  <td style="background:#DC0014; padding:48px 40px 40px; text-align:center;">
    <!-- Microphone/signal icon SVG (white, 40x40) -->
    <svg width="40" height="40" viewBox="0 0 40 40" fill="none" style="display:block;margin:0 auto 16px;">
      <circle cx="20" cy="20" r="19" stroke="rgba(255,255,255,0.3)" stroke-width="1.5"/>
      <path d="M13 20.5C13 16.36 16.36 13 20.5 13C24.64 13 28 16.36 28 20.5"
            stroke="white" stroke-width="2" stroke-linecap="round"/>
      <circle cx="20.5" cy="20.5" r="3" fill="white"/>
      <rect x="14" y="22" width="3" height="6" rx="1.5" fill="white"/>
      <rect x="24" y="22" width="3" height="6" rx="1.5" fill="white"/>
    </svg>
    <h2 style="color:#fff;font-size:28px;font-weight:700;margin:0 0 12px;line-height:1.3;">
      Welcome to Callora, ${name}
    </h2>
    <p style="color:rgba(255,255,255,0.85);font-size:15px;margin:0;line-height:1.6;">
      Your AI-powered calling platform is ready.<br/>You have 14 days to explore everything — free.
    </p>
  </td>
</tr>
```

**Body section:**
- Greeting: `Hi ${name}, you're all set.`
- Intro: `${orgName} is now live on Callora. Here's how to get your first qualified lead in the next 48 hours:`
- 3 numbered steps (red circle number badges):
  1. **Connect your API keys** — Add your Google Maps, Gemini, and Vapi keys in Settings to unlock the full pipeline.
  2. **Create your first campaign** — Pick a business category, set a radius, and let Callora discover your leads automatically.
  3. **Launch and let the AI call** — Your AI agent calls, qualifies, and logs every conversation while you focus on closing.
- Highlight box: `Your free trial ends on **${formattedDate}**. No credit card needed until then — explore everything.`
- Primary CTA button: `Go to Dashboard →` → `${APP_URL}/dashboard`
- Secondary link below button: `Connect API keys first` → `${APP_URL}/settings`
- Footer note: `Questions? Just reply to this email — we're a small team and we actually read these.`

**Unsubscribe in footer:** yes

---

## Step 5.4 — Create `backend/src/emails/qualifiedLead.ts`

**Export:** `qualifiedLeadEmail(adminName: string, lead: { businessName: string, phone: string, interestScore: number }, campaignName: string, leadUrl: string): { subject: string, html: string }`

**Subject:** `"New qualified lead: ${lead.businessName}"`

**Hero section** (red `#DC0014` background):
```html
<!-- Star icon (white, 40x40) -->
<svg width="40" height="40" viewBox="0 0 40 40" fill="none" style="display:block;margin:0 auto 16px;">
  <circle cx="20" cy="20" r="19" stroke="rgba(255,255,255,0.3)" stroke-width="1.5"/>
  <path d="M20 11L22.5 17H29L23.5 21L26 27L20 23L14 27L16.5 21L11 17H17.5L20 11Z" fill="white"/>
</svg>
<h2>New Qualified Lead</h2>
<p>Callora just identified a prospect worth your attention.</p>
```

**Body section:**
- Greeting: `Hi ${adminName}, your AI caller found a match.`
- Intro: `A business scored highly on your qualification criteria during the **${campaignName}** campaign. Here are the details:`
- Dark lead card (`background:#0D0D0D; border-radius:8px; padding:24px`):
  - Business name: white, 20px bold
  - Phone: small SVG phone icon + phone number in `#aaa`
  - Score badge: `Score: ${interestScore}/100` — red pill badge (`background:#DC0014; color:white; border-radius:20px; padding:4px 12px`)
  - Label next to badge: `Highly interested` in `#888`
  - Bottom border row: `Campaign: ` + campaign name in red
- Body text: `The full call transcript, AI summary, and contact details are waiting for you in the dashboard. Strike while it's hot.`
- Primary CTA button: `View Lead & Transcript →` → `${leadUrl}`
- Footer note (small muted): `This alert was triggered because the lead scored ≥ 60/100. You can adjust your qualification threshold in campaign settings.`

**Unsubscribe in footer:** yes

---

## Step 5.5 — Create `backend/src/emails/trialExpiry.ts`

**Export:** `trialExpiryEmail(name: string, daysLeft: number, upgradeUrl: string): { subject: string, html: string }`

**Subject:**
- `daysLeft === 1` → `"Your Callora trial ends tomorrow"`
- `daysLeft === 7` → `"Your Callora trial ends in 7 days"`

**Hero section** (dark `#0D0D0D` background):
```html
<!-- Clock icon (white, 40x40) -->
<svg width="40" height="40" viewBox="0 0 40 40" fill="none" style="display:block;margin:0 auto 16px;">
  <circle cx="20" cy="20" r="19" stroke="rgba(255,255,255,0.3)" stroke-width="1.5"/>
  <circle cx="20" cy="21" r="9" stroke="white" stroke-width="2"/>
  <path d="M20 15V21L24 24" stroke="white" stroke-width="2" stroke-linecap="round"/>
  <path d="M16 10H24" stroke="white" stroke-width="2" stroke-linecap="round"/>
</svg>
<h2>Your trial ends in ${daysLeft} day${daysLeft === 1 ? '' : 's'}</h2>
<p>Upgrade now to keep your pipeline running without interruption.</p>
```

**Body section:**
- Greeting: `Hi ${name}, don't lose your momentum.`
- Intro: `Your Callora free trial ends soon. After it expires, you'll lose access to:`
- 3 loss items (black circle with ✕):
  1. **AI outbound calling** — All active and scheduled campaigns will be paused immediately.
  2. **Lead discovery & qualification** — Google Places scraping and Gemini AI scoring will stop.
  3. **Call transcripts & history** — Your existing data is safe, but new calls won't be logged.
- Highlight box: `Plans start at **CA$99/month**. No setup fees. Cancel anytime.`
- Primary CTA button: `Upgrade Now →` → `${upgradeUrl}`
- Secondary link: `View all plans` → `${upgradeUrl}`
- Footer note: `Need help deciding which plan is right for you? Reply to this email and we'll help you choose.`

**Unsubscribe in footer:** yes

---

## Step 5.6 — Create `backend/src/emails/passwordReset.ts`

**Export:** `passwordResetEmail(name: string, resetUrl: string): { subject: string, html: string }`

**Subject:** `"Reset your Callora password"`

**Hero section** (dark `#0D0D0D` background):
```html
<!-- Lock icon (white, 40x40) -->
<svg width="40" height="40" viewBox="0 0 40 40" fill="none" style="display:block;margin:0 auto 16px;">
  <circle cx="20" cy="20" r="19" stroke="rgba(255,255,255,0.3)" stroke-width="1.5"/>
  <rect x="13" y="19" width="14" height="11" rx="2" stroke="white" stroke-width="2"/>
  <path d="M15 19V15C15 12.24 17.24 10 20 10C22.76 10 25 12.24 25 15V19"
        stroke="white" stroke-width="2" stroke-linecap="round"/>
  <circle cx="20" cy="24" r="2" fill="white"/>
</svg>
<h2>Reset your password</h2>
<p>We received a request to reset your Callora password.</p>
```

**Body section:**
- Greeting: `Hi ${name},`
- Text: `Click the button below to set a new password. This link is valid for **1 hour** and can only be used once.`
- Primary CTA button: `Reset Password →` → `${resetUrl}`
- Highlight box: `If you didn't request a password reset, you can safely ignore this email. Your password will not change.`
- Divider
- Small muted text with raw URL: `Or copy this link into your browser:` + `${resetUrl}` (word-break: break-all)

**Unsubscribe in footer:** no — add note: `This is a transactional security email — you cannot unsubscribe from security emails.`

---

## Step 5.7 — Wire welcome email: `backend/src/routes/auth.ts` — POST `/register`

After successfully creating user, org, and subscription:
```typescript
import { sendEmail } from "../lib/email";
import { welcomeEmail } from "../emails/welcome";

const { subject, html } = welcomeEmail(user.name, org.name, subscription.trialEndsAt);
await sendEmail(user.email, subject, html);
```

## Step 5.8 — Wire qualified lead email: `backend/src/workers/campaignWorker.ts`

Inside the worker loop, after a lead is marked qualified (interestScore >= 60):
```typescript
import { sendEmail } from "../lib/email";
import { qualifiedLeadEmail } from "../emails/qualifiedLead";

const adminUser = await prisma.user.findFirst({
  where: { organizationId, role: "ADMIN" }
});
if (adminUser) {
  const leadUrl = `${process.env.APP_URL}/leads/${lead.id}`;
  const { subject, html } = qualifiedLeadEmail(adminUser.name, lead, campaign.name, leadUrl);
  await sendEmail(adminUser.email, subject, html);
}
```

## Step 5.9 — Wire payment failed email: `backend/src/routes/billing.ts`

Add handler for `invoice.payment_failed` Stripe webhook event:
```typescript
case "invoice.payment_failed": {
  const invoice = event.data.object as Stripe.Invoice;
  const customerId = invoice.customer as string;
  const subscription = await prisma.subscription.findFirst({
    where: { stripeCustomerId: customerId },
    include: { organization: { include: { users: { where: { role: "ADMIN" } } } } }
  });
  if (subscription?.organization.users[0]) {
    const admin = subscription.organization.users[0];
    await sendEmail(
      admin.email,
      "Action required: payment failed for Callora",
      `<p style="font-family:Arial,sans-serif;color:#444;">Hi ${admin.name},</p>
       <p style="font-family:Arial,sans-serif;color:#444;">Your recent payment failed. Please update your payment method to avoid service interruption.</p>
       <p><a href="${process.env.APP_URL}/billing" style="background:#DC0014;color:#fff;padding:12px 28px;border-radius:6px;text-decoration:none;font-weight:700;font-family:Arial,sans-serif;">Update Payment Method</a></p>`
    );
  }
  break;
}
```

## Step 5.10 — Create trial expiry daily job: `backend/src/workers/trialExpiryWorker.ts`

In `backend/src/workers/index.ts`, after the campaign worker setup:
```typescript
// Schedule daily trial expiry check at 9am UTC
await callQueue.add("checkTrialExpiry", {}, {
  repeat: { cron: "0 9 * * *" },
  jobId: "trial-expiry-check"
});
```

In the worker processor, add a handler for `"checkTrialExpiry"` job name:
1. Query DB: `subscription.status = "TRIALING"` AND `subscription.trialEndsAt` between `now` and `now + 8 days`
2. For each result, compute `daysLeft = Math.ceil((trialEndsAt.getTime() - Date.now()) / 86400000)`
3. If `daysLeft === 7` or `daysLeft === 1`: find org admin user, send `trialExpiryEmail()`
4. Log count of emails sent

---

---

# TASK 6 — Legal Pages

## Step 6.1 — Create `frontend/src/app/terms/page.tsx`

Public route — place directly under `src/app/terms/` (NOT inside any route group).

Page title: `Terms of Service — Callora`

Sections (write as readable prose):
1. **Acceptance of Terms**
2. **Description of Service** — AI-powered lead generation, outbound calling via Vapi.ai, business discovery via Google Places
3. **User Accounts and Responsibilities**
4. **Acceptable Use Policy** — prohibited uses include spam, harassment, illegal telemarketing
5. **Data and Privacy** — reference the Privacy Policy page
6. **Payment Terms** — Stripe as payment processor, subscription billing, refund policy
7. **Limitation of Liability**
8. **Governing Law** — include verbatim: *"Users in Canada are subject to applicable Canadian laws including CASL. Users in Singapore are subject to the Personal Data Protection Act 2012 (PDPA)."*
9. **Changes to Terms**
10. **Contact** — `hello@callora.ai`

Add `Last updated: April 2025` at the top. Use Tailwind `prose` classes for typography. Match the visual style of the rest of the app (same font, same max-width container).

## Step 6.2 — Create `frontend/src/app/privacy/page.tsx`

Same public route placement as above. Page title: `Privacy Policy — Callora`

Sections:
1. **Information We Collect**
2. **How We Use Information**
3. **Data Storage and Security**
4. **Third-Party Services** — explicitly list: Google Maps API, Google Gemini API, Vapi.ai, Stripe. Note what data each receives.
5. **Data Retention**
6. **Your Rights**
7. **For Canadian Users** — include verbatim: *"We comply with the Personal Information Protection and Electronic Documents Act (PIPEDA) and Canada's Anti-Spam Legislation (CASL). You may request access to your personal information by contacting us at hello@callora.ai."*
8. **For Singapore Users** — include verbatim: *"Personal data is handled in accordance with the Personal Data Protection Act 2012 (PDPA). To exercise your rights of access, correction, or deletion, contact our Data Protection Officer at hello@callora.ai."*
9. **Do Not Call Compliance** — Canada DNCL checks run automatically before every campaign
10. **Updates to This Policy**
11. **Contact** — `hello@callora.ai`

## Step 6.3 — Add legal links to three places

**`frontend/src/app/(auth)/register/page.tsx`** — below the submit button, add:
```tsx
<p className="text-center text-xs text-gray-500 mt-3">
  By creating an account you agree to our{" "}
  <Link href="/terms" className="underline hover:text-gray-700">Terms of Service</Link>
  {" "}and{" "}
  <Link href="/privacy" className="underline hover:text-gray-700">Privacy Policy</Link>.
</p>
```

**`frontend/src/app/(dashboard)/layout.tsx`** — add minimal footer at the bottom of the sidebar:
```tsx
<div className="mt-auto px-4 py-3 border-t border-gray-100">
  <p className="text-xs text-gray-400">
    <Link href="/terms" className="hover:text-gray-600">Terms</Link>
    {" · "}
    <Link href="/privacy" className="hover:text-gray-600">Privacy</Link>
  </p>
</div>
```

**`frontend/src/app/(dashboard)/billing/page.tsx`** — near the payment section:
```tsx
<p className="text-xs text-gray-500 mt-2">
  <Link href="/privacy" className="underline hover:text-gray-700">View our Privacy Policy</Link>
  {" "}to understand how payment data is handled.
</p>
```

---

---

# TASK 7 — API Key Validation on Save

## Step 7.1 — Create `backend/src/lib/validateApiKeys.ts`

Three async functions, each returns `{ valid: boolean, error?: string }`.

**`validateGoogleMapsKey(key: string)`**
```
GET https://maps.googleapis.com/maps/api/place/findplacefromtext/json?input=test&inputtype=textquery&key={key}
```
- Response status `"REQUEST_DENIED"` → `{ valid: false, error: "Invalid API key" }`
- Status `"ZERO_RESULTS"` or `"OK"` → `{ valid: true }`
- Network error → `{ valid: false, error: "Could not reach Google — check your network" }`

**`validateGeminiKey(key: string)`**

POST to Gemini `generateContent` endpoint with the key and a single-word prompt `"Hello"`.
- HTTP 401 or 403 → `{ valid: false, error: "Invalid Gemini API key" }`
- HTTP 200 → `{ valid: true }`
- Network error → `{ valid: false, error: "Could not reach Gemini — check your network" }`

**`validateVapiKey(key: string)`**
```
GET https://api.vapi.ai/phone-number
Authorization: Bearer {key}
```
- HTTP 401 → `{ valid: false, error: "Invalid Vapi API key" }`
- HTTP 200 or 404 → `{ valid: true }` (404 = valid key, no numbers yet)
- Network error → `{ valid: false, error: "Could not reach Vapi — check your network" }`

All three must be wrapped in try/catch. Never throw.

## Step 7.2 — Modify `backend/src/routes/settings.ts` — POST `/`

After saving keys to DB, run validation in parallel:
```typescript
import { validateGoogleMapsKey, validateGeminiKey, validateVapiKey } from "../lib/validateApiKeys";

const [googleResult, geminiResult, vapiResult] = await Promise.all([
  body.googleMapsKey ? validateGoogleMapsKey(body.googleMapsKey) : null,
  body.geminiKey     ? validateGeminiKey(body.geminiKey)         : null,
  body.vapiKey       ? validateVapiKey(body.vapiKey)             : null,
]);

res.json({
  success: true,
  validation: {
    googleMaps: googleResult,
    gemini: geminiResult,
    vapi: vapiResult,
  }
});
```

## Step 7.3 — Modify `frontend/src/components/settings-form.tsx`

After the save API call returns, read `response.validation` and display per-field:
- ✅ Green checkmark + `"Valid"` → if `valid: true`
- ❌ Red X + error message → if `valid: false`
- `—` Grey dash → if field was blank (null result)

Key masking: When the form loads and a key already exists in DB, display `"••••••••" + key.slice(-4)`. On focus, clear the field for re-entry. Show a small pencil/edit icon beside each masked field.

---

---

# TASK 8 — Password Reset

**Depends on:** Task 5 (email system), `PasswordResetToken` schema migration applied.

## Step 8.1 — Backend: two new routes in `backend/src/routes/auth.ts`

**POST `/api/auth/forgot-password`**
```typescript
// 1. Accept { email } in body
// 2. Find user by email — if not found, STILL return { success: true } (don't leak email existence)
// 3. Generate token: crypto.randomBytes(32).toString("hex")
// 4. Create PasswordResetToken: { userId, token, expiresAt: new Date(Date.now() + 3600000), used: false }
// 5. Build resetUrl: `${APP_URL}/reset-password?token=${token}`
// 6. Send passwordResetEmail via Resend
// 7. Return { success: true }
```

**POST `/api/auth/reset-password`**
```typescript
// 1. Accept { token, newPassword } in body
// 2. Find PasswordResetToken: token matches, used = false, expiresAt > new Date()
// 3. If not found: return 400 { error: "Invalid or expired reset link" }
// 4. Validate newPassword: minimum 8 characters
// 5. Hash with bcrypt (same saltRounds as registration)
// 6. Update User.password in DB
// 7. Mark token as used: update({ where: { id }, data: { used: true } })
// 8. Return { success: true }
```

## Step 8.2 — Create `frontend/src/app/(auth)/forgot-password/page.tsx`

- Single email input form
- On submit: POST to `/api/auth/forgot-password`
- On success: show message — `"If that email is registered, you'll receive a reset link shortly. Check your inbox."` — do NOT redirect
- Match the exact visual style of login/register pages

## Step 8.3 — Create `frontend/src/app/(auth)/reset-password/page.tsx`

- Read `?token=` from URL search params (`useSearchParams()`)
- Form: new password input + confirm password input
- Client-side validation: passwords must match, minimum 8 characters
- On submit: POST to `/api/auth/reset-password` with `{ token, newPassword }`
- On success: show `"Password updated successfully."` with a link to `/login`
- On error: display the backend error message
- Match the visual style of the auth pages

## Step 8.4 — Modify `frontend/src/app/(auth)/login/page.tsx`

Add "Forgot your password?" link below the password input field:
```tsx
<div className="text-right mt-1">
  <Link href="/forgot-password" className="text-xs text-gray-500 hover:text-gray-700">
    Forgot your password?
  </Link>
</div>
```

---

---

# Testing Checklist — Tasks 3–8

### CSV Import (Task 3)
- [ ] Upload a CSV where a business name contains a comma (e.g., `"Smith, Jones & Associates"`). Verify it imports as one lead with the correct name.
- [ ] Upload a CSV with mixed phone formats (`+1 (416) 555-0100`, `4165550100`, `1-416-555-0100`). Verify all normalize to the same digits.
- [ ] Upload a CSV with column named `"mobile number"`. Verify it is recognized without error.

### Quota Enforcement (Task 4)
- [ ] With quota at 0, make a demo call. Verify it returns 429 (not 500).
- [ ] Run a scrape that would return 50 leads when quota allows only 20. Verify it blocks with a clear error.

### Emails (Task 5)
- [ ] Register a new account. Welcome email arrives within 30 seconds with correct name, org name, and trial end date. CTA button links to dashboard.
- [ ] Run a campaign where at least one lead scores ≥ 60. Admin receives qualified lead email with correct business name, score, and link.
- [ ] Request a password reset. Email arrives with working link. Set new password. Verify old password no longer works. Verify reset link cannot be used twice.
- [ ] Trigger a Stripe `invoice.payment_failed` webhook (use Stripe CLI). Verify payment failed email is sent to org admin.

### Legal Pages (Task 6)
- [ ] Visit `/terms` without being logged in. Page loads with full content including CASL and PDPA sections.
- [ ] Visit `/privacy` without being logged in. Page loads with Canadian and Singaporean compliance sections visible.
- [ ] Register page shows Terms and Privacy links below the submit button.
- [ ] Dashboard sidebar footer shows Terms · Privacy links.

### API Key Validation (Task 7)
- [ ] Enter an invalid Google Maps key in Settings. Save. Red error indicator appears next to that field.
- [ ] Enter a valid Vapi key and an invalid Gemini key. Save. Vapi shows green, Gemini shows red. Both are saved to DB.
- [ ] Reload Settings page after saving keys. Keys display as masked (`••••xxxx`). Clicking a field clears it for re-entry.

### Password Reset (Task 8)
- [ ] Click "Forgot your password?" on login page. Enter registered email. Confirmation message shown (no redirect).
- [ ] Click reset link in email. Enter new password. Success message shown. Log in with new password — works. Old password rejected. Link cannot be used again.
- [ ] Enter mismatched passwords on reset form. Client-side error shown before submission.
- [ ] Enter a password under 8 characters. Client-side error shown before submission.
