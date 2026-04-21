# Callora — Landing Page Plan
## Full Content Strategy + Claude Code Implementation Spec

> **For Claude Code:** Build the landing page section by section in order.
> All pages go inside `frontend/src/app/`. The root `page.tsx` must be replaced.
> Use Tailwind CSS only — no new UI libraries. Mobile-first, responsive throughout.
> Target markets: Canada and Singapore. Tone: Professional and trustworthy.

---

## Architecture Overview

### Files to Create / Modify

```
frontend/src/app/
├── page.tsx                          ← REPLACE (currently redirects to /login)
├── (marketing)/                      ← New route group (no layout inheritance from dashboard)
│   ├── layout.tsx                    ← Marketing layout (navbar + footer only)
│   ├── pricing/page.tsx              ← Standalone pricing page
│   └── demo/page.tsx                 ← Full-screen self-demo page

frontend/src/components/marketing/
├── Navbar.tsx
├── Hero.tsx
├── SocialProof.tsx
├── HowItWorks.tsx
├── Features.tsx
├── SelfDemo.tsx
├── Analytics.tsx
├── Compliance.tsx
├── Pricing.tsx
├── Testimonials.tsx
├── FAQ.tsx
└── Footer.tsx
```

### Routing Fix

Replace `frontend/src/app/page.tsx` entirely:
```typescript
// No longer a redirect — renders the landing page
import { LandingPage } from "@/components/marketing/LandingPage";
export default function Home() {
  return <LandingPage />;
}
```

Create `frontend/src/components/marketing/LandingPage.tsx` that assembles all sections in order.

---

## Colour & Design System

The landing page uses the existing Tailwind config. Define these conventions:

- **Primary colour:** `indigo-600` (buttons, highlights, accents)
- **Background:** `white` (light sections) alternating with `slate-50` (subtle contrast)
- **Dark sections:** `slate-900` (hero background, CTA section)
- **Text primary:** `slate-900`
- **Text secondary:** `slate-500`
- **Border:** `slate-200`
- **Success/trust accent:** `emerald-500` (checkmarks, compliance badges)
- **Typography:** Use `font-semibold` for all headings. Body text `text-base` or `text-lg`.
- **Max content width:** `max-w-6xl mx-auto px-6`
- **Section padding:** `py-20` for major sections, `py-12` for supporting sections

---

---

## Section 1 — Navigation Bar

**Component:** `frontend/src/components/marketing/Navbar.tsx`

### Layout
Sticky top navbar (`sticky top-0 z-50`). White background with a subtle bottom border (`border-b border-slate-200`). Slight backdrop blur (`backdrop-blur-sm bg-white/90`).

### Left side
Logo: "Callora" in `font-bold text-xl text-slate-900`. Add a small indigo dot or spark icon before the text.

### Centre links (desktop only, hidden on mobile)
- Features (smooth scroll to `#features`)
- How It Works (smooth scroll to `#how-it-works`)
- Pricing (smooth scroll to `#pricing`)
- Compliance (smooth scroll to `#compliance`)

### Right side
- "Sign in" — text link → `/login`
- "Start Free Trial" — indigo filled button → `/register`

### Mobile
Hamburger menu icon (≡). On click, show a full-width dropdown with all nav links stacked vertically plus both CTAs. Use `useState` for open/close toggle.

---

## Section 2 — Hero

**Component:** `frontend/src/components/marketing/Hero.tsx`

**Background:** Dark slate (`bg-slate-900`) with a very subtle radial gradient from indigo at top-center fading to slate. Add a faint grid pattern overlay using a CSS `background-image` SVG grid in slate-700 opacity 20%.

### Eyebrow text
Small uppercase badge above the headline:
```
AI-Powered Lead Generation  ·  Built for Canada & Singapore
```
Style: `text-indigo-400 text-sm font-semibold tracking-widest uppercase`

### Main headline
```
Qualified leads, delivered
to your pipeline — automatically.
```
Style: `text-5xl md:text-6xl font-bold text-white leading-tight`
The word "automatically" on its own line, in `text-indigo-400`.

### Subheadline
```
Callora finds your ideal business prospects, qualifies them
with AI, and calls them on your behalf. You only speak to leads
who are already interested.
```
Style: `text-lg text-slate-300 max-w-2xl mt-6`

### CTA buttons (side by side)
- Primary: "Start Your Free Trial" → `/register` — indigo filled, large, rounded-lg
- Secondary: "See How It Works" → smooth scroll to `#how-it-works` — white outlined, large, rounded-lg

### Trust line below CTAs
```
✓ 14-day free trial  ·  ✓ No credit card required  ·  ✓ Cancel anytime
```
Style: `text-slate-400 text-sm mt-4`

### Hero visual (right side on desktop, below on mobile)
A dark-themed dashboard mockup card showing:
- A campaign called "Toronto Accountants Q1" with status badge "Running"
- A live progress bar: "47 / 120 calls completed"
- Three lead cards below it, each with:
  - Business name
  - A green "Qualified" badge (interest score 78, 84, 91)
  - A phone icon

Build this as a pure Tailwind HTML component — no images, no screenshots. Use rounded cards, subtle shadows, and the same indigo/slate palette. This is more maintainable than a screenshot and always looks current.

---

## Section 3 — Social Proof Bar

**Component:** `frontend/src/components/marketing/SocialProof.tsx`

**Background:** `bg-white border-y border-slate-100`

### Layout
Centered row of 4 stat cards, each showing a number and label:

```
1,200+          48 hrs           3×              100%
Businesses      Average time     More pipeline    CASL & PDPA
reached weekly  to first lead    vs manual calls  compliant
```

Style: Number in `text-3xl font-bold text-indigo-600`. Label in `text-sm text-slate-500`. Divider lines between cards on desktop.

Below the stats, a single line:
```
Trusted by businesses in Canada and Singapore across finance, real estate,
professional services, and technology.
```
Style: `text-center text-slate-400 text-sm mt-6`

---

## Section 4 — Problem / Solution

**Component:** Inline in `LandingPage.tsx` (simple enough to not need its own file)

**Background:** `bg-slate-50`

### Headline
```
Sales prospecting is broken for most businesses.
```
`text-3xl font-bold text-slate-900 text-center`

### Subheadline
```
Hiring sales reps is expensive. Outsourcing is unreliable.
Manual cold calling doesn't scale. Callora changes that.
```
`text-slate-500 text-center max-w-2xl mx-auto mt-4`

### Two-column comparison (desktop) / stacked (mobile)

**Left column — "Before Callora"** (subtle red tint background):
```
✗  Spending hours finding prospect phone numbers
✗  Paying $4,000–$8,000/month for a sales rep
✗  No way to know if a lead is worth calling
✗  Calling lists manually, one by one
✗  Chasing follow-ups across spreadsheets
```

**Right column — "With Callora"** (subtle green tint background):
```
✓  AI discovers qualified prospects automatically
✓  Your AI caller works 24/7 for a fraction of the cost
✓  Every lead is scored before a call is made
✓  Campaigns run hands-free across hundreds of leads
✓  Follow-ups scheduled and executed automatically
```

---

## Section 5 — How It Works

**Component:** `frontend/src/components/marketing/HowItWorks.tsx`
**Anchor:** `id="how-it-works"`
**Background:** `bg-white`

### Section label
```
HOW IT WORKS
```
`text-indigo-600 text-sm font-semibold tracking-widest uppercase text-center`

### Headline
```
From prospect to qualified lead in three steps.
```
`text-4xl font-bold text-slate-900 text-center mt-2`

### Three steps (horizontal on desktop, vertical on mobile)

Each step has: a large number badge, an icon, a title, and a description. Connect steps with a dashed line on desktop.

**Step 1 — Discover**
Icon: magnifying glass
Title: "AI finds your prospects"
Description: "Tell Callora what kind of business you want to reach and where. It searches Google Places and returns a qualified list of real businesses with verified phone numbers — in minutes."

**Step 2 — Qualify**
Icon: brain / sparkle
Title: "Gemini AI screens every lead"
Description: "Before a single call is made, our AI reviews each prospect against your criteria and scores their likelihood to convert. Only leads that pass go to the next step."

**Step 3 — Call**
Icon: phone
Title: "Your AI caller reaches out"
Description: "Your branded AI caller introduces your business, gauges interest, and books follow-ups — all automatically. You receive an email the moment a qualified lead is ready for you."

Below the steps, a secondary note:
```
The entire pipeline runs unattended. You set it up once and check in on results.
```
`text-slate-400 text-sm text-center mt-8`

---

## Section 6 — Features

**Component:** `frontend/src/components/marketing/Features.tsx`
**Anchor:** `id="features"`
**Background:** `bg-slate-50`

### Section label + headline
```
FEATURES
Built for serious sales operations.
```

### Feature grid (3 columns desktop, 1 column mobile)

Each feature card: icon (indigo), bold title, 2-line description. Subtle white card with border and hover shadow.

**Row 1:**
1. **AI-Powered Discovery** — "Search millions of businesses by type, location, and industry. Callora returns verified phone numbers from Google Places, ready to dial."
2. **Pre-Call Qualification** — "Gemini AI scores every lead before your caller dials. No wasted calls. No time spent on unqualified prospects."
3. **Branded AI Caller** — "Configure your AI caller with your company name, script, and personality. It introduces itself as your team member — not a robot."

**Row 2:**
4. **Built-in Follow-Up Engine** — "No-answers and voicemails are automatically retried on your schedule. Interested prospects get a callback at the time they requested."
5. **Full CRM Pipeline** — "Every qualified lead flows into a deal pipeline. Track contacts, manage deals across stages, assign tasks, and log notes — all in one place."
6. **Real-Time Analytics** — "See call volume, qualification rates, cost per lead, and revenue pipeline projections. Know exactly what your investment is returning."

**Row 3:**
7. **CSV Import & Export** — "Already have a list? Upload a CSV and let Callora work through it. Export your qualified leads at any time."
8. **Team Collaboration** — "Invite your team with role-based access. Admins, members, and viewers each see what they need."
9. **Compliance Built-In** — "Canada's DNCL registry is scrubbed automatically before every campaign. Singapore PDPA data controls are included at every plan level."

---

## Section 7 — Self-Demo (The Wow Feature)

**Component:** `frontend/src/components/marketing/SelfDemo.tsx`
**Background:** `bg-indigo-600` (full-width indigo section — stands out from everything else)

### Headline (white text)
```
Hear it for yourself.
```
`text-4xl font-bold text-white text-center`

### Subheadline (indigo-100 text)
```
Enter your phone number and we'll call you right now — using the same AI
that powers every Callora campaign. No sign-up required.
```
`text-indigo-100 text-center max-w-xl mx-auto mt-4`

### Demo form
Centre-aligned. One phone input (with country code selector: 🇨🇦 +1 or 🇸🇬 +65), a large white "Call Me Now" button.

**States:**
- **Idle:** Input + button visible
- **Loading:** Button shows spinner + "Connecting..." text. Input disabled.
- **Success:** Replace form with: "📞 Your call is connecting now. Pick up in the next 30 seconds." in white text with a pulsing green dot.
- **Error:** Show error message in indigo-200 text below the button. Button re-enables.

**Implementation notes for Claude Code:**
- This calls a new server action `requestDemoCall(phone: string)` in `frontend/src/app/actions/demo.ts`
- The server action calls `POST /api/demo/call` on the backend (already exists)
- Add a daily cap check: a Redis counter `demo_calls_today` incremented on each call, max 50. If over limit, return `{ error: "Demo calls are temporarily paused. Sign up for a free trial instead." }`
- Add phone validation client-side: must be 10 digits (after stripping formatting) for CA, or 8 digits for SG
- Log the demo call requester's phone to a `DemoCalls` table or just to console for now — do not store without consent

### Below the form
```
This demo uses a sample script. Your actual AI caller uses your company name,
your script, and your contact details — configured in your account settings.
```
`text-indigo-200 text-xs text-center mt-6 max-w-md mx-auto`

---

## Section 8 — Analytics & Intelligence Preview

**Component:** `frontend/src/components/marketing/Analytics.tsx`
**Background:** `bg-white`

### Headline
```
Know exactly what your pipeline is worth.
```

### Subheadline
```
Callora doesn't just make calls — it builds intelligence. Every campaign
generates insights that make the next one more effective.
```

### Two-column layout (text left, visual right)

**Left:** Three feature points with indigo checkmarks:
1. **Live campaign progress** — "Watch calls happen in real time. Track outcomes as they come in, not hours later."
2. **Revenue forecasting** — "Enter your average deal size once. Callora shows you the projected pipeline value of every running campaign."
3. **Conversation insights** — "After enough calls, the platform surfaces patterns: which industries convert best, which objections come up most, which call times get the most answers."

**Right:** A mock analytics card built in Tailwind showing:
- A small bar chart (SVG, hardcoded — no chart library on the marketing page)
- Stats: "This month: 340 calls · 67 qualified · $41,200 projected pipeline"
- A small "Cost per qualified lead: $8.40" badge in emerald

---

## Section 9 — Compliance

**Component:** `frontend/src/components/marketing/Compliance.tsx`
**Anchor:** `id="compliance"`
**Background:** `bg-slate-900` (dark section for authority)

### Headline (white)
```
Compliance is built in — not bolted on.
```

### Subheadline (slate-300)
```
Outbound calling is regulated in both Canada and Singapore.
Callora handles the legal requirements automatically, so you can focus on selling.
```

### Two-column cards

**Canada card** (slate-800 background, left border in red/maple red):
```
🇨🇦  Canada
```
Title: "CASL & CRTC Compliant"
Points:
- "Canada's National Do Not Call List (DNCL) is automatically scrubbed before every campaign"
- "B2B exemptions are applied correctly — you only need consent for consumer numbers"
- "All calling activity is logged and auditable for CRTC compliance"
- "CASL-compliant data handling for all business contact information"

**Singapore card** (slate-800 background, left border in red/Singapore red):
```
🇸🇬  Singapore
```
Title: "PDPA Compliant"
Points:
- "B2B calling is exempt from Singapore's Do Not Call Registry — your campaigns run without restrictions"
- "All personal data is handled in accordance with the Personal Data Protection Act 2012"
- "Data deletion and right-to-erasure controls available at all plan levels"
- "Dedicated Data Protection Officer contact for enterprise accounts"

### Bottom note
```
We recommend consulting a legal advisor for your specific situation.
Callora provides compliance infrastructure — not legal advice.
```
`text-slate-500 text-xs text-center mt-10`

---

## Section 10 — Pricing

**Component:** `frontend/src/components/marketing/Pricing.tsx`
**Anchor:** `id="pricing"`
**Background:** `bg-slate-50`

### Headline
```
Straightforward pricing. No surprises.
```

### Currency toggle
A small toggle above the pricing cards: `CAD $` | `SGD $`
Use `useState` to switch between currencies. Default: detect from browser timezone (Canada → CAD, Singapore → SGD, everything else → CAD as default).

### Pricing cards (4 columns desktop, 1 column mobile)

All cards: white background, rounded-xl, border border-slate-200, shadow-sm. The "Pro" card gets a `ring-2 ring-indigo-600` highlight and a "Most Popular" badge.

**Starter**
- CAD $99 / SGD $109 per month
- Subtitle: "For solo operators and small teams"
- Features:
  - 200 AI calls / month
  - 500 leads scraped / month
  - 1 active campaign
  - 1 team seat
  - CSV import & export
  - Email support
- CTA: "Start Free Trial" → `/register`

**Pro** (highlighted)
- CAD $299 / SGD $329 per month
- Subtitle: "For growing sales operations"
- Features:
  - 1,000 AI calls / month
  - 3,000 leads scraped / month
  - 5 active campaigns
  - 5 team seats
  - Full CRM & pipeline
  - Analytics & forecasting
  - Follow-up automation
  - Priority email support
- CTA: "Start Free Trial" → `/register`

**Business**
- CAD $699 / SGD $769 per month
- Subtitle: "For agencies and high-volume teams"
- Features:
  - 3,000 AI calls / month
  - 10,000 leads scraped / month
  - Unlimited campaigns
  - 15 team seats
  - White-label client portal (coming soon)
  - Dedicated account manager
- CTA: "Start Free Trial" → `/register`

**Enterprise**
- "Custom pricing"
- Subtitle: "For large organisations"
- Features:
  - Unlimited calls & leads
  - Unlimited seats
  - Custom AI voice persona
  - SLA & uptime guarantee
  - PDPA/PIPEDA compliance audit
  - Onboarding & training
- CTA: "Contact Sales" → mailto or contact form

### Below cards
```
All plans include a 14-day free trial. No credit card required to start.
Prices shown exclude applicable taxes. Annual billing saves 2 months.
```
`text-slate-400 text-sm text-center mt-8`

---

## Section 11 — Testimonials

**Component:** `frontend/src/components/marketing/Testimonials.tsx`
**Background:** `bg-white`

### Headline
```
Trusted by businesses building their pipeline.
```

### Three testimonial cards

Use placeholder testimonials for now — mark them with a `// TODO: replace with real customer quotes` comment.

**Card 1:**
Quote: "We were spending 3 hours a day on cold calls with one of our junior staff. Callora replaced that entirely. We now get 15–20 qualified callbacks a week without any manual effort."
Name: "Director of Sales, Financial Services Firm"
Location: "Toronto, Ontario"

**Card 2:**
Quote: "The DNCL scrubbing was the feature that sold us. We'd had a compliance scare before and weren't going to touch outbound calling again without it. Callora made it safe to start again."
Name: "Managing Partner, Consulting Firm"
Location: "Vancouver, BC"

**Card 3:**
Quote: "Singapore's B2B calling market is active but competitive. Callora let us reach 400 prospects in our first week that would have taken a full-time SDR a month to work through."
Name: "Co-founder, SaaS Startup"
Location: "Singapore"

Style: Each card is a white rounded card with a left indigo border. Quote in slate-700 italic. Attribution in slate-500 small text.

---

## Section 12 — FAQ

**Component:** `frontend/src/components/marketing/FAQ.tsx`
**Background:** `bg-slate-50`

### Headline
```
Frequently asked questions.
```

Use an accordion component (click to expand). Build it with `useState` — no external library.

**Questions and answers:**

**Q: Do I need technical skills to use Callora?**
A: No. If you can fill in a form, you can run a campaign. The setup wizard walks you through connecting your API keys (we provide step-by-step instructions), and from there, every campaign starts with a plain-language description of who you want to reach.

**Q: Is cold calling legal in Canada and Singapore?**
A: Yes, with the right compliance in place. In Canada, B2B cold calling is permitted under CASL, provided you scrub your call list against the National Do Not Call List (DNCL). Callora does this automatically before every campaign. In Singapore, B2B calls are explicitly exempt from the Do Not Call Registry under the PDPA — outbound calling to businesses is unrestricted.

**Q: What happens when an AI call doesn't get an answer?**
A: Callora automatically schedules a retry based on your campaign settings — typically after 24 hours. You can configure the number of retry attempts and the delay between them. If a prospect asks to be called back at a specific time, that's also handled automatically.

**Q: Do I need my own API keys for Google, Gemini, and Vapi?**
A: Yes. Callora connects to your own API accounts for Google Maps, Google Gemini, and Vapi. This means your usage, your data, and your billing with those services stays in your control. We provide a setup guide to get all three keys in under 15 minutes.

**Q: Can I use my own call script?**
A: Yes. You can write a fully custom script for your AI caller or use the auto-generated default based on your company name and goals. You can also give your AI caller a name, a personality, and a direct contact number to share with interested prospects.

**Q: What does the 14-day free trial include?**
A: The free trial gives you full access to all Pro plan features for 14 days — no credit card required. You can run real campaigns, make real AI calls, and qualify real leads. At the end of the trial, choose a paid plan to continue or your account pauses (your data is preserved for 30 days).

**Q: Is my data secure?**
A: All data is encrypted in transit (TLS) and at rest. Call transcripts and lead data are stored in your isolated tenant environment — no data is shared between organisations. We comply with PIPEDA (Canada) and PDPA (Singapore) for all personal data handling.

---

## Section 13 — Final CTA

**Component:** Inline in `LandingPage.tsx`
**Background:** `bg-indigo-600`

### Headline (white)
```
Ready to build your pipeline on autopilot?
```

### Subheadline (indigo-100)
```
Start your 14-day free trial today. No credit card required.
Set up in under 15 minutes.
```

### Two CTAs
- Primary: "Start Free Trial" → `/register` — white filled button with indigo text
- Secondary: "Talk to Sales" → `mailto:hello@ezleads.ai` — white outlined button

---

## Section 14 — Footer

**Component:** `frontend/src/components/marketing/Footer.tsx`
**Background:** `bg-slate-900`

### Layout: 4-column grid (desktop), stacked (mobile)

**Column 1 — Brand:**
- Callora logo + name
- One-line description: "AI-powered outbound sales for businesses in Canada and Singapore."
- Social icons (LinkedIn, Twitter/X) — link to placeholders for now

**Column 2 — Product:**
- Features
- Pricing
- How It Works
- Compliance
- Sign In
- Start Free Trial

**Column 3 — Company:**
- About (placeholder `/about` — not built yet, just link)
- Contact (`mailto:hello@ezleads.ai`)
- Privacy Policy → `/privacy`
- Terms of Service → `/terms`

**Column 4 — Markets:**
- 🇨🇦 Canada — "CASL & DNCL compliant outbound calling"
- 🇸🇬 Singapore — "PDPA compliant, B2B DNC exempt"
- Brief note: "Serving businesses across North America and Southeast Asia."

### Bottom bar
```
© 2026 Callora. All rights reserved.  |  Privacy Policy  |  Terms of Service
```
`text-slate-500 text-sm border-t border-slate-800 mt-12 pt-6 text-center`

---

---

## Standalone Pricing Page

**File:** `frontend/src/app/(marketing)/pricing/page.tsx`

Reuse the `<Pricing />` component from the landing page. Wrap it with the marketing layout (Navbar + Footer). Add a page title and brief intro above the pricing cards:

```
Simple, transparent pricing.
Start free. Scale as you grow. Cancel anytime.
```

Add an annual/monthly billing toggle that applies a 17% discount to all annual prices (equivalent to 2 months free).

---

## Marketing Layout

**File:** `frontend/src/app/(marketing)/layout.tsx`

This layout wraps all marketing pages (landing, pricing, demo). It should render:
1. `<Navbar />` at the top
2. `{children}` in the middle (no padding — each section handles its own)
3. `<Footer />` at the bottom

No sidebar, no dashboard chrome. This is completely separate from `(dashboard)/layout.tsx`.

**Important:** The root `page.tsx` (`frontend/src/app/page.tsx`) sits outside the `(marketing)` group but should also use `<Navbar />` and `<Footer />` directly, since Next.js route groups don't automatically apply to the root route. Import and render them directly in `LandingPage.tsx`.

---

## Responsive Behaviour — Key Breakpoints

| Element | Mobile (< 768px) | Desktop (≥ 768px) |
|---|---|---|
| Navbar | Logo + hamburger only | Full links + CTAs |
| Hero | Stacked: text above, visual below | Side by side (text left, visual right) |
| Social proof stats | 2×2 grid | 4 in a row |
| Problem/solution | Stacked columns | Side by side |
| How It Works steps | Vertical with connecting line | Horizontal with dashed connector |
| Feature grid | Single column | 3-column grid |
| Pricing cards | Single column, scrollable | 4-column grid |
| Testimonials | Single column | 3-column grid |
| Footer | Stacked | 4-column grid |

---

## SEO & Meta Tags

Add to `frontend/src/app/(marketing)/layout.tsx` (or root `layout.tsx` with page-level overrides):

```typescript
export const metadata = {
  title: "Callora — AI-Powered Lead Generation for Canada & Singapore",
  description: "Callora finds your ideal business prospects, qualifies them with AI, and calls them on your behalf. CASL and PDPA compliant. Start your free 14-day trial.",
  keywords: "AI lead generation, outbound calling, sales automation, Canada, Singapore, CASL compliant, PDPA compliant",
  openGraph: {
    title: "Callora — Qualified leads, delivered automatically.",
    description: "AI-powered lead discovery, qualification, and outbound calling for businesses in Canada and Singapore.",
    url: "https://ezleads.ai",
    type: "website",
  },
};
```

---

## Performance Notes

- Do NOT import Recharts or any chart library on the landing page — build all charts as pure SVG or CSS
- All marketing components are Server Components by default (no `"use client"` unless using `useState`)
- The `SelfDemo` component needs `"use client"` for form state
- The `Navbar` needs `"use client"` for mobile menu toggle and scroll-based styling
- The `Pricing` component needs `"use client"` for currency toggle
- The `FAQ` component needs `"use client"` for accordion open/close
- All images are `next/image` with `priority` on hero images
- Lazy load everything below the fold

---

## Claude Code — Prompt to Use

Feed this to Claude Code:

```
Read docs/LANDING_PAGE_PLAN.md in full.

Then build the Callora landing page by completing these tasks in order:

1. Replace frontend/src/app/page.tsx with the LandingPage component
2. Create frontend/src/app/(marketing)/layout.tsx
3. Build all components in frontend/src/components/marketing/ — one at a time, in section order (Navbar → Hero → SocialProof → HowItWorks → Features → SelfDemo → Analytics → Compliance → Pricing → Testimonials → FAQ → Footer)
4. Create LandingPage.tsx that assembles all sections
5. Create frontend/src/app/(marketing)/pricing/page.tsx
6. Add the server action frontend/src/app/actions/demo.ts for the SelfDemo form
7. Add SEO metadata

Use Tailwind CSS only. No new npm packages. All components are mobile-responsive.
Mark each section complete before moving to the next.
```
