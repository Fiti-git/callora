# Callora

Multi-tenant SaaS platform for AI-powered lead generation. The pipeline is:

1. **Google Places API** — discovers businesses by location/keyword
2. **Gemini AI** — qualifies leads and summarizes call outcomes
3. **Vapi.ai** — places outbound AI phone calls

Built-in CRM (contacts / deals / tasks / notes), Stripe billing, multi-tenant
quotas, super-admin platform layer.

For the architectural overview, conventions, and route map see
[CLAUDE.md](CLAUDE.md). For production deployment, see
[docs/deployment/RUNBOOK.md](docs/deployment/RUNBOOK.md).

---

## Local development

```bash
docker compose up
```

Brings up Postgres, Redis, all 9 services, the api-gateway (4000), the tenant
frontend (3000), and the admin app (3001). Initial seed:

```bash
# Migrations + seeds run via the campaign-service container, which bundles
# @callora/shared (the canonical schema lives at shared/src/prisma/schema.prisma).
docker compose exec campaign-service npx prisma migrate deploy --schema=node_modules/@callora/shared/src/prisma/schema.prisma
docker compose exec platform-service npm run seed:plans
docker compose exec platform-service npm run seed:admin   # super-admin user
```

Health check:

```bash
curl http://localhost:4000/health
```

---

## Project layout

| Path | What |
|---|---|
| `services/` | Microservices: api-gateway + 9 domain services (ports 4000–4009) |
| `bundles/` | Compact 3-bundle deploy (`edge`, `core`, `io`) for memory-tight prod |
| `shared/` | `@callora/shared` — canonical Prisma schema/client, types, JWT/quota helpers |
| `frontend/` | Tenant-facing Next.js app (port 3000) |
| `admin/` | Super-admin Next.js app (port 3001) |
| `docs/` | Setup guides + deployment runbook |
| `scripts/` | Operational scripts (Postgres backup/restore) |

---

## Environments

`.env.example` files exist at the repo root and per-service. Required at the
root for `docker compose`:

```env
POSTGRES_USER, POSTGRES_PASSWORD, POSTGRES_DB
NEXTAUTH_SECRET                      # tenant JWT secret
PLATFORM_JWT_SECRET                  # super-admin JWT secret (NEVER in tenant services)
TENANT_APP_ORIGIN, ADMIN_APP_ORIGIN

GOOGLE_MAPS_API_KEY, GEMINI_API_KEY  # platform-level fallbacks
VAPI_PRIVATE_KEY, VAPI_PHONE_NUMBER_ID, VAPI_WEBHOOK_SECRET
STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET
STRIPE_PRICE_FREE, STRIPE_PRICE_STARTER, STRIPE_PRICE_PRO, STRIPE_PRICE_ENTERPRISE
SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, EMAIL_FROM

# Optional
SENTRY_DSN                           # backend services error reporting
NEXT_PUBLIC_SENTRY_DSN               # frontend error reporting
NEXT_PUBLIC_SITE_URL                 # used in robots.txt + sitemap.xml
```

---

## Operational scripts

| Script | What |
|---|---|
| `scripts/backup-postgres.sh` | Daily pg_dump + gzip + S3 upload + retention |
| `scripts/restore-postgres.sh <file>` | Restore from a backup file |

Schedule the backup via cron on the Docker host:

```cron
0 2 * * * /opt/callora/scripts/backup-postgres.sh >> /var/log/callora-backup.log 2>&1
```

---

## Useful commands

```bash
# Shared schema / Prisma client (canonical schema lives here)
cd shared
npm run prisma:generate
npx prisma migrate dev --schema=src/prisma/schema.prisma --name <description>
npx prisma studio --schema=src/prisma/schema.prisma

# Run a single service in dev (hot reload)
cd services/campaign-service
npm run dev

# Frontend
cd frontend && npm run dev    # port 3000

# Admin
cd admin && npm run dev       # port 3001
```

---

## Help

- Issues: open a GitHub issue
- Architecture questions: see [CLAUDE.md](CLAUDE.md)
- Deployment / incidents: see [docs/deployment/RUNBOOK.md](docs/deployment/RUNBOOK.md)
