# Developer Contribution Report — Fiti-git
### Callora Platform | April 2026
**Prepared for:** Tech Lead & CEO
**Developer:** Fiti-git (work@fathitech.com.lk)
**Review Period:** 2026-04-01 to 2026-04-08

---

## Executive Summary

Fiti-git joined the Callora project on **1 April 2026**, inheriting a working but minimal AI calling pipeline built by the original developer (Kavinda Silva). Over **8 calendar days**, Fiti-git transformed the MVP into a full-featured B2B SaaS platform — adding 7 major feature modules, expanding the database from 6 to 10 models, growing the codebase from 9 to 15+ pages, and contributing **8,119 lines of new code** across 90 files.

| Metric | Before Fiti-git | After Fiti-git |
|--------|----------------|----------------|
| Total commits contributed | 0 | 9 commits |
| Lines of code added | — | 8,119 lines added |
| Files changed | — | 90 files |
| Database models | 6 | 10 (+4 new models) |
| Application pages | 9 | 15+ pages |
| Backend API routes | 8 | 20+ routes |
| Frontend components | 6 | 25+ components |
| Feature modules | 3 | 10 |
| Days to deliver | — | 8 days |

---

## The Starting Point — What Was Inherited

When Fiti-git took over, the project had:

- A working AI calling pipeline (Google Places → Gemini → Vapi)
- Basic campaign creation (AI type only — one search prompt, no CSV support)
- A plain leads list page
- A settings page for API keys
- A basic dashboard with static numbers
- A `Blacklist` model in the database with **no backend route and no UI**
- Navigation hardcoded directly inside the layout file
- No sidebar component, no dark mode, no analytics, no follow-up system, no CRM

The original developer had stopped work **two months before Fiti-git joined** (last commit: 27 January 2026). No documentation existed. No `CLAUDE.md` guidance file existed.

---

## Work Delivered — Commit by Commit

---

### Commit 1 — `ac5c63d` | 1 April 2026
**Campaign Type System + CSV Import Architecture**

The system only supported AI-based lead discovery. Users who had existing lead lists had no way to use the platform. Fiti-git:

- Added a `type` field (`AI` or `CSV`) to the Campaign database model with a migration
- Completely redesigned the campaign creation page — users now choose campaign type first, then see the relevant form
- Built the campaign detail page to conditionally render controls based on campaign type
- Updated the campaign list to display type badges
- Laid the architectural groundwork for CSV lead ingestion

**Files changed:** 9 | **Lines added:** 329

---

### Commit 2 — `6cbf9e9` | 2 April 2026
**CSV Import Component + Lead Call Details**

- Built `CsvImport` — a full file upload component with column validation, required field checking, lead preview table before confirmation, and error messaging for bad files
- Built `LeadCallDetails` — an expandable panel on every lead row showing the full call history: call status, duration, AI-generated summary, and full transcript
- Added the `notes` field to the Lead database model with migration
- Added backend route to handle bulk CSV lead creation for a campaign
- Fixed a Gemini and Vapi service import path issue inherited from the original codebase

**Files changed:** 11 | **Lines added:** 473

**Impact:** Users can now import thousands of existing leads in seconds, rather than being locked into AI discovery only.

---

### Commit 3 — `17d89cf` | 2 April 2026
**Blacklist Management — Full Module**

The `Blacklist` database model had existed since the original developer's schema but had zero backend routes and zero UI. It was unusable. Fiti-git delivered the entire module in one commit:

- Created `blacklist.ts` backend route with `GET`, `POST`, `DELETE` endpoints, all scoped to `organizationId`
- Registered the blacklist route in the main server `index.ts`
- Created the `/blacklist` frontend page
- Built `BlacklistManager` component — full CRUD table: add a phone number with reason, delete entries, display date added
- Created `blacklist.ts` server actions for the frontend
- **Extracted navigation out of the layout file** and built a dedicated `sidebar.tsx` component — the first proper navigation component in the project, with links to all modules and active route highlighting

**Files changed:** 8 | **Lines added:** 420

**Impact:** A legally critical feature (do-not-call list) went from zero to fully operational. The sidebar component also resolved a structural problem that was making navigation unmanageable.

---

### Commit 4 — `eab5d3b` | 3 April 2026
**Full UI Consistency Overhaul**

The UI was functional but visually inconsistent across pages — each page had been built independently with different styles, spacing, and component patterns. Fiti-git did a full pass across every existing page and component:

- Redesigned the Login and Register pages with branding, proper layout, and visual polish
- Standardised styling across: Dashboard, Campaigns list, Campaign detail, Campaign creation, Leads page, Settings, Blacklist
- Refactored all existing components: `campaign-controls`, `confirmation-modal`, `csv-import`, `lead-call-details`, `settings-form`, `blacklist-manager`
- Refined the sidebar with consistent active states and spacing

**Files changed:** 17 | **Lines added:** 1,020

**Impact:** The product went from looking like a developer prototype to a product ready for customer-facing use.

---

### Commit 5 — `82c0ea3` | 4 April 2026
**Follow-Up Automation Engine + Documentation**

The most technically complex commit. The system had no concept of retrying failed calls or scheduling follow-ups. Fiti-git built the entire automation logic:

- Extended the Campaign model with follow-up configuration: `maxRetryAttempts`, `retryDelayHours`, `followUpDelayDays`
- Extended the Lead model with automation state: `callAttempts`, `nextCallAt`, `followUpAt`
- Added two new lead statuses: `PENDING_RETRY` and `PENDING_FOLLOWUP`
- Built the outcome routing function — determines what happens to a lead after each call:
  - Call completed + Qualified → `PENDING_FOLLOWUP` (follow-up scheduled after X days)
  - No answer / Voicemail + attempts remaining → `PENDING_RETRY` (retry after X hours)
  - No answer / Voicemail + max attempts reached → `CALLED` (no more auto-calls)
  - Call completed + Not qualified → `CALLED` (done)
- Updated Gemini qualification logic for improved accuracy
- Updated Vapi service for more robust call handling
- **Wrote `CLAUDE.md`** — the developer guidance file that documents the entire architecture, conventions, environment setup, and codebase structure for all future developers
- **Wrote `AboutSystem.md`** — a plain-language explanation of what the product does and why

**Files changed:** 15 | **Lines added:** 672

**Impact:** The platform moved from "one-shot calling" to a genuine automation engine that manages leads across multiple touchpoints without manual intervention.

---

### Commit 6 — `cee0cb6` | 5 April 2026
**Follow-Up Management UI — Full Module**

With the automation engine built, Fiti-git built the complete frontend to manage it:

- Created `/follow-ups` page — lists all leads with scheduled follow-up or retry calls, showing: business name, status, next call time, attempt count, campaign name
- Created `/follow-ups/settings` page — per-campaign configuration of retry delays and follow-up windows
- Built `ScheduleFollowupModal` — a full modal with date/time picker for manually scheduling a follow-up on any lead
- Built `ScheduleFollowupTrigger` — inline button on lead rows to open the modal
- Built `FollowUpActions` — action buttons (reschedule, cancel) per follow-up entry
- Built `FollowupSettingsForm` — form component for the retry/delay settings
- Added `PATCH /leads/:id/schedule-followup` backend endpoint for manual scheduling
- Added `PATCH /campaigns/:id/followup-settings` backend endpoint
- Updated sidebar with Follow-Ups navigation link

**Files changed:** 10 | **Lines added:** 962

**Impact:** Sales managers now have full visibility and control over the automated follow-up pipeline. The 962-line single commit represents one of the most feature-complete single deliverables in the project's history.

---

### Commit 7 — `f595bc8` | 6 April 2026
**Analytics Module — Full Module**

The platform had no way to measure performance. No charts, no conversion data, no cost tracking. Fiti-git built the entire analytics system:

**Backend:**
- Created `/analytics` route — aggregates data across Lead, CallLog, and Campaign tables
- Added `cost`, `costBreakdown`, and `vapiCallId` fields to CallLog with database migration
- Updated Vapi service to capture and return cost breakdown data from every call

**Frontend — 6 Visualisations built from scratch:**
- `CallVolumeChart` — daily call count over time (bar/line chart via Recharts)
- `OutcomeDonut` — QUALIFIED / DISQUALIFIED / CALLED / NEW distribution (donut chart)
- `CostTrendChart` — cumulative spend over time
- `CostBreakdownChart` — cost split by campaign (bar chart)
- `FunnelDisplay` — lead conversion funnel: Discovered → AI Filtered → Called → Qualified with percentage conversion rates
- `CampaignTable` — per-campaign stats table: leads, calls made, qualified count, total cost, cost per qualified lead

- Added `analytics.ts` server action
- Added Analytics link to sidebar
- Added Recharts as a dependency

**Files changed:** 19 | **Lines added:** 1,786

**Impact:** The platform can now demonstrate ROI to customers — the key number every sales manager needs to justify the subscription cost.

---

### Commit 8 — `1312d7d` | 8 April 2026
**Demo Call Page + Dashboard Redesign + Dark/Light Theme**

Three significant features in one commit:

**Demo Call Page (`/demo`):**
- Real phase tracking with animated stepper: Connecting → Calling → Analysing → Done
- Two-column layout with live elapsed call timer
- Rotating contextual tips while waiting
- Qualified lead result banner with interest score ring display
- Auto-loads call history after completion
- Backend `demo.ts` route for handling demo call logic without affecting real campaigns

**Dashboard Redesign:**
- Replaced the static stub dashboard with a live activity feed
- Added quick action buttons: New Campaign, Demo Call, Analytics
- Built `GET /stats/activity` backend endpoint returning: recent calls, new campaigns, new contacts
- Added `CampaignRefresh` component — polls the backend automatically when a campaign is running, updating the UI without manual refresh

**Theme System:**
- Built `ThemeProvider` component with `localStorage` persistence — theme survives page reload
- Added flash-prevention script — prevents white flash on dark mode page load
- Full `dark:` variant support across all pages and components
- Dark/light toggle button added to sidebar
- Updated app title from "Create Next App" to "EzLeads.ai"
- Built `Toast` UI component for user feedback notifications

**Files changed:** 14 | **Lines added:** 1,166

---

### Commit 9 — `2b7e5d0` | 8 April 2026
**Full CRM Layer + Team Manager + Vapi Sync**

The largest single commit — delivering an entirely new product layer on top of the calling platform:

**Database — 4 new models added:**
- `Contact` — business contact records, unique per phone+org, linked to leads
- `Deal` — sales pipeline entries with 6 stages, value, probability, close date
- `Task` — assignable action items with due dates and completion tracking
- `Note` — activity log entries with 4 types: NOTE, CALL, EMAIL, STATUS_CHANGE

**User model extended:** Added `role` field (ADMIN/MEMBER/VIEWER), added relations to assigned leads, tasks, deals, and notes

**Backend — 5 new route files:**
- `contacts.ts` — full CRUD for contacts
- `deals.ts` — deal pipeline CRUD
- `tasks.ts` — task management CRUD
- `notes.ts` — notes CRUD
- `vapi-sync.ts` — sync Vapi call data back to the platform

All registered in `index.ts`.

**Frontend — 8 new components:**
- `ActivityTimeline` — chronological activity feed per lead/contact (calls, notes, status changes)
- `ContactActions` — convert a lead to a contact, edit contact details
- `DealBoard` — full Kanban pipeline board with deals grouped by stage, total value per stage
- `TaskWidget` — dashboard widget showing upcoming and overdue tasks
- `TaskActions` — create, complete, and edit tasks inline
- `TeamManager` — view all organisation members with roles
- `VapiSyncCard` — manual trigger to sync call results from Vapi API

**Frontend — 3 new pages:**
- `/pipeline` — Deal Kanban board
- `/pipeline/[id]` — Deal detail page
- `/tasks` — Full task management page

**Frontend — 5 new server action files:**
- `contacts.ts`, `deals.ts`, `notes.ts`, `tasks.ts`, `vapi-sync.ts`

**Additional refinements:**
- `requireRole()` middleware function added to auth for future role enforcement
- Settings page extended with additional configuration options
- All existing pages updated for dark mode support

**Files changed:** 50 | **Lines added:** 2,228

**Impact:** The platform is no longer just an outbound calling tool — it is a complete sales workflow product: find leads, call them automatically, manage the qualified ones through a pipeline, assign tasks, log notes, and close deals. This is the difference between a point solution and a platform.

---

## By The Numbers

### Code Volume

| Commit | Date | Lines Added | Files Changed | Feature |
|--------|------|-------------|--------------|---------|
| ac5c63d | Apr 1 | 329 | 9 | Campaign types + CSV architecture |
| 6cbf9e9 | Apr 2 | 473 | 11 | CSV import + call details |
| 17d89cf | Apr 2 | 420 | 8 | Blacklist + sidebar |
| eab5d3b | Apr 3 | 1,020 | 17 | UI overhaul |
| 82c0ea3 | Apr 4 | 672 | 15 | Follow-up engine + docs |
| cee0cb6 | Apr 5 | 962 | 10 | Follow-up UI |
| f595bc8 | Apr 6 | 1,786 | 19 | Analytics module |
| 1312d7d | Apr 8 | 1,166 | 14 | Demo + Dashboard + Theme |
| 2b7e5d0 | Apr 8 | 2,228 | 50 | CRM layer |
| **TOTAL** | **8 days** | **9,056 lines** | **153 file ops** | **7 major modules** |

*Note: 627 lines removed (cleanup/refactoring) = net 8,119 lines added*

### Feature Modules Delivered

| Module | Backend Routes Added | Frontend Pages | Components Built |
|--------|---------------------|---------------|-----------------|
| CSV Campaign type | 1 | Redesigned existing | CSV import |
| Blacklist | 3 | 1 new | 1 new |
| Follow-up Automation | 3 | 2 new | 4 new |
| Analytics | 1 | 1 new (6 charts) | 6 chart components |
| Demo Call | 1 | 1 new | — |
| Theme System | — | — | ThemeProvider, Toast |
| CRM (Contacts, Deals, Tasks, Notes) | 5 new files | 3 new | 8 new |

### Database Growth

| Model | Status | Added By |
|-------|--------|---------|
| User | Extended (role, CRM relations) | Fiti-git |
| Organization | Extended (CRM relations) | Fiti-git |
| Campaign | Extended (type, follow-up config) | Fiti-git |
| Lead | Extended (notes, follow-up state, CRM relations) | Fiti-git |
| CallLog | Extended (vapiCallId, cost, costBreakdown) | Fiti-git |
| Blacklist | Route + UI built | Fiti-git |
| **Contact** | **New model** | **Fiti-git** |
| **Deal** | **New model** | **Fiti-git** |
| **Task** | **New model** | **Fiti-git** |
| **Note** | **New model** | **Fiti-git** |

---

## Quality Observations

**What was done well:**

1. **Each commit is atomic and deployable** — every commit represents a complete, working feature, not half-finished work
2. **Backend and frontend delivered together** — no commit leaves a route without a UI or a UI without a route
3. **Database migrations included** — every schema change includes the Prisma migration file, ensuring the DB can be reproduced cleanly
4. **Documentation written alongside code** — `CLAUDE.md` and `AboutSystem.md` were written during development, not as an afterthought
5. **Existing code respected** — the original Vapi and Gemini services were improved, not rewritten unnecessarily
6. **Dark mode applied consistently** — rather than adding dark mode to new components only, it was applied retroactively across all existing pages

**What remains to be completed:**

1. **Role enforcement** — `requireRole()` middleware exists but is not yet applied to specific routes. Any logged-in user can currently perform admin actions.
2. **Billing system** — Stripe integration not started. This is the revenue blocker for launch.
3. **Email notifications** — password reset, team invitations, and billing alerts not yet built.
4. **Vapi webhook** — call results are currently fetched by polling. A proper webhook listener is needed for production scale.
5. **CSV exports** — users cannot download their lead or analytics data yet.
6. **Marketing website** — no public-facing site exists to drive signups.

---

## Assessment

In 8 days, Fiti-git took a two-month-old stalled MVP and delivered what would typically be estimated as 6–8 weeks of development work:

- 7 new feature modules
- 4 new database models
- 9,056 lines of code
- Full documentation
- A product that went from "AI calling tool" to "complete outbound sales platform"

The work is structured, committed cleanly, and covers both backend and frontend for each feature. The codebase is in a better state than when it was inherited — both in functionality and in documentation.

The remaining items (billing, email, webhooks, website) are well-defined and represent the final layer needed before public launch.

---

*Report prepared: April 2026 | Callora Development Review*
