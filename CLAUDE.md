# CLAUDE.md — Callora by Redot Global

This file is the single source of truth for every Claude Code agent working in this repository. Read it fully before touching any code.

---

## Product Name

**Callora** — by Redot Global (redot.global)

> ⚠️ The old name "EzLeadsAI" is **retired**. Never use it in new code, UI text, emails, page titles, meta tags, error messages, comments, or variable names. Always use "Callora".

---

## What Callora Does

Callora is a **multi-tenant SaaS platform for AI-powered lead generation**. The core pipeline is:

1. **Google Places API** — discovers businesses by location/keyword
2. **Gemini AI** — qualifies leads and summarizes call outcomes
3. **Vapi.ai** — places outbound AI phone calls to prospects

Tenants create campaigns, the system auto-dials leads, and results flow into a built-in CRM (contacts, deals, tasks, notes). The platform layer (super-admin) manages organizations, plans, billing, and quotas.

---

## Repository Structure

```
EzLeadsAI/                    ← repo root (ignore folder name, product is Callora)
├── services/                 ← Microservices (api-gateway + 9 domain services, ports 4000-4009)
│   ├── api-gateway/          ← port 4000, JWT validation, CORS, proxies to services
│   ├── auth-service/         ← port 4001
│   ├── campaign-service/     ← port 4002 (BullMQ workers)
│   ├── lead-service/         ← port 4003 (Places + Gemini)
│   ├── calling-service/      ← port 4004 (Vapi)
│   ├── crm-service/          ← port 4005 (contacts/deals/tasks/notes)
│   ├── billing-service/      ← port 4006 (Stripe)
│   ├── platform-service/     ← port 4007 (super-admin)
│   ├── notification-service/ ← port 4008 (SMTP/email templates)
│   └── analytics-service/    ← port 4009 (stats)
├── shared/                   ← @callora/shared — Prisma client, types, JWT/quota helpers
├── backend/                  ← LEGACY monolith Express.js API (port 4000) — see note below
│   ├── src/
│   │   ├── index.ts          ← server entry point, all route registrations
│   │   ├── routes/           ← tenant API route handlers
│   │   │   ├── auth.ts
│   │   │   ├── campaigns.ts
│   │   │   ├── leads.ts
│   │   │   ├── contacts.ts
│   │   │   ├── deals.ts
│   │   │   ├── tasks.ts
│   │   │   ├── notes.ts
│   │   │   ├── stats.ts
│   │   │   ├── analytics.ts
│   │   │   ├── blacklist.ts
│   │   │   ├── settings.ts
│   │   │   ├── billing.ts
│   │   │   ├── vapi-sync.ts
│   │   │   ├── demo.ts
│   │   │   └── platform/     ← super-admin routes
│   │   │       ├── auth.ts
│   │   │       ├── organizations.ts
│   │   │       ├── plans.ts
│   │   │       └── metrics.ts
│   │   ├── services/
│   │   │   ├── gemini.ts     ← Gemini 2.5 (lead qualification + call summary)
│   │   │   ├── places.ts     ← Google Places API (business discovery)
│   │   │   ├── vapi.ts       ← Vapi.ai outbound call orchestration
│   │   │   └── stripe.ts     ← Stripe billing
│   │   ├── workers/
│   │   │   ├── index.ts      ← boots all workers
│   │   │   ├── campaignWorker.ts   ← BullMQ: runs campaigns, calls leads
│   │   │   └── trialExpiryWorker.ts ← BullMQ: handles trial → expired transitions
│   │   ├── middleware/
│   │   │   ├── auth.ts       ← tenant JWT validation → req.user
│   │   │   └── platformAuth.ts ← platform JWT validation → req.platformUser
│   │   ├── lib/
│   │   │   ├── prisma.ts     ← singleton Prisma client
│   │   │   ├── queue.ts      ← BullMQ Redis connection + queue definitions
│   │   │   ├── quota.ts      ← assertWithinQuota(), recordUsage()
│   │   │   ├── audit.ts      ← AuditLog writes
│   │   │   ├── email.ts      ← nodemailer/send wrapper
│   │   │   └── validateApiKeys.ts
│   │   ├── emails/           ← HTML email templates (layout + templates)
│   │   │   ├── _layout.ts
│   │   │   ├── welcome.ts
│   │   │   ├── qualifiedLead.ts
│   │   │   ├── trialExpiry.ts
│   │   │   └── passwordReset.ts
│   │   └── __tests__/
│   │       └── tenant-isolation.test.ts
│   ├── prisma/
│   │   └── schema.prisma     ← single source of truth for DB schema
│   └── package.json
├── frontend/                 ← Tenant-facing Next.js app (port 3000)
│   └── src/
│       ├── app/
│       │   ├── (auth)/       ← login, register, forgot-password, reset-password
│       │   ├── (dashboard)/  ← all authenticated tenant pages
│       │   │   ├── dashboard/
│       │   │   ├── campaigns/     ← list, new, [id]
│       │   │   ├── leads/
│       │   │   ├── contacts/      ← list, [id] detail
│       │   │   ├── pipeline/      ← deal kanban, [id] detail
│       │   │   ├── tasks/
│       │   │   ├── follow-ups/    ← follow-up config + settings
│       │   │   ├── analytics/     ← charts: call volume, cost, outcome, funnel
│       │   │   ├── blacklist/
│       │   │   ├── billing/
│       │   │   ├── settings/
│       │   │   └── demo/
│       │   ├── (marketing)/  ← landing page, pricing
│       │   ├── terms/
│       │   ├── privacy/
│       │   └── actions/      ← Next.js Server Actions (all backend API calls)
│       └── auth.ts           ← NextAuth config (JWT, accessToken, organizationId)
├── admin/                    ← Super-admin Next.js app (port 3001)
│   └── src/app/
│       ├── login/
│       ├── page.tsx          ← dashboard/metrics
│       ├── tenants/          ← list, [id] detail + StatusControls
│       └── plans/
├── docs/
│   └── setup/
│       └── PLATFORM_SETUP.md ← platform run-book
└── legacy_cli/               ← ARCHIVED. Reference only. Never modify.
```

> **Note on `backend/`:** The monolith is retained for reference until Phase 4 of the
> microservices migration is fully verified in production, then it will be deleted.
> All new code belongs in `services/<name>/`.

---

## Microservices Architecture

Callora is migrating from the `backend/` Express monolith to 9 independent services + an `api-gateway`, plus a shared `@callora/shared` package. Plan of record: [docs/architecture/MICROSERVICES_PLAN.md](docs/architecture/MICROSERVICES_PLAN.md). The monolith stays alive during the migration (Phases 1–4) and is deleted only after Phase 4.

Each service lives at `services/<name>/` with its own `src/index.ts`, `package.json`, `tsconfig.json`, and `AGENT.md`. All services share one PostgreSQL instance and the Prisma client/schema in `shared/src/prisma/`. Inter-service traffic uses HTTP (sync) or BullMQ (async) and never goes through the gateway.

| Service | Port | Owns | External APIs |
|---|---|---|---|
| api-gateway | 4000 | Routing, CORS, JWT validation, rate limiting; proxy only | — |
| auth-service | 4001 | Tenant register/login, JWT issuance, password reset | — |
| campaign-service | 4002 | Campaign CRUD, BullMQ campaign + trial-expiry workers | — |
| lead-service | 4003 | Lead CRUD, Places scraping, Gemini qualification, Blacklist | Google Places, Gemini |
| calling-service | 4004 | Vapi outbound calls, CallLog, Vapi webhook, vapi-sync | Vapi.ai |
| crm-service | 4005 | Contacts, Notes, Tasks, Deals | — |
| billing-service | 4006 | Stripe Checkout, Portal, webhook, Subscription lifecycle | Stripe |
| platform-service | 4007 | PlatformUser auth, Orgs, Plans, Metrics, AuditLog (admin app) | — |
| notification-service | 4008 | All email templates + SMTP transport (`POST /internal/send-email`) | Nodemailer/SMTP |
| analytics-service | 4009 | `/api/stats` + `/api/analytics` aggregations (read-only) | — |

Ownership boundaries (enforced via each service's `AGENT.md`):
- A service touches only files under its own `services/<name>/` folder.
- Only **notification-service** imports `nodemailer`; everyone else POSTs `http://notification-service:4008/internal/send-email`.
- Only **platform-service** verifies `PLATFORM_JWT_SECRET`; that secret must not be set on any tenant-facing service container.
- The Stripe webhook (`/api/billing/webhook`) keeps its raw body — the gateway must not parse JSON for that path.

### Deployment Topology (planned, Wave 3)

The 9-services-plus-gateway layout above is the **logical** model and stays unchanged at the
code level. For production, services will be packed into **3 runtime bundles** to reduce
server footprint and inter-process chatter:

| Bundle | Contains | Why grouped |
|---|---|---|
| **edge** | `api-gateway` | Sole public ingress; terminates TLS, enforces CORS, validates JWT, applies rate limits. |
| **core** | `auth-service`, `campaign-service`, `crm-service`, `platform-service`, `analytics-service`, `billing-service` | Stateless request/response + DB-bound services. Share a single Node process pool, all use Prisma. |
| **io** | `lead-service`, `calling-service`, `notification-service` | Outbound vendor I/O (Places, Gemini, Vapi, SMTP). Isolated so a slow upstream never starves core API requests. |

Each bundle is one container/process; services inside a bundle still register their own
Express routers and own their own ports for in-process routing. Logical service boundaries
(ownership in `AGENT.md`) remain authoritative — the bundling is purely a deployment concern.
Compose / Helm definitions for the 3-bundle layout will arrive in Wave 3.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Backend runtime | Node.js + TypeScript (tsx watch in dev, tsc in prod) |
| Backend framework | Express.js |
| ORM | Prisma (PostgreSQL) |
| Database | PostgreSQL |
| Job queue | BullMQ + Redis |
| Frontend | Next.js 14+ (App Router) |
| Frontend auth | NextAuth.js (JWT strategy) |
| Admin app | Next.js 14+ (App Router) |
| AI qualification | Google Gemini 2.5 (`@google/generative-ai`) |
| Lead discovery | Google Places API |
| Outbound calling | Vapi.ai |
| Billing | Stripe (Checkout + Webhooks) |
| Email | Nodemailer (custom HTML templates) |
| Containerisation | Docker Compose |

---

## All API Routes

### Tenant Routes (require `Authorization: Bearer <tenant_jwt>`)
```
POST   /api/auth/login
POST   /api/auth/register
POST   /api/auth/forgot-password
POST   /api/auth/reset-password

GET    /api/campaigns
POST   /api/campaigns
GET    /api/campaigns/:id
PATCH  /api/campaigns/:id
DELETE /api/campaigns/:id

GET    /api/leads
POST   /api/leads/csv-upload
GET    /api/leads/:id
PATCH  /api/leads/:id

GET    /api/contacts
POST   /api/contacts
GET    /api/contacts/:id
PATCH  /api/contacts/:id
DELETE /api/contacts/:id

GET    /api/deals
POST   /api/deals
PATCH  /api/deals/:id
DELETE /api/deals/:id

GET    /api/tasks
POST   /api/tasks
PATCH  /api/tasks/:id
DELETE /api/tasks/:id

GET    /api/notes
POST   /api/notes
DELETE /api/notes/:id

GET    /api/stats
GET    /api/analytics
GET    /api/blacklist
POST   /api/blacklist
DELETE /api/blacklist/:id

GET    /api/settings
PATCH  /api/settings

POST   /api/vapi/webhook
GET    /api/vapi/sync

POST   /api/billing/checkout
POST   /api/billing/portal
POST   /api/billing/webhook   ← raw body, before express.json()

GET    /api/demo/...

/health  ← no auth, returns { status: "ok" }
```

### Platform Routes (require `PLATFORM_JWT_SECRET`)
```
POST   /api/platform/auth/login

GET    /api/platform/organizations
GET    /api/platform/organizations/:id
PATCH  /api/platform/organizations/:id/status

GET    /api/platform/plans
POST   /api/platform/plans
PATCH  /api/platform/plans/:id

GET    /api/platform/metrics
```

---

## Data Models (Prisma Schema Summary)

**Multi-tenancy root**: `Organization` — everything belongs to an org.

> **Note:** Tenants no longer supply API keys. The legacy `ApiKey` model is removed.
> All upstream credentials (Google Maps, Gemini, Vapi, Stripe, SMTP) are platform-owned
> and accessed exclusively via `@callora/shared`'s `getSecret()`.

```
Organization
  ├── users[]           (User: ADMIN | MEMBER | VIEWER)
  ├── campaigns[]       (Campaign: AI | CSV; DRAFT→RUNNING→COMPLETED/PAUSED_QUOTA/FAILED)
  │     └── leads[]
  ├── leads[]           (Lead: NEW→CALLED→QUALIFIED/DISQUALIFIED/PENDING_RETRY/PENDING_FOLLOWUP)
  │     └── calls[]     (CallLog: duration, transcript, summary, vapiCallId, cost)
  ├── contacts[]        (Contact: businessName, phone, email)
  ├── notes[]           (Note: NOTE | CALL | EMAIL | STATUS_CHANGE)
  ├── tasks[]           (Task: title, dueDate, completed, assignedTo)
  ├── deals[]           (Deal: PROSPECT→QUALIFIED→PROPOSAL→NEGOTIATION→WON/LOST, value, probability)
  ├── blacklist[]       (Blacklist: phoneNumber, reason)
  ├── subscription      (Subscription → Plan; Stripe IDs; TRIALING→ACTIVE→PAST_DUE→CANCELED)
  ├── usage[]           (UsageRecord: monthly callsMade, leadsScraped, aiTokens)
  ├── vapiNumber?       (OrgVapiNumber: dedicated Vapi number per paid org; trials use shared pool)
  ├── spendCap?         (SpendCap: dailyCents, monthlyCents — hard cutoff for upstream spend)
  └── dncEntries[]      (DncEntry: phoneNumber, source, scrubbedAt — Do-Not-Call list)

Platform-level (separate from tenants):
  PlatformUser          (super-admin, separate JWT secret)
  Plan                  (FREE | STARTER | PRO | ENTERPRISE; quotas, Stripe price IDs)
  AuditLog              (actorType, actorId, action, target, metadata)
  KeyAccessLog          (service, keyName, orgId?, accessedAt — every getSecret() call)
```

**Org status lifecycle**: `TRIAL → ACTIVE → PAST_DUE / SUSPENDED / CANCELED`
- `requireAuth` middleware returns 402 for SUSPENDED/CANCELED
- Tenant signup auto-creates TRIALING subscription on FREE plan
- Upgrades via Stripe Checkout → webhook

---

## Auth System (Two Separate JWTs)

### Tenant Auth
1. Frontend calls `POST /api/auth/login` → gets JWT signed with `NEXTAUTH_SECRET`
2. NextAuth stores JWT in session: `{ accessToken, organizationId, userId, role }`
3. Server Actions read token from session → pass as `Authorization: Bearer <token>` to backend
4. Backend `auth.ts` middleware decodes → attaches `req.user = { id, organizationId, role }`

### Platform Auth
- `POST /api/platform/auth/login` → JWT signed with `PLATFORM_JWT_SECRET`
- Backend `platformAuth.ts` middleware decodes → attaches `req.platformUser`
- Admin Next.js app uses separate NextAuth instance pointing at platform endpoints

---

## Environment Variables

### Backend / Service `.env` (platform-owned secrets — see `docs/ops/SECRETS.md`)
```env
DATABASE_URL=
NEXTAUTH_SECRET=               # tenant JWT secret (shared with frontend) — REQUIRED
PLATFORM_JWT_SECRET=           # platform JWT secret (admin app + platform-service ONLY) — REQUIRED

# Secret backend selector: "env" for local dev, "aws" for prod (AWS Secrets Manager)
SECRETS_BACKEND=env

# Upstream vendor keys — REQUIRED platform secrets. Never per-tenant. Never returned via API.
GOOGLE_MAPS_API_KEY=           # REQUIRED — platform-owned
GEMINI_API_KEY=                # REQUIRED — platform-owned
VAPI_PRIVATE_KEY=              # REQUIRED — platform-owned
VAPI_PHONE_NUMBER_ID=          # REQUIRED — shared trial pool number; paid orgs auto-provision dedicated numbers

STRIPE_SECRET_KEY=             # REQUIRED
STRIPE_WEBHOOK_SECRET=         # REQUIRED
STRIPE_PRICE_FREE=
STRIPE_PRICE_STARTER=
STRIPE_PRICE_PRO=
STRIPE_PRICE_ENTERPRISE=

# Stripe metered-billing meter IDs (Model B PAYG)
STRIPE_METER_CALL_MINUTES=
STRIPE_METER_LEADS_QUALIFIED=
STRIPE_METER_NUMBER_RENTAL=

# Spend caps + trial limits (cents). Applied per-org unless overridden by SpendCap row.
DAILY_SPEND_CAP_DEFAULT_CENTS=2000
MONTHLY_SPEND_CAP_DEFAULT_CENTS=50000
TRIAL_CALL_CAP=25

TENANT_APP_ORIGIN=http://localhost:3000
ADMIN_APP_ORIGIN=http://localhost:3001
TRIAL_DAYS=14                  # optional, default 14

# Only for seeding
PLATFORM_ADMIN_EMAIL=
PLATFORM_ADMIN_PASSWORD=
PLATFORM_ADMIN_NAME=
```

### Frontend `.env`
```env
NEXTAUTH_URL=http://localhost:3000
NEXTAUTH_SECRET=               # same as backend
API_URL=http://localhost:4000  # server-side (SSR)
NEXT_PUBLIC_API_URL=http://localhost:4000  # client-side
# In Docker: NEXT_PUBLIC_API_URL=http://backend:4000
```

### Admin `.env`
```env
NEXTAUTH_URL=http://localhost:3001
NEXTAUTH_SECRET=               # same secret
NEXT_PUBLIC_PLATFORM_API_URL=http://localhost:4000
```

---

## Common Commands

### Docker (full stack recommended)
```bash
docker compose up                    # start all: DB, Redis, backend, frontend
docker compose restart backend       # restart backend only
docker compose down -v               # stop + wipe volumes
```

### Backend
```bash
cd backend
npm run dev          # tsx watch (hot reload) on port 4000
npm run build        # tsc → dist/
npm start            # node dist/index.js
npm run seed:admin   # seed platform admin user
```

### Frontend
```bash
cd frontend
npm run dev          # Next.js dev on port 3000
npm run build
npm run lint
```

### Admin
```bash
cd admin
npm run dev          # Next.js dev on port 3001
```

### Database
```bash
cd backend
npx prisma migrate dev       # create + apply migration
npx prisma migrate deploy    # apply in production
npx prisma studio            # GUI on port 5555
npx prisma generate          # regenerate client after schema change
```

---

## Key Coding Conventions

### TypeScript
- Strict TypeScript throughout. No `any` unless absolutely unavoidable — prefer `unknown` + narrowing.
- ESM imports with `.js` extension on relative imports (even for `.ts` source files): `import x from './lib/prisma.js'`
- Vendor wrappers are classes (e.g. `GeminiService`, `VapiService`). Instantiate with credentials returned from `getSecret()` — never with values pulled directly from `process.env` or from any tenant-controlled field.

### Backend Patterns
- All tenant routes must extract `req.user` from the `requireAuth` middleware — never trust client-supplied org IDs.
- Always scope DB queries to `organizationId`: `prisma.lead.findMany({ where: { organizationId: req.user.organizationId } })`
- Check quota before consuming resources: `await assertWithinQuota(organizationId, 'call')` then `await recordUsage(organizationId, 'call', 1)`
- Write to `AuditLog` for any data mutation on the platform layer.
- Stripe webhook route (`/api/billing/webhook`) must be registered **before** `express.json()` — it needs raw body for signature verification. This is already correct in `index.ts`. Do not reorder routes.

### Frontend Patterns
- All API calls from frontend go through **Server Actions** in `src/app/actions/` — never `fetch()` directly in client components.
- Server Actions read the session token with NextAuth's `getServerSession` and forward it to the backend.
- Use Next.js App Router conventions: server components by default, `'use client'` only when needed (forms, interactive charts).
- Route groups: `(auth)` for unauthenticated pages, `(dashboard)` for authenticated, `(marketing)` for public pages.

### Database / Prisma
- Always run `npx prisma generate` after changing `schema.prisma`.
- Never write raw SQL — use Prisma client exclusively.
- Migrations live in `backend/prisma/migrations/` — commit them.

### Naming
- Database model fields: `camelCase`
- API JSON keys: `camelCase`
- Enum values: `SCREAMING_SNAKE_CASE`
- Files: `camelCase.ts` for services/lib, `kebab-case.ts` for routes

---

## Background Workers (BullMQ)

Two workers boot on server start via `workers/index.ts`:

**`campaignWorker`** — processes `campaign:call` jobs:
1. Loads campaign + org from DB; resolves vendor credentials via `getSecret()` (platform-owned)
2. Marks campaign `RUNNING`
3. For each leadId: checks quota + spend cap + DNC scrub → calls Vapi (using org's `OrgVapiNumber` if paid, else shared trial pool) → polls for result → runs Gemini summarization → updates Lead status + CallLog → sends `qualifiedLead` email if score ≥ threshold
4. On quota or spend-cap exhaustion: marks campaign `PAUSED_QUOTA`
5. On completion: marks campaign `COMPLETED`

**`trialExpiryWorker`** — scheduled: checks orgs where trial has ended → transitions status to `PAST_DUE` → sends expiry email.

Redis connection config is in `lib/queue.ts`.

---

## Email Templates

Templates are TypeScript functions that return HTML strings. All use `_layout.ts` for the outer shell (header, footer, branding).

| File | Trigger |
|---|---|
| `welcome.ts` | New tenant registration |
| `qualifiedLead.ts` | Lead qualifies (interest score ≥ threshold) |
| `trialExpiry.ts` | Trial period ends |
| `passwordReset.ts` | Forgot password flow |

Use `sendEmail()` from `lib/email.ts` — never import nodemailer directly in routes/workers.

---

## Agent Roles & Ownership Boundaries

When running sub-agents in parallel, keep these boundaries clean:

| Agent Role | Owns | Never Touches |
|---|---|---|
| Backend Engineer | `backend/src/routes/`, `backend/src/services/`, `backend/src/lib/` | Frontend, Admin, Prisma schema without migration |
| Frontend Engineer | `frontend/src/app/`, `frontend/src/` | Backend routes, Admin |
| Admin Engineer | `admin/src/` | Frontend, Backend business logic |
| DB/Schema Agent | `backend/prisma/schema.prisma` + migrations | Application code |
| Worker Agent | `backend/src/workers/` | Routes, Frontend |
| QA Agent | `backend/src/__tests__/` | Production code (read-only) |

---

## Off Limits — Do Not Modify Without Explicit Instruction

- `legacy_cli/` — archived, read-only reference
- `backend/prisma/migrations/` — never edit migration files directly, only add new ones via `prisma migrate dev`
- Stripe webhook route ordering in `backend/src/index.ts` — billing route must stay before `express.json()`
- `PLATFORM_JWT_SECRET` handling — never expose to tenant routes
- Any file in `node_modules/`

---

## Current Product State (as of last update)

### Built & Working
- Multi-tenant auth (register, login, JWT, roles)
- Campaign management (AI + CSV types)
- Google Places lead discovery
- Gemini AI lead qualification
- Vapi.ai outbound calling with call logging
- Follow-up automation (retry logic, follow-up scheduling)
- CRM: Contacts, Notes, Tasks, Deals (pipeline/kanban)
- Analytics dashboard (call volume, cost breakdown, outcome funnel)
- Blacklist management
- Platform admin (tenant management, plan management, metrics)
- Stripe billing (Checkout, Customer Portal, Webhooks)
- Trial lifecycle (TRIALING → ACTIVE → PAST_DUE)
- Email notifications (welcome, qualified lead, trial expiry, password reset)
- Quota enforcement per plan tier
- Audit logging (platform actions)
- Docker Compose full-stack setup

### Production Hardening (Waves 1-4 — complete)
- 3-bundle compact deploy (`edge`/`core`/`io`) under `bundles/` + `docker-compose.compact.yml`; 512 MiB / 0.75 vCPU per bundle
- Centralized `getSecret()` in `@callora/shared/secrets` (env backend in dev, AWS Secrets Manager in prod) with TTL cache + `KeyAccessLog`
- Per-org Vapi number auto-provisioning for paid orgs; shared trial-pool numbers
- Stripe metered billing (Model B PAYG) with per-org daily/monthly spend caps + auto-suspend
- Anomaly detector (rolling-baseline x `ANOMALY_MULTIPLIER`) with per-org overrides
- Platform-wide DNC scrub on every campaign tick
- Circuit breakers around Gemini, Vapi, Google Places (env-flag bypass for incident response)
- Ops docs: `docs/ops/SECRETS.md`, `docs/ops/COMPACT_DEPLOY.md`, `docs/ops/INCIDENT_PLAYBOOK.md`

### Known Incomplete / TODO Areas
- No automated test coverage beyond `tenant-isolation.test.ts`
- Admin app is minimal (no charts, no audit log viewer)
- No 2FA implementation (field exists in PlatformUser but unused)
- Marketing landing page and pricing page are stubs
- Legacy `backend/` monolith retained until Phase 4 verification completes, then deletes

---

## Security Rules (Always Follow)

1. **Tenant isolation is non-negotiable** — every query must be scoped to `req.user.organizationId`. A tenant must never see another tenant's data.
2. **API keys are platform secrets only** — never stored per-tenant, never returned in any API response (not even masked), and never logged. Always fetched via `@callora/shared`'s `getSecret()` (which writes to `KeyAccessLog`). Reading `process.env.GOOGLE_MAPS_API_KEY` (or any other vendor key) directly inside service business logic is forbidden — it bypasses the audit trail and the AWS-Secrets-Manager backend.
3. **Platform routes are fully separate** — use `platformAuth` middleware, not `requireAuth`. Never mix them.
4. **Password reset tokens** expire and are single-use (see `PasswordResetToken` model).
5. **Stripe webhooks** must verify signature with `STRIPE_WEBHOOK_SECRET` before processing.
6. **Spend caps are enforced server-side** — every upstream-cost action (Vapi call, Gemini token, Places query) must check the org's `SpendCap` before dispatch and abort with a clear error if exceeded.
7. **DNC scrub is mandatory** — before any outbound dial, the calling-service must verify the target number is not in `DncEntry` for the org or globally.

---

## AI Agent Instructions

- **Assume multi-tenancy by default.** Any new feature touching data must scope to `organizationId`.
- **Check quota AND spend cap** before any action that consumes calls, leads, AI tokens, or vendor spend.
- **Always fetch upstream credentials via `getSecret()` from `@callora/shared`.** Never read `process.env` directly for vendor keys (Google Maps, Gemini, Vapi, Stripe, SMTP) inside service business logic — it bypasses the secrets backend abstraction and the `KeyAccessLog` audit trail. Reading `process.env` for non-secret config (ports, URLs, feature flags) is fine.
- **Never expose vendor keys to the tenant API surface.** No GET endpoint may return them (even masked); no Server Action may forward them; no email/log line may include them.
- **Never rename or migrate away from Callora branding.** EzLeadsAI is dead.
- **When adding a new route**, register it in the owning service's `src/index.ts` and add the corresponding Server Action in `frontend/src/app/actions/`.
- **When changing Prisma schema**, always create a migration (`npx prisma migrate dev --name <description>`) and regenerate the client.
- **When adding a new secret**, follow the steps in `docs/ops/SECRETS.md` (env.example → service config manifest → deploy).
- **Prefer server components** in Next.js. Only use `'use client'` when the component needs browser APIs or React hooks.
- **When in doubt about a feature**, check `docs/setup/PLATFORM_SETUP.md` for the platform run-book.
- **Do not introduce new dependencies without good reason.** Prefer using what's already in the stack.
- **Keep email templates inside notification-service** — do not create inline HTML strings in routes or workers, and do not import `nodemailer` outside notification-service.
