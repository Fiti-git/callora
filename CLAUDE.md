# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Product Name

**Callora** — by Redot Global (redot.global)
Previously called "EzLeadsAI" — this name is retired. Use "Callora" everywhere: UI text, email templates, page titles, meta tags, error messages, and all user-facing strings. Never use "EzLeadsAI" in new code.

## Project Overview

Callora is a multi-tenant SaaS platform for AI-powered lead generation, built by Redot Global. The pipeline is: Google Places API (business discovery) → Gemini AI (qualification) → Vapi.ai (outbound calling).

## Repository Structure

```
Callora/
├── backend/       # Express.js API server (port 4000)
├── frontend/      # Tenant Next.js app (port 3000)
├── admin/         # Platform super-admin Next.js app (port 3001)
└── legacy_cli/    # Archived CLI implementation (reference only)
```

## Common Commands

### Docker (recommended for full-stack dev)
```bash
docker compose up          # Start all services (DB, backend, frontend)
docker compose restart backend   # Restart backend only
```

### Backend
```bash
cd backend
npm run dev      # tsx watch mode on port 4000
npm run build    # tsc compilation to dist/
npm start        # Run compiled dist/index.js
```

### Frontend
```bash
cd frontend
npm run dev      # Next.js dev server on port 3000
npm run build    # Production build
npm run lint     # ESLint
```

### Database
```bash
cd backend
npx prisma migrate dev     # Apply migrations
npx prisma studio          # Open Prisma Studio GUI
npx prisma generate        # Regenerate Prisma client
```

## Architecture

### Backend (`backend/src/`)
- **Entry point**: `src/index.ts` — Express server, CORS, JSON middleware
- **Routes**: `src/routes/` — auth, campaigns, leads, settings, stats, blacklist
- **Services**: `src/services/`
  - `gemini.ts` — Gemini 2.5 AI for lead qualification and call summarization
  - `places.ts` — Google Places API for business discovery
  - `vapi.ts` — Vapi.ai outbound call orchestration
- **Prisma**: `prisma/schema.prisma` defines all models; client at `src/lib/prisma.ts`

### Frontend (`frontend/src/`)
- **App Router** with two route groups: `(auth)/` and `(dashboard)/`
- **Server Actions** in `src/app/actions/` handle all API communication to the backend
- **NextAuth** configured in `src/auth.ts` — JWT sessions carry `accessToken` and `organizationId`
- API calls from server actions use `Authorization: Bearer <token>` headers

### Data Model (multi-tenant)
`Organization` is the top-level tenant. Each org owns `User`s, `Campaign`s, `Lead`s, `CallLog`s, `Blacklist` entries, `ApiKey`s, and a single `Subscription` (→ `Plan`).

Organization status: `TRIAL → ACTIVE → PAST_DUE/SUSPENDED/CANCELED`. `requireAuth` middleware blocks SUSPENDED/CANCELED (returns 402) and PAST_DUE.

Campaign types: `AI` (Places API scraping) or `CSV` (bulk upload). Campaign status: `DRAFT → RUNNING → COMPLETED`.

### Platform Tier
Above tenants sits a platform layer:
- `PlatformUser` — super-admin accounts (separate table, separate JWT secret)
- `Plan` — FREE/STARTER/PRO/ENTERPRISE with quotas (calls, leads, seats) + Stripe price ID
- `Subscription` — links Org to Plan; Stripe customer/subscription IDs
- `UsageRecord` — monthly per-org meter (callsMade, leadsScraped, aiTokens)
- `AuditLog` — platform + tenant actions trail

Platform API routes live under `/api/platform/*` and require `PLATFORM_JWT_SECRET`. The `admin/` Next.js app consumes them. Tenant signup auto-creates a TRIALING subscription on the FREE plan; upgrades flow through Stripe Checkout (`/api/billing/checkout` → webhook at `/api/billing/webhook`). Setup run-book: [docs/setup/PLATFORM_SETUP.md](docs/setup/PLATFORM_SETUP.md).

### Auth Flow
1. Frontend calls `/api/auth` (backend) to get JWT
2. NextAuth stores JWT in session with `accessToken`
3. Server actions extract token and forward as `Bearer` to backend
4. Backend middleware validates JWT and attaches `req.user`

## Environment Variables

Backend needs: `DATABASE_URL`, `NEXTAUTH_SECRET` (tenant JWT), `PLATFORM_JWT_SECRET`, `GOOGLE_MAPS_API_KEY`, `GEMINI_API_KEY`, `VAPI_PRIVATE_KEY`, `VAPI_PHONE_NUMBER_ID`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_FREE/STARTER/PRO/ENTERPRISE`, `TENANT_APP_ORIGIN`, `ADMIN_APP_ORIGIN`, `TRIAL_DAYS` (optional, default 14)

Seeding: `PLATFORM_ADMIN_EMAIL`, `PLATFORM_ADMIN_PASSWORD`, `PLATFORM_ADMIN_NAME` required only when running `npm run seed:admin`.

Frontend needs: `NEXTAUTH_URL`, `NEXTAUTH_SECRET`, `API_URL` (server) / `NEXT_PUBLIC_API_URL` (client)

Admin app needs: `NEXTAUTH_URL=http://localhost:3001`, `NEXTAUTH_SECRET`, `NEXT_PUBLIC_PLATFORM_API_URL`

In Docker, `NEXT_PUBLIC_API_URL=http://backend:4000` for inter-container communication.

## Key Conventi