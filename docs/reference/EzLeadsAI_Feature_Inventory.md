# Callora — Feature Inventory for SRS Preparation

> **Purpose:** This document maps every implemented feature from the first commit to the latest, grouped by functional area. Use this as the primary input for writing the Software Requirements Specification (SRS).

---

## 1. Development Timeline Overview

| Date | Commit | What Was Built |
|------|--------|---------------|
| 2025-12-22 | `9521f85` | Core AI pipeline (CLI prototype): Places API, Gemini, Vapi |
| 2025-12-22 | `ea34b3b` | Project scaffold: Next.js frontend, Express backend, Prisma ORM |
| 2025-12-27 | `16f7ecf` | Backend API routes: auth, campaigns, leads, settings, stats |
| 2025-12-28 | `4ead64e` | Decoupled scrape/call steps; AI filtering in campaign run |
| 2025-12-28 | `dac4d03` | Campaign ID validation, error handling |
| 2026-01-27 | `18b1555` | Prisma migrations, custom confirmation modal |
| 2026-04-01 | `ac5c63d` | Campaign types (AI / CSV), campaign creation revamp |
| 2026-04-02 | `6cbf9e9` | CSV lead import, Lead Call Details component |
| 2026-04-02 | `17d89cf` | Blacklist management (API + UI), sidebar component |
| 2026-04-03 | `eab5d3b` | UI polish across all pages, login/register redesign |
| 2026-04-04 | `82c0ea3` | Follow-up automation (backend logic), documentation |
| 2026-04-05 | `cee0cb6` | Follow-ups page, follow-up settings page, scheduling modal |
| 2026-04-06 | `f595bc8` | Analytics module (charts, funnel, cost breakdown) |
| 2026-04-08 | `1312d7d` | Demo Call page, Dashboard activity feed, dark/light theme |
| 2026-04-08 | `2b7e5d0` | CRM layer: contacts, deals pipeline, tasks, notes, team manager, Vapi sync |

---

## 2. Feature Inventory by Module

---

### 2.1 Authentication & Multi-Tenancy

**Status: Implemented**

- User registration (email + password, hashed)
- User login — returns JWT
- JWT-based session management via NextAuth
- Multi-tenant data isolation — all data scoped to `organizationId`
- Role-based access: `ADMIN`, `MEMBER`, `VIEWER` roles on User model
- Session carries `accessToken` and `organizationId`
- All backend routes protected by JWT middleware

**Data model:** `User`, `Organization`

---

### 2.2 API Key Management (Settings)

**Status: Implemented**

- Per-organization encrypted API key storage
- Keys stored: Google Maps API Key, Gemini API Key, Vapi Private Key, Vapi Phone Number ID
- Settings page UI with form to save/update keys
- Keys retrieved at runtime per org for all service calls

**Data model:** `ApiKey`

---

### 2.3 Campaign Management

**Status: Implemented**

#### Campaign Types
- **AI Campaign** — discovers leads automatically via Google Places API based on a search prompt
- **CSV Campaign** — leads imported from a CSV file uploaded by the user

#### Campaign Lifecycle
- Status flow: `DRAFT → RUNNING → COMPLETED`
- **Create Campaign** — choose type, name, search prompt (AI) or upload file (CSV)
- **List Campaigns** — paginated list with status badges
- **Campaign Detail Page** — shows leads, controls, call progress

#### Campaign Execution (AI type)
- Step 1 — **Scrape Leads**: calls Google Places API with the prompt, saves raw leads to DB
- Step 2 — **Call Leads**: AI filters scraped leads via Gemini, then places Vapi outbound calls
- Steps are decoupled — user can scrape first, review, then call

#### Follow-Up Automation Config (per campaign)
- `maxRetryAttempts` — max call retry count (default 3)
- `retryDelayHours` — hours between retries (default 24)
- `followUpDelayDays` — days before a follow-up call (default 3)

**Data model:** `Campaign`

---

### 2.4 Lead Management

**Status: Implemented**

#### Lead Discovery (AI)
- Google Places API integration (`places.ts`)
- Search by keyword/prompt
- Fields captured: business name, address, phone

#### Lead Import (CSV)
- CSV upload component with column validation
- Required columns: `businessName`, `phone`
- Preview table before import confirmation
- Imported leads stored with `notes` field

#### Lead Statuses
`NEW → CALLED → QUALIFIED / DISQUALIFIED / PENDING_RETRY / PENDING_FOLLOWUP`

#### Lead Detail
- Call log history per lead (expandable)
- Call summaries and transcripts (from Vapi + Gemini)
- Interest score (AI-generated, 0–100)
- Call attempt count, `nextCallAt`, `followUpAt` timestamps

#### Lead List / Global Leads Page
- Filter leads by status
- View all leads across campaigns

**Data model:** `Lead`, `CallLog`

---

### 2.5 AI Services

**Status: Implemented**

#### Google Places API (`places.ts`)
- Business discovery by search query
- Returns name, address, phone number
- Configurable per-org API key

#### Gemini AI (`gemini.ts`)
- **Lead Qualification** — evaluates each lead against campaign criteria, returns `qualified` boolean + interest score
- **Call Summarization** — post-call: generates summary from Vapi transcript
- Model: Gemini 2.5 (configurable)

#### Vapi.ai (`vapi.ts`)
- Outbound call orchestration
- Configurable phone number and assistant
- Returns `callId`, `duration`, `status`, `transcript`, `cost`, `costBreakdown`
- Vapi call data synced back to CallLog

---

### 2.6 Outbound Calling

**Status: Implemented**

- Automated outbound calling via Vapi.ai
- Campaign-level calling triggered from Campaign Controls UI
- Per-call result: duration, status, transcript, AI summary, cost
- Call logs stored in `CallLog` table with full breakdown

---

### 2.7 Follow-Up Automation

**Status: Implemented**

#### Backend Logic
- Leads with status `PENDING_RETRY` — re-called after `retryDelayHours`
- Leads with status `PENDING_FOLLOWUP` — re-called after `followUpDelayDays`
- `callAttempts` tracked; stops retrying after `maxRetryAttempts`

#### Frontend
- **Follow-Ups Page** (`/follow-ups`) — list of leads with scheduled follow-ups, status, next call time
- **Follow-Up Settings Page** (`/follow-ups/settings`) — configure retry/callback conditions per campaign
- **Schedule Follow-Up Modal** — manually schedule a follow-up for any lead
- **Follow-Up Actions Component** — inline action buttons on lead rows

---

### 2.8 Blacklist Management

**Status: Implemented**

- Add phone numbers to a per-org blacklist with optional reason
- List all blacklisted numbers
- Delete a blacklist entry
- Backend route: `GET /blacklist`, `POST /blacklist`, `DELETE /blacklist/:id`
- Blacklisted numbers are excluded from outbound calls
- **Blacklist Manager UI** — full CRUD table on `/blacklist` page

**Data model:** `Blacklist`

---

### 2.9 Analytics

**Status: Implemented**

#### Charts & Visualizations
- **Call Volume Chart** — calls per day/period (line/bar chart)
- **Outcome Distribution (Donut)** — QUALIFIED / DISQUALIFIED / CALLED / NEW breakdown
- **Cost Breakdown Chart** — cost by campaign or call component
- **Cost Trend Chart** — cost over time
- **Lead Funnel Display** — funnel: Scraped → AI Filtered → Called → Qualified
- **Campaign Table** — per-campaign stats (leads, calls, qualified count, total cost)

#### Backend Analytics Route
- `/analytics` endpoint aggregates data from `Lead`, `CallLog`, `Campaign` tables
- Filters by date range, campaign

**Data model:** Reads from `Lead`, `CallLog`, `Campaign`

---

### 2.10 CRM Layer

**Status: Implemented (latest — 2026-04-08)**

#### Contacts
- Contact records linked to leads
- Fields: businessName, phone, address, email
- Unique per phone + organization
- **Contact Actions component** — create/edit/view contact from lead

#### Deal Pipeline
- Kanban-style **Deal Board** (`/pipeline`)
- Deal stages: `PROSPECT → QUALIFIED → PROPOSAL → NEGOTIATION → WON / LOST`
- Fields: title, value (£/$ amount), probability (0–100%), close date, notes
- Deals linked to Contact and assignable to User
- Deal detail page (`/pipeline/[id]`)

#### Tasks
- Tasks linked to leads or contacts
- Fields: title, description, due date, assignee
- Completion tracking with `completedAt` timestamp
- **Task Widget** — dashboard widget showing upcoming tasks
- **Task Actions component** — create/edit/complete tasks

#### Notes
- Notes attached to leads or contacts
- Types: `NOTE`, `CALL`, `EMAIL`, `STATUS_CHANGE`
- Author tracked
- **Activity Timeline component** — chronological view of notes/activity per lead/contact

#### Team Manager
- UI to view organization members
- Role display (ADMIN / MEMBER / VIEWER)

**Data model:** `Contact`, `Deal`, `Task`, `Note`

---

### 2.11 Dashboard

**Status: Implemented**

- Summary stats cards: total leads, campaigns, calls made, qualified leads
- **Activity Feed** — recent events across the org (calls, new leads, status changes)
- **Task Widget** — upcoming tasks due
- Quick navigation to campaigns, analytics, follow-ups

---

### 2.12 Demo Call

**Status: Implemented**

- `/demo` page — simulates a Vapi AI outbound call in the browser
- Configurable AI script/prompt for demo purposes
- Backend demo route (`demo.ts`) handles call simulation
- Useful for testing Vapi integration without a real campaign

---

### 2.13 Vapi Sync

**Status: Implemented**

- **Vapi Sync Card** component — manually trigger sync of Vapi call data back into the system
- Server action `vapi-sync.ts` fetches updated call records from Vapi API
- Ensures call cost, transcript, and status are up-to-date

---

### 2.14 UI / UX System

**Status: Implemented**

- **Light / Dark mode** toggle — persisted via `ThemeProvider`
- **Sidebar navigation** — collapsible, links to all modules with active state
- **Toast notifications** — success/error feedback on all actions
- **Confirmation Modal** — reusable danger confirmation with loading state
- **Custom Login & Register pages** — branded, responsive
- App title: "EzLeads.ai"
- Responsive layouts across all dashboard pages

---

## 3. Backend API Surface

| Method | Route | Purpose |
|--------|-------|---------|
| POST | `/auth/register` | Create user + org |
| POST | `/auth/login` | Login, return JWT |
| GET/PUT | `/settings` | API key management |
| GET/POST | `/campaigns` | List / create campaigns |
| GET/PATCH/DELETE | `/campaigns/:id` | Campaign detail / update / delete |
| POST | `/campaigns/:id/scrape` | Scrape leads via Places API |
| POST | `/campaigns/:id/call` | Trigger outbound calls |
| PATCH | `/campaigns/:id/followup-settings` | Update follow-up config |
| GET | `/leads` | List all org leads (filterable by status) |
| PATCH | `/leads/:id/schedule-followup` | Schedule a manual follow-up |
| GET/POST/DELETE | `/blacklist` | Blacklist CRUD |
| GET | `/analytics` | Aggregated analytics data |
| GET | `/stats` | Dashboard summary stats |
| POST | `/demo` | Demo call simulation |
| GET/POST | `/contacts` | Contact management |
| GET/POST | `/notes` | Notes CRUD |
| GET/POST/PATCH | `/tasks` | Task management |
| GET/POST/PATCH | `/deals` | Deal pipeline management |
| POST | `/vapi-sync` | Sync Vapi call data |

---

## 4. Technology Stack (for SRS Non-Functional Section)

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 14 (App Router), React, TypeScript, Tailwind CSS |
| Backend | Express.js, TypeScript, Node.js (ES modules) |
| Database | PostgreSQL via Prisma ORM |
| Auth | NextAuth.js (JWT sessions) |
| AI — Qualification | Google Gemini 2.5 |
| AI — Lead Discovery | Google Places API |
| Outbound Calling | Vapi.ai |
| Forms | react-hook-form + Zod validation |
| Charts | (Recharts / charting library used in analytics) |
| Deployment | Docker Compose (backend + frontend + DB containers) |

---

## 5. Data Models Summary

| Model | Key Fields |
|-------|-----------|
| `Organization` | name, users, campaigns, leads, blacklist, contacts, notes, tasks, deals |
| `User` | email, password, name, role (ADMIN/MEMBER/VIEWER), organizationId |
| `ApiKey` | googleMapsKey, geminiKey, vapiKey, vapiPhoneId — 1:1 with Org |
| `Campaign` | name, type (AI/CSV), prompt, status (DRAFT/RUNNING/COMPLETED), follow-up config |
| `Lead` | businessName, phone, address, notes, status, interestScore, callAttempts, nextCallAt, followUpAt |
| `CallLog` | leadId, duration, status, transcript, summary, vapiCallId, cost, costBreakdown |
| `Contact` | businessName, phone, email, address — unique per phone+org |
| `Deal` | title, value, probability, stage (6 stages), closeDate, contactId |
| `Task` | title, description, dueDate, completed, assignedToId, leadId, contactId |
| `Note` | content, type (NOTE/CALL/EMAIL/STATUS_CHANGE), authorId, leadId, contactId |
| `Blacklist` | phoneNumber, reason, organizationId |

---

## 6. Features NOT Yet Implemented (Gaps for SRS)

Based on code inspection, the following are present in the schema/components but may need backend routes completed or are partially stubbed:

- `contacts.ts`, `deals.ts`, `notes.ts`, `tasks.ts` routes are new (untracked files per git status) — backend routes exist but may not be fully wired to `index.ts`
- Team management UI exists but no invite/add user flow is visible
- No email notification system for follow-ups (currently time-based only)
- No webhook endpoint for inbound Vapi call results (currently polling / manual sync)
- No billing / subscription management module
- No export feature (leads, call logs to CSV/PDF)
- No audit log / activity log stored in DB (activity feed is real-time only)
- No two-factor authentication
- No password reset flow

---

*Document generated: 2026-04-11 | Branch: AsDev | For use as SRS input*
