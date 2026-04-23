# Callora — Client Onboarding Checklist

What to collect from Redot Global before provisioning a real client.

## 1. Domains & Hosting
- [ ] Tenant app domain (e.g. `app.callora.com`)
- [ ] Admin domain (e.g. `admin.callora.com`)
- [ ] Backend API domain (e.g. `api.callora.com`)
- [ ] SSL certificates (or auto-SSL via Cloudflare / host)
- [ ] Hosting account access (AWS / DO / Vercel / Railway / internal)
- [ ] DNS access

## 2. Third-Party API Keys (production)
- [ ] `GOOGLE_MAPS_API_KEY` — Places API enabled, billing attached
- [ ] `GEMINI_API_KEY` — production quota
- [ ] `VAPI_PRIVATE_KEY` + `VAPI_PHONE_NUMBER_ID` (purchased number in client's market)
- [ ] Stripe live mode: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`
- [ ] Stripe live price IDs: `STRIPE_PRICE_FREE/STARTER/PRO/ENTERPRISE`
- [ ] Stripe dashboard access

## 3. Email / SMTP
- [ ] SMTP credentials (SendGrid / Postmark / SES / Resend)
- [ ] Sending domain verified (SPF, DKIM, DMARC)
- [ ] "From" address (e.g. `no-reply@callora.com`)

## 4. Database & Storage
- [ ] Managed Postgres + `DATABASE_URL`
- [ ] Backup policy (daily snapshots, retention)
- [ ] S3 (or equivalent) bucket for CSVs / recordings, if used

## 5. Secrets to Generate
- [ ] `NEXTAUTH_SECRET`
- [ ] `PLATFORM_JWT_SECRET` (must differ from above)
- [ ] `PLATFORM_ADMIN_EMAIL` / `PLATFORM_ADMIN_PASSWORD`

## 6. Legal / Compliance
- [ ] Terms of Service URL
- [ ] Privacy Policy URL
- [ ] DPA template (if asked)
- [ ] Call-recording consent compliance (one-party vs two-party)
- [ ] TCPA / DNC responsibilities clarified with client
- [ ] Logo + brand assets

## 7. Client-Specific Info
- [ ] Business name (for `Organization`)
- [ ] First admin user: name + email
- [ ] Plan + pricing agreement + trial length
- [ ] Target industries / locations
- [ ] Vapi assistant script + voice
- [ ] Caller ID preference

## 8. Operations
- [ ] Error monitoring (Sentry)
- [ ] Uptime monitoring (Better Stack / UptimeRobot)
- [ ] Support channel (email / Slack Connect)
- [ ] On-call owner

## Priority Order
1. Domains + hosting + DB
2. Production API keys
3. SMTP with verified domain
4. Legal pages + compliance review
5. Monitoring + support process

## Provisioning Flow (once the above is ready)
1. Deploy backend, frontend, admin app to production domains
2. Run `npm run seed:admin` to create the super-admin
3. Log in to admin app → create the client's `Organization`
4. Create the client's first `User`; send them a password-reset link
5. Client logs in, invites their team, creates first campaign
