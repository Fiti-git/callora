# Callora — Before & After: Kavinda Handoff → Fiti-git Development

> **Context:** Kavinda Silva built the original system (2025-12-22 to 2026-01-27).
> Fiti-git (`work@fathitech.com.lk`) took over from 2026-04-01 onwards.
> This document shows the exact state at handoff and what Fiti-git built on top of it.

---

## THE HANDOFF POINT
**Last Kavinda commit:** `18b1555` — 2026-01-27
**First Fiti-git commit:** `ac5c63d` — 2026-04-01 (gap of ~2 months)

---

## PART 1 — What Kavinda Built (Before Fiti-git)

### System Overview at Handoff
A functional but bare MVP: the AI calling pipeline worked end-to-end, but the product had no CRM features, no analytics, no blacklist UI, and campaigns only supported one type (AI / Google Places). The UI was minimal and functional only.

---

### Backend at Handoff

#### Routes available
| Route | What it did |
|-------|-------------|
| `POST /auth/register` | Create user + org |
| `POST /auth/login` | Login, return JWT |
| `GET/PUT /settings` | Save API keys |
| `GET/POST /campaigns` | List / create campaigns |
| `GET /campaigns/:id` | Campaign detail with leads |
| `POST /campaigns/:id/scrape` | Scrape leads via Google Places |
| `POST /campaigns/:id/call` | Trigger Vapi outbound calls |
| `GET /leads` | List leads |
| `GET /stats` | Basic dashboard stats |

**No:** blacklist routes, analytics routes, follow-up routes, contacts, notes, tasks, deals, demo route

#### Database Schema at Handoff
Models that existed:
- `User` — basic fields only, **no role field**
- `Organization` — name, users, campaigns, leads, blacklist (model existed but no UI/route)
- `ApiKey` — Google Maps, Gemini, Vapi keys
- `Campaign` — name, **prompt only** (no `type` field — only AI campaigns possible), status (DRAFT/RUNNING/COMPLETED)
- `Lead` — businessName, address, phone, status (NEW/CALLED/QUALIFIED/DISQUALIFIED), interestScore — **no notes, no follow-up fields, no CRM relations**
- `CallLog` — duration, status, transcript, summary — **no vapiCallId, no cost fields**
- `Blacklist` — model existed but had no backend route or UI

**Missing models entirely:** `Contact`, `Deal`, `Task`, `Note`

#### AI Services at Handoff
- `places.ts` — Google Places search (working)
- `gemini.ts` — Lead qualification + call summarization (working)
- `vapi.ts` — Outbound call orchestration (working, basic)

---

### Frontend at Handoff

#### Pages that existed
| Page | What it showed |
|------|---------------|
| `/login` | Basic login form |
| `/register` | Basic register form |
| `/dashboard` | Simple stats cards (total leads, campaigns, calls) |
| `/campaigns` | List of campaigns |
| `/campaigns/new` | Create a campaign (name + prompt only) |
| `/campaigns/[id]` | Campaign detail — leads table + run controls |
| `/leads` | Global leads list |
| `/settings` | API key management form |

**No:** analytics page, blacklist page, follow-ups page, demo page, pipeline page, tasks page

#### Components at Handoff
| Component | Purpose |
|-----------|---------|
| `campaign-controls.tsx` | Scrape / Call buttons with progress |
| `confirmation-modal.tsx` | Reusable confirm dialog (just added in last commit) |
| `settings-form.tsx` | API key form |
| `sign-out-button.tsx` | Sign out |

**No:** sidebar component (navigation was in layout), csv-import, lead-call-details, blacklist-manager, analytics charts, follow-up components, CRM components, theme provider, toast system

#### Navigation
- Navigation was hardcoded inside the dashboard `layout.tsx` — no dedicated sidebar component
- No dark/light mode
- No toast notifications

#### Campaign Creation
- Only AI type supported
- Just two fields: Campaign Name + Search Prompt

---

## PART 2 — What Fiti-git Built (2026-04-01 to 2026-04-08)

8 days, 9 commits, transforming the MVP into a full product.

---

### Commit-by-Commit Breakdown

---

#### `ac5c63d` — 2026-04-01 | Campaign Types + CSV Import UI
**Problem solved:** Campaigns were locked to AI/Places only. Users with existing lead lists had no way to use the system.

**What was added:**
- `type` field added to Campaign model (`AI` or `CSV`)
- Campaign creation page redesigned — user now picks a type first
- CSV import UI built into the new campaign flow
- Campaign list page updated to show campaign type badge
- Campaign detail page restructured

---

#### `6cbf9e9` — 2026-04-02 | CSV Import Component + Lead Call Details
**Problem solved:** No way to import leads from a file. No way to see call history details per lead.

**What was added:**
- `CsvImport` component — file upload, column validation, lead preview before import
- `LeadCallDetails` component — expandable panel per lead showing all call logs, summaries, transcripts
- `notes` column added to Lead model (migration applied)
- Backend route to handle CSV lead creation added to `campaigns.ts`

---

#### `17d89cf` — 2026-04-02 | Blacklist Management
**Problem solved:** Blacklist model existed in DB since Kavinda's schema but had zero UI or API routes.

**What was added:**
- `blacklist.ts` backend route — `GET`, `POST`, `DELETE /blacklist`
- Blacklist wired into `index.ts`
- `/blacklist` frontend page
- `BlacklistManager` component — full CRUD table (add phone + reason, delete)
- `blacklist.ts` server actions
- `sidebar.tsx` — **extracted navigation into its own component for the first time**, with links to all modules

---

#### `eab5d3b` — 2026-04-03 | UI Polish Pass
**Problem solved:** UI was functional but visually inconsistent. Login/register pages were plain Next.js defaults.

**What was added:**
- Login + register pages redesigned with branding
- All dashboard pages (campaigns, leads, blacklist, dashboard, campaign detail/new) restyled consistently
- All existing components (campaign-controls, confirmation-modal, csv-import, lead-call-details, settings-form, blacklist-manager) refactored for better aesthetics
- Sidebar refined

---

#### `82c0ea3` — 2026-04-04 | Follow-Up Automation Backend + Documentation
**Problem solved:** Once a call was done, there was no automated way to retry failed calls or schedule follow-ups. CLAUDE.md and system docs were missing.

**What was added:**
- Follow-up config fields added to Campaign: `maxRetryAttempts`, `retryDelayHours`, `followUpDelayDays`
- Lead model extended: `callAttempts`, `nextCallAt`, `followUpAt`, new statuses (`PENDING_RETRY`, `PENDING_FOLLOWUP`)
- Campaign calling logic updated to handle retry logic and follow-up scheduling
- Gemini and Vapi services updated for improved qualification accuracy
- `CLAUDE.md` and `AboutSystem.md` documentation written
- Blacklist compiled into dist

---

#### `cee0cb6` — 2026-04-05 | Follow-Ups Pages + Scheduling UI
**Problem solved:** The automation logic existed but there was no UI to see or manage follow-ups.

**What was added:**
- `/follow-ups` page — list all leads with scheduled follow-ups, status, next call time
- `/follow-ups/settings` page — configure retry/callback rules per campaign
- `ScheduleFollowupModal` — manually schedule a follow-up for any lead with date picker
- `ScheduleFollowupTrigger` — inline button on lead rows to open modal
- `FollowUpActions` — action buttons per follow-up entry
- `FollowupSettingsForm` — form component for retry/delay configuration
- Sidebar updated with Follow-Ups link
- Backend: `PATCH /leads/:id/schedule-followup` endpoint added
- Backend: `PATCH /campaigns/:id/followup-settings` endpoint added

---

#### `f595bc8` — 2026-04-06 | Analytics Module
**Problem solved:** No way to see performance data — call volume, costs, outcomes, funnel conversion.

**What was added:**
- `/analytics` backend route — aggregates data from Lead, CallLog, Campaign
- CallLog extended: `vapiCallId`, `cost`, `costBreakdown` fields (migration applied)
- `/analytics` frontend page with 6 visualizations:
  - **Call Volume Chart** — calls over time
  - **Outcome Donut** — QUALIFIED / DISQUALIFIED / CALLED / NEW breakdown
  - **Cost Breakdown Chart** — cost by component
  - **Cost Trend Chart** — spending over time
  - **Lead Funnel** — Scraped → Filtered → Called → Qualified
  - **Campaign Table** — per-campaign stats with totals
- Analytics server action added
- Sidebar updated with Analytics link

---

#### `1312d7d` — 2026-04-08 | Demo Call Page + Dashboard Redesign + Theme
**Problem solved:** No way to test Vapi calling without a real campaign. Dashboard was static. No dark mode.

**What was added:**
- `/demo` page — interactive Vapi demo call simulator in the browser
- `demo.ts` backend route — handles demo call logic
- `stats.ts` backend route expanded with activity feed data
- Dashboard page redesigned — activity feed, recent events, task widget preview
- `ThemeProvider` — full dark/light mode toggle, persisted
- Sidebar updated with dark mode toggle
- `CampaignRefresh` component — auto-refresh on campaign detail page
- `Toast` UI component added
- App title updated to "EzLeads.ai"

---

#### `2b7e5d0` — 2026-04-08 | Full CRM Layer + Team + Vapi Sync
**Problem solved:** No CRM features. Leads existed in isolation with no contacts, deals, tasks, or notes system.

**What was added:**

**Backend routes (new files, unregistered — need wiring):**
- `contacts.ts` — contact CRUD
- `deals.ts` — deal pipeline CRUD
- `notes.ts` — notes CRUD
- `tasks.ts` — task CRUD
- `vapi-sync.ts` — sync Vapi call data back to DB

**Database schema additions:**
- `User` — added `role` field (ADMIN/MEMBER/VIEWER), `assignedLeads`, `assignedTasks`, `assignedDeals`, `notes` relations
- `Organization` — added `contacts`, `notes`, `tasks`, `deals` relations
- `Campaign` — `prompt` made optional (required for CSV type to work without prompt)
- `Lead` — added `contactId`, `assignedToId`, `leadNotes`, `tasks` CRM relations
- **4 new models:** `Contact`, `Deal`, `Task`, `Note`

**Frontend components:**
- `ActivityTimeline` — chronological activity per lead/contact
- `ContactActions` — create/edit contact from a lead
- `DealBoard` — Kanban pipeline board with drag-between-stage support
- `TaskWidget` — upcoming tasks dashboard widget
- `TaskActions` — create/complete/edit tasks
- `TeamManager` — view org members and roles
- `VapiSyncCard` — manual Vapi sync trigger with status

**New pages:**
- `/pipeline` — deal kanban board
- `/pipeline/[id]` — deal detail
- `/tasks` — task list

**Server actions added:** `notes.ts`, `tasks.ts`, `vapi-sync.ts`, `contacts.ts`, `deals.ts`

---

## PART 3 — Side-by-Side Comparison

### Database

| Model / Field | Before (Kavinda) | After (Fiti-git) |
|---------------|-----------------|-----------------|
| `User.role` | Not present | ADMIN / MEMBER / VIEWER |
| `User` CRM relations | None | assignedLeads, assignedTasks, assignedDeals, notes |
| `Campaign.type` | Not present (AI only) | AI or CSV |
| `Campaign` follow-up config | Not present | maxRetryAttempts, retryDelayHours, followUpDelayDays |
| `Lead.notes` | Not present | Added |
| `Lead` follow-up state | Not present | callAttempts, nextCallAt, followUpAt |
| `Lead` statuses | NEW, CALLED, QUALIFIED, DISQUALIFIED | + PENDING_RETRY, PENDING_FOLLOWUP |
| `Lead` CRM relations | None | contactId, assignedToId, leadNotes, tasks |
| `CallLog.cost` | Not present | cost, costBreakdown, vapiCallId |
| `Contact` model | Not present | Full model |
| `Deal` model | Not present | Full model (6 pipeline stages) |
| `Task` model | Not present | Full model |
| `Note` model | Not present | Full model (4 types) |

---

### Backend Routes

| Route | Before | After |
|-------|--------|-------|
| `/blacklist` CRUD | Schema only, no route | Full CRUD routes |
| `/analytics` | Not present | Full aggregation endpoint |
| `/leads?status=` | Basic only | Filter by status, schedule follow-up |
| `/campaigns/:id/followup-settings` | Not present | Added |
| `/demo` | Not present | Added |
| `/contacts` | Not present | Added (needs wiring) |
| `/notes` | Not present | Added (needs wiring) |
| `/tasks` | Not present | Added (needs wiring) |
| `/deals` | Not present | Added (needs wiring) |
| `/vapi-sync` | Not present | Added (needs wiring) |

---

### Frontend Pages

| Page | Before (Kavinda) | After (Fiti-git) |
|------|-----------------|-----------------|
| `/dashboard` | Basic stats cards | Activity feed, task widget, redesigned |
| `/campaigns/new` | Name + prompt only | Type picker (AI/CSV), CSV upload flow |
| `/campaigns/[id]` | Leads table, run buttons | + Call details expansion, follow-up controls |
| `/blacklist` | Not present | Full management page |
| `/analytics` | Not present | 6-chart analytics page |
| `/follow-ups` | Not present | Follow-up management page |
| `/follow-ups/settings` | Not present | Per-campaign retry configuration |
| `/demo` | Not present | Interactive Vapi demo page |
| `/pipeline` | Not present | Deal Kanban board |
| `/pipeline/[id]` | Not present | Deal detail |
| `/tasks` | Not present | Task list page |

---

### UI System

| Feature | Before | After |
|---------|--------|-------|
| Navigation | Hardcoded in layout.tsx | Dedicated `sidebar.tsx` component |
| Dark mode | Disabled (explicitly turned off) | Full dark/light toggle with ThemeProvider |
| Toast notifications | Not present | Global toast system |
| App name | "Create Next App" (default) | "EzLeads.ai" |
| Login/Register design | Unstyled defaults | Branded, redesigned |

---

## PART 4 — What Still Needs Attention (for SRS)

These are items Fiti-git added that are **not yet fully wired up**:

1. **Backend routes for contacts, deals, notes, tasks, vapi-sync** — files exist in `backend/src/routes/` but are not yet imported/registered in `backend/src/index.ts` (visible as untracked files in git status)
2. **Role-based access control** — `role` field exists on User, but middleware doesn't enforce roles yet
3. **No invite/add user flow** — TeamManager shows existing members, but no UI to invite new members to an org
4. **No inbound Vapi webhook** — call results are synced manually via VapiSyncCard; no automatic webhook handler
5. **No email/notification system** — follow-ups are time-based only; no alerts sent to users
6. **No password reset** — auth has register + login only

---

*Document generated: 2026-04-11 | For use in SRS authoring*
