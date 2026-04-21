# About Callora

---

## What Is Callora?

Callora is a **B2B SaaS platform** that automates the entire outbound sales pipeline — from finding business leads to calling them using AI voice agents — so sales teams spend their time closing deals, not doing manual prospecting.

The platform is built for **sales agencies, SDR teams, and small-to-medium businesses** who need to generate and qualify leads at scale without hiring more people.

---

## The Problem It Solves

Traditional outbound sales is slow and expensive:

1. Someone manually searches for potential business clients online
2. They decide one by one if each business is worth calling
3. They make the calls themselves — most go unanswered or unqualified
4. Interested leads get logged manually into a spreadsheet or CRM

This process is repetitive, time-consuming, and does not scale. A single sales rep can realistically make 50–80 calls per day. Callora can run thousands.

---

## How It Works

```
User creates a Campaign
        ↓
Google Places API discovers real local businesses matching the user's criteria
        ↓
Gemini AI (Google) reads each business and scores its relevance / interest
        ↓
Vapi.ai places automated AI voice calls to qualified leads
        ↓
Call transcripts and summaries are saved — sales rep reviews only the interested ones
        ↓
Interested leads move into a CRM pipeline for follow-up and deal closing
```

Alternatively, users can skip discovery and upload their own leads via CSV, then let the AI call them automatically.

---

## Who It Is Built For

| Customer Type | How They Use It |
|---------------|----------------|
| **Sales Agencies** | Run automated calling campaigns on behalf of multiple clients from one platform |
| **In-house Sales Teams** | Automate SDR (Sales Development Rep) work — prospecting, calling, follow-ups |
| **Real Estate Agents** | Find and call local businesses about property or commercial deals |
| **Insurance Agencies** | Reach SME owners at scale for insurance product pitches |
| **Recruitment Firms** | Contact businesses that may be hiring |

---

## Key Features

### 1. AI Lead Discovery
Automatically finds local businesses using Google Places API based on a keyword search prompt. No manual list building needed.

### 2. CSV Lead Import
Users can upload their own lead lists in CSV format. The platform validates, previews, and imports them ready for calling.

### 3. AI Lead Qualification
Before calling, Google Gemini AI evaluates each discovered lead against the campaign's target profile and scores its relevance. Only high-scoring leads get called — no wasted calls.

### 4. Automated Outbound Calling (Vapi.ai)
The platform places AI voice calls to qualified leads automatically. Each call is recorded, transcribed, and summarised by AI. The sales rep sees a clean summary — not a raw transcript — for every call.

### 5. Follow-Up Automation
Leads that did not answer are automatically retried. Leads that expressed interest are automatically scheduled for follow-up calls. Configurable retry limits and delay windows per campaign.

### 6. Blacklist Management
Organisations maintain a blacklist of phone numbers that should never be called. These are automatically excluded from all campaigns.

### 7. CRM Pipeline
A built-in lightweight CRM to manage qualified leads through to closed deals:
- **Contacts** — business records linked to leads
- **Deals** — Kanban pipeline board (Prospect → Qualified → Proposal → Negotiation → Won/Lost)
- **Tasks** — assign follow-up tasks to team members with due dates
- **Notes & Activity Timeline** — full history of calls, notes, and status changes per lead or contact

### 8. Analytics & Reporting
Visual dashboards showing call volume over time, lead funnel conversion (Discovered → Filtered → Called → Qualified), cost per lead, cost per qualified lead, outcome distribution, and per-campaign performance breakdowns.

### 9. Team Management
Multiple users per organisation with role-based access (Admin, Member, Viewer). Leads, tasks, and deals are assignable to specific team members.

### 10. Demo Call
A sandbox environment where users can test the AI voice agent configuration before running a real campaign.

---

## Technology Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 14 (React), TypeScript, Tailwind CSS |
| Backend | Express.js, Node.js, TypeScript |
| Database | PostgreSQL with Prisma ORM |
| Authentication | NextAuth.js with JWT sessions |
| AI — Qualification | Google Gemini 2.5 |
| AI — Lead Discovery | Google Places API |
| AI — Voice Calling | Vapi.ai |
| Infrastructure | Docker, Docker Compose |

---

## Multi-Tenant Architecture

Callora is built as a **multi-tenant SaaS platform**. Each customer account belongs to an **Organisation** — a top-level tenant that owns all its data (campaigns, leads, contacts, deals, users). All data is strictly isolated between organisations. No organisation can access another's data.

Each organisation stores its own API credentials for Google Maps, Gemini, and Vapi — giving full control over which third-party accounts and billing are used.

---

## Current Development Status

The platform has been in active development since December 2025. The following modules are fully implemented:

- User authentication and organisation setup
- Campaign creation (AI and CSV types)
- Google Places lead discovery
- Gemini AI lead qualification
- Vapi.ai outbound calling
- Call logging with transcripts and AI summaries
- Follow-up automation engine
- Blacklist management
- CRM layer (contacts, deals, tasks, notes)
- Analytics and reporting dashboard
- Dark/light theme, toast notifications, responsive UI

The following are planned for the next development phase:

- Subscription and billing (Stripe integration)
- Email notifications (task reminders, call summaries, billing alerts)
- Team invitation by email
- Password reset flow
- CSV export of leads and call logs
- Marketing website (public-facing product site)
- Enterprise SSO / white-label for agencies

---

## Business Model

Callora operates on a **monthly SaaS subscription model**, tiered by usage:

| Plan | Target Customer | Key Limits |
|------|----------------|-----------|
| Starter | Solo SDR / small team | 3 campaigns, 500 leads/mo, 200 calls/mo |
| Growth | Sales teams of 5–20 | 20 campaigns, 5,000 leads/mo, 2,000 calls/mo |
| Agency | Agencies with multiple clients | Unlimited campaigns, 25,000 leads/mo, 10,000 calls/mo |
| Enterprise | Large sales organisations | Custom limits, dedicated support, SLA |

A **14-day free trial** is offered on the Growth plan for new organisations.

---

## Competitive Position

Callora sits in a unique intersection of three categories:

- **Lead generation tools** (like Apollo.io) — but we go further by actually making the calls
- **Outbound calling platforms** (like Convoso) — but we add AI discovery and qualification before dialling
- **CRM tools** (like Close CRM) — but we automate the top of the funnel that CRMs assume is already done

The result: a single platform that handles the full outbound journey from *"find me businesses to sell to"* all the way to *"here are the interested ones, manage them to close."*

---

*Callora — Automated Outbound Sales, End to End.*
*Document prepared: April 2026*
