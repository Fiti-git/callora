# AboutSystem.md

## What is EzLeadsAI?

EzLeadsAI is a **B2B lead generation and outreach automation SaaS platform**. It is designed for sales teams or agencies that want to automatically discover potential business clients, qualify them using AI, and reach out via automated phone calls — all from a single dashboard.

---

## The Core Problem It Solves

Traditional lead generation is manual and slow: find businesses online, decide if they're worth calling, then actually call them. EzLeadsAI automates this entire pipeline end-to-end.

---

## How It Works (The Pipeline)

```
[User defines a campaign]
        ↓
[Google Places API] → Discovers real local businesses matching the user's criteria
        ↓
[Gemini AI (Google)] → Reads business info and scores each lead's interest/relevance
        ↓
[Vapi.ai] → Places automated AI-powered phone calls to qualified leads
        ↓
[Database] → Stores call transcripts, summaries, and interest scores for review
```

**Alternative input**: Users can skip the discovery step and upload their own leads via CSV.

---

## Who Uses It

- **Sales teams** wanting to automate cold outreach to local businesses
- **Agencies** running lead generation campaigns on behalf of clients
- Each account belongs to an **Organization** (multi-tenant) — multiple users can share one org's campaigns and leads

---

## Key Concepts

| Term | Meaning |
|------|---------|
| **Organization** | The top-level account/tenant. Owns all data. |
| **Campaign** | A configured lead generation run. Has a type (AI or CSV) and a status (DRAFT, RUNNING, COMPLETED). |
| **Lead** | A discovered or imported business. Has a phone number, address, interest score, and call status. |
| **CallLog** | The record of an AI phone call — includes transcript, AI-generated summary, and duration. |
| **Blacklist** | Phone numbers excluded from being called (opt-outs, do-not-call). |
| **ApiKey** | Per-organization encrypted storage of third-party API credentials (Google Maps, Gemini, Vapi). |

---

## Technical Character

- **Full-stack TypeScript** — backend (Express) and frontend (Next.js) are both TypeScript with ES modules
- **Multi-tenant by design** — every database query is scoped to an `organizationId`
- **Three external AI/data services** power the core workflow: Google Places, Google Gemini, Vapi.ai
- **Credentials are per-org** — each organization brings its own API keys, stored encrypted in the DB
- **Auth**: JWT issued by the backend, managed by NextAuth on the frontend; all backend routes require a valid Bearer token
- **Infrastructure**: PostgreSQL database, Docker Compose for local development

---

## What It Is NOT

- Not a CRM (no deal tracking, pipelines, or contact management beyond lead status)
- Not a marketing email tool (purely phone-call outreach)
- Not a real-time communication platform (calls are async, results are reviewed after the fact)
- The `legacy_cli/` folder is an archived older version — it is not part of the active product
