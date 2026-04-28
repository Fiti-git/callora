# Callora Deployment Runbook

This is the operational runbook for the production Callora environment. It
covers deployment, incident response, backup/restore, and credential rotation.

---

## Topology

| Component | Where | Notes |
|---|---|---|
| EC2 host | `54.255.170.154` | `ubuntu` user, Docker + docker compose |
| Postgres | `db` container | volume `pgdata`, port `127.0.0.1:5432` |
| Redis | `redis` container | port `127.0.0.1:6379` |
| api-gateway | `api-gateway` container | port `4000` (public ingress) |
| Tenant frontend | `frontend` container | port `3000` |
| Admin frontend | `admin` container | port `3001` |
| Worker (BullMQ) | runs inside `backend` (legacy) / `campaign-service` | shares Redis |

---

## Deployment

CI/CD is Jenkins (`Jenkinsfile`). The pipeline:

1. Builds Docker images for `backend`, `frontend`, `admin`
2. Pushes them to Docker Hub (`fitisol/*:${BUILD_NUMBER}`, `:latest`)
3. SCPs `docker-compose.yml` to the host
4. SSHes in and runs `docker compose pull` + `prisma migrate deploy` + `docker compose up -d`
5. Polls `/health` for up to ~2 minutes

Trigger: push to the trunk branch (currently `Dev_Asfak`/`week1-critical-fixes`,
should consolidate to `main` post-launch).

Manual deploy (if Jenkins is unavailable):

```bash
ssh ubuntu@54.255.170.154
cd /opt/callora
docker login
docker compose pull
docker compose run --rm --no-deps backend npx prisma migrate deploy
docker compose up -d --remove-orphans
docker image prune -f
```

---

## Health & monitoring

```bash
curl -fsS http://54.255.170.154:4000/health | jq
```

Response shape (HTTP 200 = healthy, 503 = degraded):

```json
{
  "status": "ok",
  "checks": { "service": "ok", "database": "ok", "redis": "ok" },
  "timestamp": "2026-04-29T12:00:00.000Z"
}
```

Errors are reported to Sentry if `SENTRY_DSN` is set in the host's `.env`.

---

## Backups

A daily `pg_dump` runs at **02:00 UTC** via cron:

```cron
0 2 * * * /opt/callora/scripts/backup-postgres.sh >> /var/log/callora-backup.log 2>&1
```

- Local retention: 14 days under `/opt/callora/backups/`
- Remote retention (if `S3_BUCKET` is set): forever, in `s3://$S3_BUCKET/postgres/`
- Verify: `ls -lh /opt/callora/backups/ | tail`

### Restore

```bash
ssh ubuntu@54.255.170.154
cd /opt/callora
# 1. stop the app (db keeps running)
docker compose stop backend frontend admin api-gateway auth-service \
    campaign-service lead-service calling-service crm-service \
    billing-service platform-service notification-service analytics-service
# 2. restore (interactive — confirms with 'yes')
./scripts/restore-postgres.sh /opt/callora/backups/callora-callora-20260101T020000Z.sql.gz
# 3. bring everything back up
docker compose up -d
```

---

## Common incidents

### Backend `5xx` rate spikes
1. `docker compose logs --tail=200 -f backend api-gateway`
2. Check `/health` — DB or Redis down?
3. Check Sentry for stack traces
4. If DB is the bottleneck: `docker compose exec db psql -U $POSTGRES_USER -c "SELECT pid, query, state FROM pg_stat_activity WHERE state != 'idle';"`

### Worker job stuck
- All failed jobs land in the `campaign-calls-dlq` BullMQ queue.
- Inspect: `docker compose exec backend node -e "import('./dist/lib/queue.js').then(({deadLetterQueue})=>deadLetterQueue.getJobs(['failed','wait']).then(j=>console.log(JSON.stringify(j,null,2))))"`
- Replay a job by re-adding it to `callQueue` with the same data.

### Stripe webhook signature failure
- Check `STRIPE_WEBHOOK_SECRET` matches the dashboard endpoint.
- Verify the api-gateway is NOT parsing JSON for `/api/billing/webhook` — that
  proxy is registered before `express.json()` and must stay there.

### Stuck `RUNNING` campaign
- Likely cause: worker crashed mid-job. The DLQ-handler now auto-marks the
  campaign `FAILED` on retry exhaustion, but for legacy stuck rows:
  ```sql
  UPDATE "Campaign" SET status = 'FAILED' WHERE status = 'RUNNING' AND "updatedAt" < NOW() - INTERVAL '1 hour';
  ```

---

## Credential rotation

| Credential | Where | How to rotate |
|---|---|---|
| `NEXTAUTH_SECRET` | Host `.env` | Generate `openssl rand -base64 48`, update, `docker compose up -d`. **All tenant sessions invalidated.** |
| `PLATFORM_JWT_SECRET` | Host `.env` | Same as above. **All admin sessions invalidated.** |
| `STRIPE_WEBHOOK_SECRET` | Stripe dashboard → Webhooks → roll secret → update `.env` |
| `GEMINI_API_KEY` / `GOOGLE_MAPS_API_KEY` | Provider console → revoke, create new, update `.env` |
| `VAPI_PRIVATE_KEY` | Vapi dashboard → API keys → rotate, update `.env` |
| Postgres password | Update `POSTGRES_PASSWORD`, then run `ALTER USER` inside the db container, then `docker compose up -d` |

After any rotation: `curl http://54.255.170.154:4000/health` and tail logs for
auth errors.

---

## GDPR data requests

Both endpoints are tenant-scoped (require an admin JWT for the org):

```bash
# Article 15 — export
curl -H "Authorization: Bearer $TENANT_TOKEN" \
     http://callora.ai/api/privacy/export -o export.json

# Article 17 — delete
curl -X DELETE -H "Authorization: Bearer $TENANT_TOKEN" \
     -H "Content-Type: application/json" \
     -d '{"confirm":"DELETE-MY-DATA"}' \
     http://callora.ai/api/privacy/delete
```

The deletion is irreversible and runs in a single transaction.

---

## What is NOT yet automated

These remain manual for now (track in your project board):

- Test coverage beyond `tenant-isolation.test.ts`. Worker, billing, GDPR endpoints have no tests.
- Cloud secrets manager — currently `.env` on the EC2 host. Move to AWS Secrets Manager / Vault before scaling.
- Microservices migration — `backend/` monolith and `services/` both run. Pick one, retire the other.
- Database HA — single Postgres instance. Add a read replica or move to RDS Multi-AZ before > 100 paying tenants.
- Bounce handling for outbound email (Resend webhook).
