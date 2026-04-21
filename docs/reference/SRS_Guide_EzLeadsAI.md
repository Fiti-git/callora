# Callora — SRS Writing Guide
### Thinking as a Product Owner | B2B SaaS Focus

> This guide walks you through writing a complete Software Requirements Specification for Callora.
> Each section tells you **what to write**, **why it matters for B2B SaaS**, and **what content to include** based on what is already built and what the product needs to become.

---

## HOW TO USE THIS GUIDE

1. Read each section heading and the "What to write" note
2. Use the bullet points as your content — expand each into full sentences/paragraphs
3. Add diagrams where indicated (use draw.io, Lucidchart, or Figma)
4. Mark each requirement with a unique ID (e.g., FR-001, NFR-001)

---

---

# SECTION 1 — INTRODUCTION

## 1.1 Purpose of the Document
Write 1 paragraph:
> This SRS defines the functional and non-functional requirements of Callora — a B2B SaaS platform for AI-powered lead generation and outbound call automation. It is intended for the development team, product stakeholders, and investors.

## 1.2 Product Vision (Write this as your north star)

> **Callora is the operating system for outbound sales teams.**
> It replaces manual prospecting, cold call lists, and disconnected CRMs with a single AI-powered platform that finds businesses, qualifies them, calls them automatically, and manages the entire follow-up pipeline — so sales reps spend time closing, not dialling.

**Target Market:**
- Sales agencies running campaigns for multiple clients (agency model)
- In-house B2B sales teams doing outbound prospecting
- Real estate agents prospecting businesses
- Insurance agencies targeting SMEs
- Recruitment firms targeting businesses

**Why B2B buyers will pay for this:**
- Reduces cost-per-qualified-lead by 60–80% vs manual calling
- Replaces 2–3 SDR (Sales Development Rep) salaries with one platform subscription
- Scales calling volume without hiring
- AI qualification prevents wasted calls — only qualified leads reach human reps

## 1.3 Scope

**In Scope for this version (V1.0):**
- Multi-tenant SaaS platform (web application)
- AI lead discovery via Google Places API
- CSV lead import
- AI qualification via Gemini
- Automated outbound calling via Vapi.ai
- Follow-up automation engine
- CRM lite (contacts, deals, tasks, notes)
- Analytics and reporting
- Blacklist management
- Marketing website (public-facing)
- Subscription and billing (Stripe)
- Team management within an organization

**Out of Scope for V1.0:**
- Mobile application
- Email outreach (phone only)
- Inbound call handling
- Predictive dialler
- Native Salesforce/HubSpot two-way sync (one-way export only)
- White-labelling for resellers

## 1.4 Definitions & Acronyms

| Term | Definition |
|------|-----------|
| Organization | The top-level multi-tenant account. One company = one organization |
| Campaign | A configured batch lead generation + calling job |
| Lead | A discovered or imported business prospect |
| CallLog | Record of one AI phone call with transcript, summary, cost |
| Blacklist | Phone numbers permanently excluded from calling |
| SDR | Sales Development Representative — the human role this product partially automates |
| ICP | Ideal Customer Profile — the type of business a user wants to target |
| PENDING_RETRY | Lead status: call failed, will be retried automatically |
| PENDING_FOLLOWUP | Lead status: lead expressed interest, follow-up call scheduled |
| Vapi | Third-party AI voice call platform used for outbound calls |
| Gemini | Google's AI model used for lead qualification and call summarization |

## 1.5 References
- Google Places API documentation
- Google Gemini API documentation
- Vapi.ai API documentation
- Stripe Billing API documentation
- OWASP Security Guidelines

---

# SECTION 2 — OVERALL DESCRIPTION

## 2.1 Product Perspective

Callora is a standalone SaaS web application. It integrates with:

```
Callora Platform
│
├── Google Places API     → Lead discovery
├── Google Gemini API     → AI qualification + call summarization
├── Vapi.ai               → AI outbound calling
├── Stripe                → Subscription billing
├── PostgreSQL            → Primary database
└── [Future] Twilio/SendGrid → Email notifications
```

**Architecture type:** Multi-tenant SaaS
- One shared database, data isolated by `organizationId`
- Each organization brings their own API keys (BYOK — Bring Your Own Key) for Google/Vapi
- OR the platform provides pooled API access on higher-tier plans

## 2.2 User Classes and Characteristics

| User Type | Who They Are | How They Use the Product |
|-----------|-------------|--------------------------|
| **Organization Admin** | Business owner or sales manager who set up the account | Manages team, billing, API keys, sees all campaigns |
| **Sales Rep (Member)** | SDR or account executive using the platform daily | Creates campaigns, reviews leads, manages follow-ups, updates deals |
| **Viewer** | Manager or client who needs read-only access to reports | Views analytics, lead statuses, campaign performance only |
| **Super Admin** (internal) | Callora operations team | Platform-level admin — manage orgs, billing overrides, support |

## 2.3 Operating Environment
- Web browser: Chrome, Firefox, Safari, Edge (latest 2 versions)
- Responsive design: Desktop primary, tablet secondary
- Hosting: Cloud (AWS/GCP/Azure) with Docker containers
- Database: PostgreSQL 15+
- Node.js: 20+

## 2.4 Design Constraints
- All API keys stored encrypted at rest (AES-256)
- GDPR compliance required — user data deletion on account closure
- Phone numbers in blacklist must be respected across all campaigns in an org
- All calls must comply with TCPA (US) / relevant telemarketing regulations — platform must surface compliance warnings

## 2.5 Assumptions
- Users will provide valid API keys for Google Maps, Gemini, and Vapi
- OR subscribe to a platform-managed plan where Callora provides pooled API access
- Businesses in target regions have phone numbers indexed in Google Places
- Vapi.ai platform remains available and maintains uptime SLA

---

# SECTION 3 — MARKETING WEBSITE REQUIREMENTS

> **Why this matters for B2B SaaS:** Your product does not exist to buyers until they can find it, understand it in 10 seconds, and trust it enough to start a trial. The website IS the product's front door.

## 3.1 Public Website Pages Required

### 3.1.1 Homepage
**Goal:** Convert a cold visitor into a trial signup in one scroll.

Must include:
- **Hero section** — Bold headline + subheadline + primary CTA button
  - Headline example: *"Your AI Sales Team That Never Sleeps"*
  - Subheadline: *"Callora finds local businesses, qualifies them with AI, and calls them automatically. You only talk to interested prospects."*
  - CTA: "Start Free Trial" + "Watch Demo" (secondary)
- **Social proof bar** — logos of types of businesses using it, or stat badges ("10,000+ calls made", "68% reduction in cost-per-lead")
- **How It Works** — 3-step visual: Find → Qualify → Call
- **Feature highlights** — 6 cards: AI Discovery, CSV Import, Vapi Calling, Follow-up Automation, Analytics, CRM Pipeline
- **Pricing teaser** — "Plans from $X/month" link to pricing page
- **Testimonials** — 2–3 quotes from sales teams / agencies
- **Final CTA banner** — "Start automating your outbound today"
- Footer — links, legal, socials

### 3.1.2 Features Page
Dedicated deep-dive on each feature module:
- AI Lead Discovery
- CSV Import & Bulk Upload
- AI Outbound Calling (with Vapi)
- Follow-Up Automation Engine
- CRM Pipeline (Deals, Tasks, Notes)
- Analytics & Reporting
- Team Management
- Blacklist & Compliance Tools

Each feature: headline + 2-line description + screenshot/mockup + bullet list of capabilities

### 3.1.3 Pricing Page
**This is the #1 most important page for B2B SaaS conversion.**

Recommended 3-tier structure:

| Plan | Target | Price | Limits |
|------|--------|-------|--------|
| **Starter** | Solo SDR / small team | $99/mo | 3 campaigns, 500 leads/mo, 200 calls/mo, 2 users |
| **Growth** | Sales teams (5–20 people) | $299/mo | 20 campaigns, 5,000 leads/mo, 2,000 calls/mo, 10 users |
| **Agency** | Agencies with multiple clients | $699/mo | Unlimited campaigns, 25,000 leads/mo, 10,000 calls/mo, unlimited users, client workspaces |
| **Enterprise** | Large sales orgs | Custom | Custom limits, dedicated support, SLA, SSO |

Must show:
- Feature comparison table (checkmarks per plan)
- "Most Popular" badge on Growth
- Annual discount toggle (save 20%)
- FAQ section below pricing cards

### 3.1.4 Use Cases / Solutions Pages
One page per vertical (helps SEO and targeted conversion):
- `/solutions/sales-agencies` — agencies running campaigns for clients
- `/solutions/real-estate` — targeting property investors, businesses
- `/solutions/insurance` — reaching SME owners for insurance
- `/solutions/recruitment` — reaching hiring businesses

### 3.1.5 Blog / Resources
- SEO content: "How to automate B2B cold calling", "Best AI lead generation tools 2026"
- Helps organic discovery

### 3.1.6 Legal Pages
- Privacy Policy (GDPR compliant)
- Terms of Service
- Cookie Policy
- Acceptable Use Policy (important for a calling platform — TCPA)

---

# SECTION 4 — FUNCTIONAL REQUIREMENTS

> Format each requirement as:
> **[ID]** — [Requirement statement] — Priority: High/Medium/Low

---

## 4.1 Authentication & User Management

**FR-AUTH-001** — The system shall allow a new user to register by providing an organization name, full name, email address, and password.
**FR-AUTH-002** — The system shall hash all passwords using bcrypt before storing.
**FR-AUTH-003** — The system shall issue a signed JWT token on successful login with a configurable expiry.
**FR-AUTH-004** — The system shall allow users to log out, invalidating the session.
**FR-AUTH-005** — The system shall allow a user to reset their password via email verification link. *(Not yet built — required)*
**FR-AUTH-006** — The system shall support role-based access: ADMIN, MEMBER, VIEWER per organization.
**FR-AUTH-007** — ADMIN users shall be able to invite new members to the organization by email. *(Not yet built — required)*
**FR-AUTH-008** — ADMIN users shall be able to change a member's role or remove them from the organization.
**FR-AUTH-009** — The system shall prevent VIEWER users from creating or modifying campaigns, leads, or settings.
**FR-AUTH-010** — Each organization shall have isolated data — no user shall access another organization's data under any circumstance.

---

## 4.2 API Key Management

**FR-KEYS-001** — Each organization shall store its own API keys: Google Maps, Gemini, Vapi Private Key, Vapi Phone Number ID.
**FR-KEYS-002** — API keys shall be encrypted at rest using AES-256 before storing in the database.
**FR-KEYS-003** — ADMIN users shall be able to update API keys at any time via the Settings page.
**FR-KEYS-004** — The system shall validate that API keys are functional when saved (test API call on save).
**FR-KEYS-005** — On higher subscription tiers, the platform shall optionally provide pooled API access so users do not need their own keys.

---

## 4.3 Campaign Management

**FR-CAMP-001** — A user shall be able to create a campaign by specifying a name and selecting campaign type: AI Discovery or CSV Import.
**FR-CAMP-002** — AI Campaign creation shall require: campaign name, search prompt (ICP description), target geography.
**FR-CAMP-003** — CSV Campaign creation shall allow uploading a CSV file with at minimum: businessName, phone. Optional: address, notes.
**FR-CAMP-004** — CSV import shall validate columns, show a preview of leads before confirming import, and reject rows with missing required fields.
**FR-CAMP-005** — Campaign status shall transition: DRAFT → RUNNING → COMPLETED.
**FR-CAMP-006** — A user shall be able to pause a RUNNING campaign.
**FR-CAMP-007** — A user shall be able to duplicate an existing campaign.
**FR-CAMP-008** — A user shall be able to delete a DRAFT campaign.
**FR-CAMP-009** — Campaign detail page shall show all leads, their statuses, interest scores, and call logs.
**FR-CAMP-010** — The system shall display real-time call progress during a campaign run (leads called / total, success count).
**FR-CAMP-011** — Each campaign shall have configurable follow-up automation settings: max retries, retry delay hours, follow-up delay days.
**FR-CAMP-012** — Users shall be able to configure the AI call script / voice persona per campaign.

---

## 4.4 Lead Discovery (AI Campaigns)

**FR-DISC-001** — When a user initiates scraping, the system shall call the Google Places API using the campaign prompt.
**FR-DISC-002** — Scraped leads shall be stored with: business name, address, phone number, Places API ID.
**FR-DISC-003** — Duplicate leads (same phone number within the same org) shall not be created.
**FR-DISC-004** — Before calling, each scraped lead shall be evaluated by Gemini AI against the campaign ICP. Only leads scoring above a threshold shall be called.
**FR-DISC-005** — Scraping and calling shall be decoupled steps — users can scrape first, review leads, then trigger calling separately.
**FR-DISC-006** — Blacklisted phone numbers shall be automatically excluded from scraping results.

---

## 4.5 Outbound Calling

**FR-CALL-001** — The system shall place AI outbound calls via Vapi.ai using the organization's Vapi credentials.
**FR-CALL-002** — Each call shall be logged with: call ID, duration, status, transcript, AI summary, cost, cost breakdown.
**FR-CALL-003** — Call summaries shall be generated by Gemini AI from the Vapi transcript after each call.
**FR-CALL-004** — Lead status shall be automatically updated after each call based on the AI summary outcome.
**FR-CALL-005** — If a call fails to connect, the lead shall be placed in PENDING_RETRY status.
**FR-CALL-006** — The system shall track total call count and cost per campaign and per organization per billing period.
**FR-CALL-007** — A Demo Call page shall allow users to test the AI voice agent before running a real campaign.
**FR-CALL-008** — Calls shall never be placed to blacklisted numbers.

---

## 4.6 Follow-Up Automation

**FR-FOLLOW-001** — Leads in PENDING_RETRY shall be automatically re-called after `retryDelayHours` hours, up to `maxRetryAttempts` times.
**FR-FOLLOW-002** — Leads in PENDING_FOLLOWUP shall be automatically re-called after `followUpDelayDays` days.
**FR-FOLLOW-003** — A user shall be able to manually schedule a follow-up for any lead via the Schedule Follow-Up modal.
**FR-FOLLOW-004** — The Follow-Ups page shall list all leads with scheduled follow-up or retry calls, showing next call time and attempt count.
**FR-FOLLOW-005** — Users shall be able to cancel a scheduled follow-up or retry.
**FR-FOLLOW-006** — The system shall send an email or in-app notification when a follow-up call completes. *(Not yet built — required)*

---

## 4.7 Blacklist Management

**FR-BLACK-001** — ADMIN and MEMBER users shall be able to add phone numbers to the organization's blacklist with an optional reason.
**FR-BLACK-002** — The blacklist shall be checked before every call attempt and every scrape result.
**FR-BLACK-003** — Users shall be able to view all blacklisted numbers with reason and date added.
**FR-BLACK-004** — Users shall be able to remove a number from the blacklist.
**FR-BLACK-005** — The system shall provide a bulk import option for blacklists (CSV upload of numbers). *(Not yet built — required)*
**FR-BLACK-006** — When a called party requests opt-out during a call, the AI agent shall trigger automatic blacklisting of that number. *(Advanced — future)*

---

## 4.8 CRM — Contacts

**FR-CRM-CON-001** — A Lead can be converted into a Contact — creating a Contact record with business name, phone, address, email.
**FR-CRM-CON-002** — Contact phone numbers shall be unique per organization.
**FR-CRM-CON-003** — Contacts shall have a full activity timeline: calls, notes, emails, status changes in chronological order.
**FR-CRM-CON-004** — Users shall be able to manually create, edit, and delete contacts.
**FR-CRM-CON-005** — Contacts shall be searchable and filterable by name, phone, status.

---

## 4.9 CRM — Deal Pipeline

**FR-CRM-DEAL-001** — Users shall be able to create deals linked to a contact.
**FR-CRM-DEAL-002** — Deals shall have: title, value (currency amount), probability (0–100%), stage, close date, notes, assigned user.
**FR-CRM-DEAL-003** — Deal stages: PROSPECT → QUALIFIED → PROPOSAL → NEGOTIATION → WON / LOST.
**FR-CRM-DEAL-004** — The pipeline page shall display deals in a Kanban board view, grouped by stage.
**FR-CRM-DEAL-005** — Users shall be able to drag deals between stages on the Kanban board.
**FR-CRM-DEAL-006** — The pipeline shall show total deal value per stage.
**FR-CRM-DEAL-007** — Users shall be able to filter the pipeline by assigned user, close date range.
**FR-CRM-DEAL-008** — A deal detail page shall show full history, linked contact, tasks, and notes.

---

## 4.10 CRM — Tasks

**FR-CRM-TASK-001** — Users shall be able to create tasks linked to leads or contacts with: title, description, due date, assigned user.
**FR-CRM-TASK-002** — Users shall be able to mark tasks as complete.
**FR-CRM-TASK-003** — The dashboard shall show a widget of tasks due today and overdue.
**FR-CRM-TASK-004** — Tasks page shall list all org tasks, filterable by assignee, status (complete/incomplete), due date.
**FR-CRM-TASK-005** — Overdue tasks shall be visually highlighted in red.
**FR-CRM-TASK-006** — The system shall send a daily digest email of due tasks to each user. *(Not yet built — required)*

---

## 4.11 CRM — Notes

**FR-CRM-NOTE-001** — Users shall be able to add notes to leads and contacts.
**FR-CRM-NOTE-002** — Note types: NOTE (manual), CALL (auto-created from CallLog), EMAIL (manual), STATUS_CHANGE (auto-created).
**FR-CRM-NOTE-003** — Notes shall be displayed in an activity timeline in reverse chronological order.
**FR-CRM-NOTE-004** — Users shall be able to edit and delete their own notes.
**FR-CRM-NOTE-005** — Call notes (type: CALL) shall be auto-created from every call log, including AI summary and transcript.

---

## 4.12 Analytics & Reporting

**FR-ANAL-001** — The analytics page shall show: call volume over time (line chart), outcome distribution (donut chart), lead funnel (funnel chart), cost breakdown by campaign, cost trend over time, per-campaign stats table.
**FR-ANAL-002** — All analytics shall be filterable by: date range, campaign, lead status.
**FR-ANAL-003** — Lead funnel shall show conversion rates between stages: Discovered → AI Filtered → Called → Qualified.
**FR-ANAL-004** — Cost analytics shall show: total spend, cost per lead, cost per qualified lead, cost per call — per campaign and overall.
**FR-ANAL-005** — Users shall be able to export analytics data as CSV. *(Not yet built — required)*
**FR-ANAL-006** — Users shall be able to export call logs (with transcripts) as CSV or PDF. *(Not yet built — required)*
**FR-ANAL-007** — The dashboard shall show an activity feed of recent events: new leads, calls completed, deals updated, tasks due.

---

## 4.13 Team Management

**FR-TEAM-001** — ADMIN users shall be able to view all members of their organization with their role.
**FR-TEAM-002** — ADMIN users shall be able to invite new members via email. *(Not yet built — required)*
**FR-TEAM-003** — Invited users shall receive an email with a signup link that pre-joins them to the organization.
**FR-TEAM-004** — ADMIN users shall be able to change a member's role (ADMIN / MEMBER / VIEWER).
**FR-TEAM-005** — ADMIN users shall be able to remove a member from the organization.
**FR-TEAM-006** — Leads, tasks, and deals shall be assignable to specific team members.

---

## 4.14 Subscription & Billing (NEW — Required for SaaS)

> This entire module needs to be built. It is the revenue engine of the SaaS product.

**FR-BILL-001** — The platform shall offer subscription plans: Starter, Growth, Agency, Enterprise.
**FR-BILL-002** — Billing shall be managed via Stripe — subscriptions, invoices, payment methods.
**FR-BILL-003** — Each plan shall enforce limits: max campaigns, leads per month, calls per month, users.
**FR-BILL-004** — The system shall track usage (calls made, leads created) against plan limits in real time.
**FR-BILL-005** — When a plan limit is reached, the system shall block further calls and show an upgrade prompt.
**FR-BILL-006** — ADMIN users shall be able to view their current plan, usage, and billing history from the Settings page.
**FR-BILL-007** — ADMIN users shall be able to upgrade or downgrade their plan.
**FR-BILL-008** — The system shall send email notifications: payment successful, payment failed, approaching limit (80% used), limit reached.
**FR-BILL-009** — A 14-day free trial shall be offered to new organizations with Growth plan limits.
**FR-BILL-010** — On account deletion, all org data shall be scheduled for deletion after 30 days per GDPR.

---

## 4.15 Marketing Website (Public)

**FR-WEB-001** — A public marketing website shall exist at the product domain (e.g., callora.ai).
**FR-WEB-002** — The website shall include: Homepage, Features, Pricing, Use Cases, Blog, Login, Sign Up.
**FR-WEB-003** — The "Start Free Trial" CTA shall redirect to the app registration flow with trial flag set.
**FR-WEB-004** — The pricing page shall reflect actual subscription plans with feature comparison table.
**FR-WEB-005** — The website shall be fully responsive (mobile, tablet, desktop).
**FR-WEB-006** — The website shall be SEO-optimized: meta tags, structured data, sitemap, fast load times.
**FR-WEB-007** — The website shall include a live demo or product video on the homepage.
**FR-WEB-008** — A contact/sales form shall be available for Enterprise inquiries.

---

# SECTION 5 — NON-FUNCTIONAL REQUIREMENTS

## 5.1 Performance

**NFR-PERF-001** — Dashboard and analytics pages shall load within 2 seconds under normal load.
**NFR-PERF-002** — The system shall support concurrent campaign runs across at least 50 organizations simultaneously.
**NFR-PERF-003** — Campaign scraping shall complete within 30 seconds for up to 100 leads.
**NFR-PERF-004** — The API shall respond to all CRUD requests within 500ms at the 95th percentile.

## 5.2 Security

**NFR-SEC-001** — All API keys stored in the database shall be encrypted at rest using AES-256.
**NFR-SEC-002** — All data in transit shall use TLS 1.2+.
**NFR-SEC-003** — JWT tokens shall expire after 24 hours. Refresh tokens shall be implemented.
**NFR-SEC-004** — The platform shall implement rate limiting on all public endpoints (login, register).
**NFR-SEC-005** — All user inputs shall be validated and sanitized server-side to prevent SQL injection and XSS.
**NFR-SEC-006** — Passwords shall be hashed with bcrypt (minimum cost factor 12).
**NFR-SEC-007** — The platform shall pass OWASP Top 10 vulnerability assessment before launch.
**NFR-SEC-008** — All database queries shall be scoped to `organizationId` — tenant isolation enforced at the ORM level.

## 5.3 Reliability & Availability

**NFR-REL-001** — The platform shall target 99.9% uptime (excluding scheduled maintenance).
**NFR-REL-002** — The database shall be backed up daily with 30-day retention.
**NFR-REL-003** — Failed call attempts shall not crash the campaign — errors shall be logged and the campaign shall continue with remaining leads.
**NFR-REL-004** — The system shall implement retry logic for transient third-party API failures (Google Places, Gemini, Vapi).

## 5.4 Scalability

**NFR-SCALE-001** — The backend shall be stateless and horizontally scalable (container-based deployment).
**NFR-SCALE-002** — Campaign calling jobs shall be processed via a job queue (e.g., BullMQ) to prevent blocking the API server.
**NFR-SCALE-003** — The database shall be indexed for all common query patterns (organizationId, campaignId, status, createdAt).

## 5.5 Compliance

**NFR-COMP-001** — The platform shall display a TCPA compliance warning before any campaign calls are initiated in US regions.
**NFR-COMP-002** — The platform shall support GDPR right-to-erasure — organization data deletion on account closure.
**NFR-COMP-003** — Call transcripts shall be stored with a configurable retention period (default 90 days).
**NFR-COMP-004** — The platform shall log all admin actions (API key changes, user role changes, billing changes) in an audit log.

## 5.6 Usability

**NFR-USE-001** — A new user shall be able to create their first campaign and initiate a scrape within 10 minutes of registration.
**NFR-USE-002** — All destructive actions (delete campaign, remove member, blacklist number) shall require confirmation.
**NFR-USE-003** — The UI shall support dark and light themes.
**NFR-USE-004** — All error states shall display a human-readable message with a suggested action.
**NFR-USE-005** — The platform shall be accessible (WCAG 2.1 AA compliance).

---

# SECTION 6 — SYSTEM ARCHITECTURE (DESCRIBE IN SRS)

## 6.1 Diagram to Include
Draw and include the following in your SRS:

```
INTERNET
    │
    ▼
[Marketing Website]      [Web App - Next.js Frontend]
(Static / Next.js)              │
                                │ HTTPS
                                ▼
                        [API Gateway / Load Balancer]
                                │
                                ▼
                        [Express.js Backend]
                        ├── Auth middleware (JWT)
                        ├── Routes (campaigns, leads, analytics...)
                        └── Services
                            ├── Google Places API ──→ [Google Cloud]
                            ├── Gemini AI API    ──→ [Google Cloud]
                            └── Vapi.ai API      ──→ [Vapi Cloud]
                                │
                                ▼
                        [PostgreSQL Database]
                        (per-org data isolation)
                                │
                                ▼
                        [Job Queue - BullMQ/Redis]
                        (async campaign processing)
```

## 6.2 Component Responsibilities Table

| Component | Responsibility |
|-----------|---------------|
| Next.js Frontend | UI rendering, session management (NextAuth), server actions calling backend |
| Express Backend | Business logic, auth, all CRUD, third-party API orchestration |
| PostgreSQL | Persistent data storage, multi-tenant isolation |
| Google Places | Business discovery by keyword/location |
| Gemini AI | Lead qualification scoring + call summarization |
| Vapi.ai | AI voice agent — places outbound phone calls |
| Stripe | Subscription management, billing, invoicing |
| Job Queue (Redis/BullMQ) | Async campaign processing, follow-up scheduling |

---

# SECTION 7 — DATA REQUIREMENTS

## 7.1 Data Model Overview (include ER diagram in SRS)

**Core entities and relationships:**
```
Organization
  ├── has many → Users (roles: ADMIN, MEMBER, VIEWER)
  ├── has one  → ApiKey
  ├── has many → Campaigns
  │     └── has many → Leads
  │           └── has many → CallLogs
  ├── has many → Contacts
  │     ├── has many → Deals
  │     ├── has many → Tasks
  │     └── has many → Notes
  ├── has many → Tasks
  ├── has many → Notes
  └── has many → Blacklist entries
```

## 7.2 Data Retention Policy
- Call transcripts: 90 days default (configurable per org on higher plans)
- Leads and contacts: retained for duration of subscription + 30 days
- Billing history: 7 years (legal requirement)
- Audit logs: 1 year

---

# SECTION 8 — EXTERNAL INTERFACE REQUIREMENTS

## 8.1 User Interface
- Web application at `app.callora.ai`
- Marketing website at `callora.ai`
- Responsive: Desktop (1280px+), Tablet (768px+)
- Design system: Tailwind CSS, consistent component library

## 8.2 Third-Party API Interfaces

| API | Used For | Auth Method | Rate Limit Handling |
|-----|---------|-------------|-------------------|
| Google Places API | Lead discovery | API Key per org | Retry with backoff |
| Google Gemini API | AI qualification + summarization | API Key per org | Queue requests |
| Vapi.ai | Outbound calling | Private Key per org | Sequential per campaign |
| Stripe | Billing | Secret Key (platform-level) | Webhook events |

## 8.3 Notification Interfaces (Required — Not Yet Built)
- **Email:** Transactional emails via SendGrid or AWS SES
  - Welcome email on registration
  - Password reset link
  - Team invitation
  - Daily task digest
  - Call completion summary
  - Billing alerts (payment failed, plan limit)

---

# SECTION 9 — FEATURE PRIORITY MATRIX

Use this to decide what goes into V1.0 vs V1.1 vs V2.0:

## V1.0 — Launch (Must Have)
- [x] Authentication (register, login, logout)
- [x] Multi-tenant data isolation
- [x] API key management
- [x] AI campaign creation + lead scraping
- [x] CSV campaign + lead import
- [x] Outbound calling via Vapi
- [x] Follow-up automation
- [x] Blacklist management
- [x] Analytics (charts, funnel, cost)
- [x] CRM — contacts, deals pipeline, tasks, notes
- [x] Dark/light theme
- [ ] **Subscription & billing (Stripe)** — NOT BUILT — BLOCKER FOR LAUNCH
- [ ] **Password reset** — NOT BUILT — BLOCKER FOR LAUNCH
- [ ] **Team invitation by email** — NOT BUILT — REQUIRED
- [ ] **CRM backend routes wired up** — PARTIALLY BUILT — BLOCKER
- [ ] **Marketing website** — NOT BUILT — REQUIRED FOR LAUNCH

## V1.1 — Post-Launch (Should Have)
- [ ] Email notifications (task digest, call summary, billing alerts)
- [ ] CSV export of leads and analytics
- [ ] Bulk blacklist import
- [ ] Vapi webhook integration (automatic call result sync)
- [ ] Role-based access enforcement on all routes
- [ ] Audit log page
- [ ] Campaign pause/resume

## V2.0 — Growth Phase (Nice to Have)
- [ ] AI-generated call scripts per campaign ICP
- [ ] Predictive dialler (schedule calls at optimal times)
- [ ] HubSpot / Salesforce one-way export
- [ ] White-label for agencies (custom domain per client workspace)
- [ ] Mobile app (iOS/Android)
- [ ] Inbound call handling
- [ ] AI email follow-up (after call)
- [ ] A/B testing of call scripts

---

# SECTION 10 — APPENDICES

## Appendix A — Glossary
(Repeat Section 1.4 here in full)

## Appendix B — Wireframes
Include wireframes or screenshots for:
- Homepage (marketing website)
- Pricing page
- App dashboard
- Campaign creation flow (AI + CSV)
- Campaign detail with leads
- Deal pipeline (Kanban)
- Analytics page
- Follow-ups page
- Settings / billing page

## Appendix C — Competitive Landscape
Brief comparison to position Callora:

| Product | What They Do | Callora Advantage |
|---------|-------------|---------------------|
| Apollo.io | Email-first outbound, data enrichment | We do AI voice calls, not just email |
| Outreach.io | Sales engagement, email sequences | We automate the calling step before CRM entry |
| Close CRM | CRM + built-in calling | We add AI discovery + automated AI calls |
| Aircall | Human-operated call centre tool | We are fully automated, no human dialler needed |
| Convoso | Predictive dialler for call centres | We add AI qualification before dialling |

**Callora unique position:** The only platform that goes from *"I need leads"* to *"AI found them, AI filtered them, AI called them, and here are the interested ones"* — end-to-end, with a CRM to close them.

---

*SRS Guide Version 1.0 | Product Owner Perspective | Callora | 2026-04-11*
