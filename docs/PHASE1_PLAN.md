# Callora — Phase 1 Technical Implementation Plan

> **For Claude Code:** Read this file fully before starting any task. Work through tasks in order.
> Each task is self-contained. Do not skip ahead. Run `npx prisma migrate dev` after any schema change.

---

## Prerequisites — Install First

### Backend (`cd backend`)
```bash
npm install bullmq ioredis resend
```

### Frontend (`cd frontend`)
```bash
npm install papaparse
npm install -D @types/papaparse
```

---

## Environment Variables to Add

### `backend/.env`
```
REDIS_URL=redis://localhost:6379
RESEND_API_KEY=re_xxxxxxxxxxxx
FROM_EMAIL=hello@callora.ai
APP_URL=http://localhost:3000
```

### `docker-compose.yml` — add Redis service
```yaml
redis:
  image: redis:7-alpine
  ports:
    - "6379:6379"
  volumes:
    - redis_data:/data

volumes:
  redis_data:
```
Also add `REDIS_URL=redis://redis:6379` to the backend service environment block in `docker-compose.yml`.

---

## Database Schema Changes

Add the following to `backend/prisma/schema.prisma` before running migrations.

**On the `Organization` model — add AI caller config fields:**
```prisma
aiCallerName      String  @default("Alex")
aiCallerCompany   String  @default("")
aiCallerPhone     String  @default("")
aiSystemPrompt    String? @db.Text
```

**New model — PasswordResetToken:**
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
Add the relation back on `User`: `passwordResetTokens PasswordResetToken[]`

**Run after schema changes:**
```bash
cd backend && npx prisma migrate dev --name "phase1_ai_caller_and_password_reset"
```

---

---

# SPRINT 1A — Fix What's Broken

---

## Task 1 — Background Job Queue for Campaign Execution

**Depends on:** Redis added to docker-compose, `bullmq` and `ioredis` installed.

### Step 1.1 — Create `backend/src/lib/queue.ts`

Create a single shared BullMQ queue and a Redis connection. Export both.

```typescript
// Creates a BullMQ Queue named "campaign-calls"
// Uses REDIS_URL from environment
// Export: callQueue (Queue instance), redisConnection (IORedis instance)
```

The queue should have these default job options: `removeOnComplete: 100`, `removeOnFail: 200`, `attempts: 1` (no auto-retry — campaign logic handles retries).

### Step 1.2 — Create `backend/src/workers/campaignWorker.ts`

This is the core worker. It processes jobs of type `processCampaignCalls`.

Each job receives: `{ campaignId, organizationId, leadIds: string[] }`

Worker logic (in order):
1. Fetch org's AI caller config from DB (`aiCallerName`, `aiCallerCompany`, `aiCallerPhone`, `aiSystemPrompt`)
2. Fetch org's API keys from DB (`vapiKey`, `vapiPhoneId`, `geminiKey`)
3. Update campaign status to `"RUNNING"` in DB
4. Loop through each `leadId`:
   a. Check `assertWithinQuota(organizationId, "call")` — if quota exceeded, update campaign status to `"PAUSED_QUOTA"`, stop loop, return
   b. Fetch lead from DB
   c. Check Redis cancelled set: `await redisConnection.sismember("cancelled_campaigns", campaignId)` — if found, update status to `"CANCELLED"` and break
   d. Call `vapi.makeCall(lead.phone, lead.businessName, orgAiConfig)` — pass org config, not hardcoded values
   e. Call `gemini.qualifyLead(transcript, campaignPrompt)` using org's gemini key
   f. Create `CallLog` record in DB
   g. Update `Lead` status and interestScore in DB
   h. Call `recordUsage(organizationId, "call", 1)`
   i. **If lead qualifies** (interestScore >= 60): send qualified lead alert email to org admin
   j. Update job progress: `job.updateProgress({ completed: index + 1, total: leadIds.length })`
5. After loop completes: update campaign status to `"COMPLETED"`

**Error handling:** Wrap the entire loop in try/catch. On unexpected error, update campaign status to `"FAILED"` and log the error. Handle per-lead errors inside the loop with individual try/catch — mark the lead as `"FAILED"` and continue to the next lead. Never let one bad lead kill the campaign.

### Step 1.3 — Create `backend/src/workers/index.ts`

Creates a `Worker` instance from BullMQ pointing at the `"campaign-calls"` queue. Imports and calls the `campaignWorker` processor. Export the worker instance.

### Step 1.4 — Modify `backend/src/index.ts`

Add this import near the top, after other service imports:
```typescript
import "./workers/index";
```
The worker will auto-connect to Redis and start listening when the server starts.

### Step 1.5 — Modify `backend/src/routes/campaigns.ts` — POST `/:id/call-leads`

Replace the entire synchronous for-loop with:
1. Fetch campaign + leads (status `"NEW"` or `"PENDING_RETRY"`)
2. Validate campaign is in a startable state
3. Enqueue job: `callQueue.add("processCampaignCalls", { campaignId, organizationId, leadIds: leads.map(l => l.id) })`
4. Store the returned `job.id` on the campaign: `await prisma.campaign.update({ where: { id }, data: { jobId: job.id, status: "RUNNING" } })`
5. Return `res.json({ success: true, jobId: job.id, totalLeads: leads.length })` immediately

**Note:** The `Campaign` model needs a `jobId String?` field. Add it to the Prisma schema and migrate.

### Step 1.6 — Add progress endpoint: GET `/:id/progress`

```
GET /api/campaigns/:id/progress
Returns: { status, jobId, progress: { completed, total }, campaignStatus }
```

Logic: Fetch job from queue using `callQueue.getJob(campaign.jobId)`, return `job.progress` alongside campaign's DB status.

### Step 1.7 — Add cancel endpoint: POST `/:id/cancel`

1. Fetch campaign from DB, verify it belongs to org
2. Add campaignId to Redis cancelled set: `await redisConnection.sadd("cancelled_campaigns", campaignId)`
3. Update campaign status to `"CANCELLED"` in DB
4. Return `res.json({ success: true })`

The worker checks this set at the start of each lead iteration (Step 1.2c above).

### Step 1.8 — Modify `backend/src/services/vapi.ts`

Change the `makeCall` function signature to accept an `orgConfig` object:
```typescript
async makeCall(phone: string, businessName: string, orgConfig: {
  aiCallerName: string,
  aiCallerCompany: string,
  aiCallerPhone: string,
  aiSystemPrompt?: string | null
}): Promise<CallResult>
```

Build the system prompt dynamically:
```typescript
const systemPrompt = orgConfig.aiSystemPrompt ??
  `You are ${orgConfig.aiCallerName} from ${orgConfig.aiCallerCompany}. Your goal is to see if the business owner is interested in getting more clients via AI automation. Be professional, concise, and friendly. If they are interested, ask for an email to send details. If they are busy, offer to call back later.${orgConfig.aiCallerPhone ? ` If anyone asks for a contact number, provide: ${orgConfig.aiCallerPhone}.` : ''}`;
```

Also fix `pollForCompletion`: replace `catch (err) {}` with `catch (err) { console.error("Vapi poll error:", err); }`. Add exponential backoff: start at 3s, increase to 5s after 10 attempts.

### Step 1.9 — Frontend: campaign progress polling

**Modify `frontend/src/app/(dashboard)/campaigns/[id]/page.tsx`:**
- When campaign status is `"RUNNING"`, poll `GET /api/campaigns/:id/progress` every 5 seconds via `setInterval` in a `useEffect`
- Display a progress bar: `"{completed} / {total} calls completed"`
- Clear the interval when status changes to `"COMPLETED"`, `"PAUSED_QUOTA"`, `"CANCELLED"`, or `"FAILED"`

**Modify `frontend/src/components/campaign-controls.tsx`:**
- Add a Cancel button that calls POST `/:id/cancel`
- Show it only when campaign status is `"RUNNING"`
- After cancellation, refresh the campaign data

---

## Task 2 — Configurable AI Assistant Per Organization

**Depends on:** Schema migration (ai caller fields on Organization) applied.

### Step 2.1 — Modify `backend/src/routes/settings.ts`

Add two new endpoints:

**GET `/api/settings/ai-caller`**
- Fetch org from DB, return `{ aiCallerName, aiCallerCompany, aiCallerPhone, aiSystemPrompt }`

**PATCH `/api/settings/ai-caller`**
- Accept `{ aiCallerName, aiCallerCompany, aiCallerPhone, aiSystemPrompt }` in body
- Validate with Zod: `aiCallerName` required string max 50 chars, `aiCallerCompany` required string max 100 chars, `aiCallerPhone` optional string, `aiSystemPrompt` optional string max 2000 chars
- Update organization in DB
- Return updated values

### Step 2.2 — Create `frontend/src/components/ai-caller-form.tsx`

Form fields:
- **Caller Name** — text input, placeholder "Alex", label "Your AI caller's first name"
- **Company Name** — text input, placeholder "Acme Corp", label "Company the AI represents"
- **Contact Phone** — text input, placeholder "+1 416 555 0100", label "Phone number shared if prospect asks (optional)"
- **Custom Script** — textarea, 6 rows, placeholder "Leave blank to use the default script. Or write your own: 'You are [Name] from [Company]...'"

Below the textarea, show a live preview of the final system prompt the AI will use. If custom script is blank, show the auto-generated default using the name and company fields.

Save button calls PATCH `/api/settings/ai-caller`. Show success toast on save.

### Step 2.3 — Modify `frontend/src/app/(dashboard)/settings/page.tsx`

Add a new "AI Caller" section above the API keys section. Import and render `<AiCallerForm />`. Fetch initial values from GET `/api/settings/ai-caller` on page load.

### Step 2.4 — Create `frontend/src/app/actions/ai-caller.ts`

Server actions for GET and PATCH ai-caller settings, following the same pattern as other action files in `src/app/actions/`.

---

## Task 3 — Fix the CSV Parser

### Step 3.1 — Rewrite `frontend/src/components/csv-import.tsx` — `parseCSV` function

Replace the naive split-on-comma logic with PapaParse:

```typescript
import Papa from "papaparse";

function parseCSV(text: string): ParsedLead[] {
  const result = Papa.parse(text, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h: string) => h.trim().toLowerCase(),
  });

  return (result.data as any[]).map((row) => {
    const rawPhone = row.phone ?? row.number ?? row.mobile ?? row.tel
      ?? row["phone number"] ?? row["mobile number"] ?? "";
    const rawName = row.name ?? row["business name"] ?? row.company
      ?? row["company name"] ?? row.business ?? "";
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

Update the column validation to accept any of the recognized column name variants (phone, number, mobile, tel, phone number, mobile number) before showing an error.

### Step 3.2 — Modify `backend/src/routes/campaigns.ts` — POST `/:id/import`

Add phone normalization on the backend (defense in depth):
```typescript
function normalizePhone(raw: string): string {
  let digits = raw.replace(/[^\d+]/g, "");
  if (digits.startsWith("+1")) digits = digits.slice(2);
  else if (digits.startsWith("1") && digits.length === 11) digits = digits.slice(1);
  return digits;
}
```

Wrap the insert loop in a `prisma.$transaction()` call. Skip leads where normalized phone is empty or under 7 digits. Normalize phone before the duplicate check.

---

## Task 4 — Close Quota Enforcement Gaps

### Step 4.1 — Modify `backend/src/routes/demo.ts` — POST `/call`

Add quota check before making the demo call:
```typescript
await assertWithinQuota(organizationId, "call");
// ... existing call logic ...
await recordUsage(organizationId, "call", 1);
```
If `assertWithinQuota` throws, catch and return the error with its status code (typically 429).

### Step 4.2 — Modify `backend/src/routes/campaigns.ts` — POST `/:id/scrape`

After the Places API returns leads, before inserting:
```typescript
const discoveredLeads = await places.searchBusinesses(prompt, apiKey);
await assertWithinQuota(organizationId, "lead", discoveredLeads.length);
// ... insert leads ...
await recordUsage(organizationId, "lead", discoveredLeads.length);
```

### Note on campaign loop race condition
This is automatically resolved by Task 1. The quota check now runs inside the BullMQ worker job — synchronous, atomic, no race condition.

---

---

# SPRINT 1B — Earn Legal Standing

---

## Task 5 — Email System with Resend

### Step 5.1 — Create `backend/src/lib/email.ts`

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

### Step 5.2 — Create `backend/src/emails/` directory with four template files

**`backend/src/emails/welcome.ts`**
- Export: `welcomeEmail(name: string, orgName: string, trialEndDate: Date): { subject: string, html: string }`
- Subject: `"Welcome to Callora, {name}"`
- HTML: Welcome message, formatted trial end date, CTA button "Go to Dashboard" → `APP_URL/dashboard`, secondary link "Connect your API keys" → `APP_URL/settings`
- Keep clean: max 150 words body copy, 3 sections

**`backend/src/emails/trialExpiry.ts`**
- Export: `trialExpiryEmail(name: string, daysLeft: number, upgradeUrl: string): { subject: string, html: string }`
- Subject: `"Your Callora trial ends tomorrow"` (daysLeft=1) or `"Your Callora trial ends in 7 days"` (daysLeft=7)
- HTML: Urgency message, list of what they'll lose access to, CTA "Upgrade Now" → upgradeUrl

**`backend/src/emails/qualifiedLead.ts`**
- Export: `qualifiedLeadEmail(adminName: string, lead: { businessName: string, phone: string, interestScore: number }, campaignName: string, leadUrl: string): { subject: string, html: string }`
- Subject: `"New qualified lead: {businessName}"`
- HTML: Business name prominent, interest score badge ("Score: {n}/100"), campaign name, CTA "View Lead" → leadUrl
- Should feel like an exciting notification

**`backend/src/emails/passwordReset.ts`**
- Export: `passwordResetEmail(name: string, resetUrl: string): { subject: string, html: string }`
- Subject: `"Reset your Callora password"`
- HTML: Brief message, CTA "Reset Password" → resetUrl, note: "This link expires in 1 hour. If you didn't request this, you can safely ignore this email."

### Step 5.3 — Wire welcome email: `backend/src/routes/auth.ts` — POST `/register`

After successfully creating user, org, and subscription, add:
```typescript
import { sendEmail } from "../lib/email";
import { welcomeEmail } from "../emails/welcome";

const { subject, html } = welcomeEmail(user.name, org.name, subscription.trialEndsAt);
await sendEmail(user.email, subject, html);
```

### Step 5.4 — Wire qualified lead email: `backend/src/workers/campaignWorker.ts`

Inside the worker loop, after a lead is marked as qualified (interestScore >= 60):
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

### Step 5.5 — Wire payment failed email: `backend/src/routes/billing.ts`

Add handler for `invoice.payment_failed` Stripe event:
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
      `<p>Hi ${admin.name},</p><p>Your recent payment failed. Please update your payment method to avoid service interruption.</p><p><a href="${process.env.APP_URL}/billing">Update Payment Method</a></p>`
    );
  }
  break;
}
```

### Step 5.6 — Create trial expiry daily job: `backend/src/workers/trialExpiryWorker.ts`

Add a repeating BullMQ job that runs every day at 9am UTC:

In `backend/src/workers/index.ts`, after the campaign worker setup:
```typescript
// Schedule daily trial expiry check
await callQueue.add("checkTrialExpiry", {}, {
  repeat: { cron: "0 9 * * *" },
  jobId: "trial-expiry-check"
});
```

In the worker processor, add a handler for `"checkTrialExpiry"` job name:
1. Query DB: `subscription.status = "TRIALING"` AND `subscription.trialEndsAt` is between `now` and `now + 8 days`
2. For each result, compute `daysLeft = Math.ceil((trialEndsAt - now) / 86400000)`
3. If `daysLeft === 7` or `daysLeft === 1`: find org admin user, send `trialExpiryEmail()`
4. Log count of emails sent

---

## Task 6 — Legal Pages

### Step 6.1 — Create `frontend/src/app/terms/page.tsx`

Public route — do NOT place inside `(dashboard)` or `(auth)` route groups. Place directly under `src/app/terms/`.

Page sections (write as readable prose, not bullet points):
1. Acceptance of Terms
2. Description of Service
3. User Accounts and Responsibilities
4. Acceptable Use Policy
5. Data and Privacy (reference the Privacy Policy)
6. Payment Terms (mention Stripe as payment processor)
7. Limitation of Liability
8. Governing Law — include: *"Users in Canada are subject to applicable Canadian laws including CASL. Users in Singapore are subject to the Personal Data Protection Act 2012 (PDPA)."*
9. Changes to Terms
10. Contact Information — use `FROM_EMAIL` value

Style: Use the same Tailwind typography as the rest of the app. Add a "Last updated: [current date]" note at the top.

### Step 6.2 — Create `frontend/src/app/privacy/page.tsx`

Same public route placement as above.

Page sections:
1. Information We Collect
2. How We Use Information
3. Data Storage and Security
4. Third-Party Services — explicitly list: Google Maps API, Google Gemini API, Vapi.ai, Stripe. Note what data is shared with each.
5. Data Retention
6. Your Rights
7. **For Canadian Users** — *"We comply with the Personal Information Protection and Electronic Documents Act (PIPEDA) and Canada's Anti-Spam Legislation (CASL). You may request access to your personal information by contacting us at [email]."*
8. **For Singapore Users** — *"Personal data is handled in accordance with the Personal Data Protection Act 2012 (PDPA). To exercise your rights of access, correction, or deletion, contact our Data Protection Officer at [email]."*
9. Do Not Call Compliance (Canada DNCL)
10. Updates to This Policy
11. Contact Information

### Step 6.3 — Add legal links to three places

**`frontend/src/app/(auth)/register/page.tsx`** — below the submit button:
```
By creating an account you agree to our Terms of Service and Privacy Policy.
```
Both are links to `/terms` and `/privacy`.

**`frontend/src/app/(dashboard)/layout.tsx`** — add a minimal footer below the sidebar nav:
```
Terms · Privacy
```
Small gray text, links to `/terms` and `/privacy`.

**`frontend/src/app/(dashboard)/billing/page.tsx`** — add a line near the payment section:
```
View our Privacy Policy to understand how payment data is handled.
```

---

## Task 7 — API Key Validation on Save

### Step 7.1 — Create `backend/src/lib/validateApiKeys.ts`

Three async functions, each returns `{ valid: boolean, error?: string }`:

**`validateGoogleMapsKey(key: string)`**
```
GET https://maps.googleapis.com/maps/api/place/findplacefromtext/json?input=test&inputtype=textquery&key={key}
```
- If response status is `"REQUEST_DENIED"` → `{ valid: false, error: "Invalid API key" }`
- If status is `"ZERO_RESULTS"` or `"OK"` → `{ valid: true }`
- On network error → `{ valid: false, error: "Could not reach Google — check your network" }`

**`validateGeminiKey(key: string)`**
Make a minimal POST to Gemini `generateContent` endpoint with the provided key and a single-word prompt ("Hello"). Check HTTP status:
- 401 or 403 → `{ valid: false, error: "Invalid Gemini API key" }`
- 200 → `{ valid: true }`
- Network error → `{ valid: false, error: "Could not reach Gemini — check your network" }`

**`validateVapiKey(key: string)`**
```
GET https://api.vapi.ai/phone-number
Authorization: Bearer {key}
```
- 401 → `{ valid: false, error: "Invalid Vapi API key" }`
- 200 or 404 → `{ valid: true }` (404 = valid key, just no numbers configured yet)
- Network error → `{ valid: false, error: "Could not reach Vapi — check your network" }`

All three must be wrapped in try/catch. Never throw — always return the `{ valid, error }` shape.

### Step 7.2 — Modify `backend/src/routes/settings.ts` — POST `/`

After saving keys to DB, run validation in parallel:
```typescript
import { validateGoogleMapsKey, validateGeminiKey, validateVapiKey } from "../lib/validateApiKeys";

const [googleResult, geminiResult, vapiResult] = await Promise.all([
  body.googleMapsKey ? validateGoogleMapsKey(body.googleMapsKey) : null,
  body.geminiKey ? validateGeminiKey(body.geminiKey) : null,
  body.vapiKey ? validateVapiKey(body.vapiKey) : null,
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

### Step 7.3 — Modify `frontend/src/components/settings-form.tsx`

After the save API call returns, read `response.validation` and for each key field display:
- ✅ green checkmark + "Valid" if `valid: true`
- ❌ red X + error message if `valid: false`
- Grey dash if the field was left blank (null result)

Key masking: When the form loads and a key already exists in DB, display `"••••••••" + key.slice(-4)` instead of the full value. On focus (user clicks the field), clear it so they can type a new value. Show a small "Edit" icon beside each masked field.

---

## Task 8 — Password Reset

**Depends on:** Task 5 (Resend email system), `PasswordResetToken` schema migration applied.

### Step 8.1 — Backend: two new routes in `backend/src/routes/auth.ts`

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
// 2. Find PasswordResetToken where: token matches, used = false, expiresAt > new Date()
// 3. If not found: return 400 { error: "Invalid or expired reset link" }
// 4. Validate newPassword: minimum 8 characters
// 5. Hash with bcrypt (same saltRounds as registration)
// 6. Update User.password in DB
// 7. Mark token as used: await prisma.passwordResetToken.update({ where: { id }, data: { used: true } })
// 8. Return { success: true }
```

### Step 8.2 — Create `frontend/src/app/(auth)/forgot-password/page.tsx`

- Single email input form
- On submit: POST to `/api/auth/forgot-password`
- On success (regardless of whether email exists): show message "If that email is registered, you'll receive a reset link shortly. Check your inbox."
- Do NOT redirect after submit — user must see confirmation
- Match the exact visual style of the login and register pages

### Step 8.3 — Create `frontend/src/app/(auth)/reset-password/page.tsx`

- Reads `?token=` from URL search params
- Form: new password input + confirm password input
- Client-side validation: passwords must match, minimum 8 characters
- On submit: POST to `/api/auth/reset-password` with `{ token, newPassword }`
- On success: show "Password updated successfully." with a link to `/login`
- On error: display the error message returned by the backend
- Match the visual style of the auth pages

### Step 8.4 — Modify `frontend/src/app/(auth)/login/page.tsx`

Add "Forgot your password?" link below the password input field, linking to `/forgot-password`. Small gray text, subtle styling — don't distract from the main login CTA.

---

---

# Testing Checklist — Before Closing Phase 1

Verify each item manually before marking Phase 1 done:

### Job Queue
- [ ] Start a campaign with 5 leads. Close the browser tab immediately. Wait 2 minutes. Reopen — calls should be complete.
- [ ] Start a campaign with 20 leads. After 3 leads complete, click Cancel. Verify remaining leads stay `"NEW"` and campaign shows `"CANCELLED"`.
- [ ] Progress bar shows correct `X / Y` count while campaign runs.

### AI Caller Config
- [ ] Change org caller name to "Sarah" and company to "TestCorp". Run a demo call. AI introduces itself as Sarah from TestCorp.
- [ ] Enter a custom system prompt. Verify it overrides the auto-generated one.

### CSV Import
- [ ] Upload a CSV from Google Sheets with a business name containing a comma (e.g., `"Smith, Jones & Associates"`). Verify it imports as a single lead with the correct name.
- [ ] Upload a CSV with phone numbers in mixed formats (`+1 (416) 555-0100`, `4165550100`, `1-416-555-0100`). Verify all normalize to the same digits.

### Quota Enforcement
- [ ] Set monthly call quota to 3. Run a campaign with 10 leads. Verify it stops after 3 calls and status shows `"PAUSED_QUOTA"`.
- [ ] With quota at 0, make a demo call. Verify it returns a 429 error (not a 500).
- [ ] Run a scrape that would return 50 leads when quota allows only 20. Verify it blocks.

### Emails (Resend)
- [ ] Register a new account. Welcome email arrives within 30 seconds with correct name and trial end date.
- [ ] Run a campaign where at least one lead qualifies. Admin receives "New qualified lead" email with correct business name and score.
- [ ] Request a password reset for a registered email. Reset email arrives. Click link. Set new password. Log in with new password. Verify old password no longer works. Verify reset link cannot be used twice.

### API Key Validation
- [ ] Enter an invalid Google Maps key in Settings. Save. Red error indicator appears next to Google Maps field.
- [ ] Enter a valid Vapi key and an invalid Gemini key. Save. Vapi shows green, Gemini shows red. Both are saved to DB.
- [ ] Reload the Settings page after saving keys. Keys display as masked (`••••xxxx`). Clicking a field clears it for re-entry.

### Legal Pages
- [ ] Visit `/terms` without being logged in. Page loads with full content.
- [ ] Visit `/privacy` without being logged in. Page loads with Canadian and Singaporean compliance sections visible.
- [ ] Register page shows Terms and Privacy links below the submit button.
