# Platform Tier & Billing — Setup Steps

These steps are for the person running the first deploy/dev against the new platform/billing code. Run them in order.

## 1. Install new dependencies

```bash
cd backend && npm install
cd ../admin && npm install
```

## 2. Add env vars

Append to `backend/.env`:

```
PLATFORM_JWT_SECRET=<long-random-string>
TENANT_APP_ORIGIN=http://localhost:3000
ADMIN_APP_ORIGIN=http://localhost:3001
TRIAL_DAYS=14

# Stripe (use test-mode keys for dev)
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_PRICE_FREE=price_...
STRIPE_PRICE_STARTER=price_...
STRIPE_PRICE_PRO=price_...
STRIPE_PRICE_ENTERPRISE=price_...

# One-time, for seed-platform-admin
PLATFORM_ADMIN_EMAIL=you@example.com
PLATFORM_ADMIN_PASSWORD=<strong-password>
PLATFORM_ADMIN_NAME=Your Name
```

Create `admin/.env.local`:

```
NEXTAUTH_URL=http://localhost:3001
NEXTAUTH_SECRET=<long-random-string>
NEXT_PUBLIC_PLATFORM_API_URL=http://localhost:4000/api/platform
```

## 3. Migrate the database

```bash
cd backend
npx prisma migrate dev --name platform_billing_tier
npx prisma generate
```

## 4. Seed plans + platform admin + backfill existing orgs

```bash
npm run seed:plans
npm run seed:admin
npm run backfill:subscriptions
```

## 5. Run everything

```bash
# terminal 1 — backend
cd backend && npm run dev

# terminal 2 — tenant frontend
cd frontend && npm run dev

# terminal 3 — admin app
cd admin && npm run dev

# terminal 4 — Stripe webhook forwarding (dev only)
stripe listen --forward-to localhost:4000/api/billing/webhook
```

## 6. Verify

- `http://localhost:3001/login` — sign in with PLATFORM_ADMIN_EMAIL/PASSWORD
- Dashboard shows tenant count / MRR / trial count
- `/tenants` lists every org; click one → can change status + plan
- On tenant app (`http://localhost:3000`), new signups land as TRIAL with 14-day trial
- `/billing` page in tenant app → click "Upgrade to STARTER" → Stripe Checkout opens
- After test payment, webhook flips Subscription → ACTIVE, Organization.status → ACTIVE
- Suspending a tenant from `/admin/tenants/:id` causes tenant API calls to return 402

## Post-launch TODOs (out of scope of this patch)

- Encrypt `ApiKey` fields at rest
- Rotate `.env` secrets (Google/Gemini/Vapi) and remove from git history
- Email verification on signup
- Teammate invites
- Per-tenant rate limiting
- Background job queue for campaign runs (BullMQ)
