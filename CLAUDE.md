# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

EzLeadsAI is a multi-tenant SaaS platform for AI-powered lead generation. The pipeline is: Google Places API (business discovery) → Gemini AI (qualification) → Vapi.ai (outbound calling).

## Repository Structure

```
EzLeadsAI/
├── backend/       # Express.js API server (port 4000)
├── frontend/      # Next.js app with App Router (port 3000)
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
`Organization` is the top-level tenant. Each org owns `User`s, `Campaign`s, `Lead`s, `CallLog`s, `Blacklist` entries, and encrypted `ApiKey`s (Google Maps, Gemini, Vapi stored per-org).

Campaign types: `AI` (Places API scraping) or `CSV` (bulk upload). Campaign status: `DRAFT → RUNNING → COMPLETED`.

### Auth Flow
1. Frontend calls `/api/auth` (backend) to get JWT
2. NextAuth stores JWT in session with `accessToken`
3. Server actions extract token and forward as `Bearer` to backend
4. Backend middleware validates JWT and attaches `req.user`

## Environment Variables

Backend needs: `DATABASE_URL`, `JWT_SECRET`, `GOOGLE_MAPS_API_KEY`, `GEMINI_API_KEY`, `VAPI_PRIVATE_KEY`, `VAPI_PHONE_NUMBER_ID`

Frontend needs: `NEXTAUTH_URL`, `NEXTAUTH_SECRET`, `NEXT_PUBLIC_API_URL` (points to backend)

In Docker, `NEXT_PUBLIC_API_URL=http://backend:4000` for inter-container communication.

## Key Conventions

- Both backend and frontend use ES modules (`"type": "module"`)
- Backend TypeScript targets ES2020 with Node16 module resolution
- Frontend uses `@/*` path alias for `src/`
- Zod schemas are used for request validation in backend routes
- `react-hook-form` + Zod for frontend form validation
