import { describe, it, expect, beforeAll, afterAll } from "vitest";
import jwt from "jsonwebtoken";
import express from "express";
import http from "node:http";
import { PrismaClient } from "@prisma/client";

process.env.NEXTAUTH_SECRET ||= "test-nextauth-secret";
process.env.PLATFORM_JWT_SECRET ||= "test-platform-secret";
process.env.VAPI_WEBHOOK_SECRET ||= "test-vapi-webhook-secret";
process.env.TENANT_APP_ORIGIN ||= "http://localhost:3000";
process.env.TWOFA_ENCRYPTION_KEY ||= "0".repeat(64);
process.env.DNC_HASH_PEPPER ||= "test-pepper";
process.env.RESEND_WEBHOOK_SECRET ||= "test-resend-secret";
process.env.DATABASE_URL ||= "postgresql://localhost:5432/none";
process.env.NODE_ENV = "test";

const prisma = new PrismaClient();
let dbUp = false;
let schemaReady = false;
let orgId = "";

async function postRaw(app: express.Express, path: string, body: string = ""): Promise<{ status: number; body: any }> {
  return new Promise((resolve, reject) => {
    const server = app.listen(0, () => {
      const port = (server.address() as any).port;
      const req = http.request(
        {
          host: "127.0.0.1",
          port,
          method: "POST",
          path,
          headers: { "content-length": Buffer.byteLength(body), "content-type": "application/json" },
        },
        (resp) => {
          const chunks: Buffer[] = [];
          resp.on("data", (c) => chunks.push(c));
          resp.on("end", () => {
            const text = Buffer.concat(chunks).toString("utf8");
            let parsed: any = text;
            try { parsed = JSON.parse(text); } catch { /* ignore */ }
            server.close();
            resolve({ status: resp.statusCode || 0, body: parsed });
          });
        }
      );
      req.on("error", reject);
      req.write(body);
      req.end();
    });
  });
}

beforeAll(async () => {
  try {
    await prisma.$queryRawUnsafe("SELECT 1");
    dbUp = true;
    await prisma.$queryRawUnsafe('SELECT 1 FROM "EmailSuppression" LIMIT 1');
    schemaReady = true;
  } catch {
    dbUp = false;
  }
  if (!dbUp || !schemaReady) return;
  const tag = `unsub-${Date.now()}`;
  try {
    orgId = (await prisma.organization.create({ data: { name: `Org-${tag}` } })).id;
  } catch (err) {
    console.warn("[unsubscribe] org setup failed:", (err as any)?.message);
    schemaReady = false;
  }
});

afterAll(async () => {
  if (!dbUp || !schemaReady) {
    await prisma.$disconnect();
    return;
  }
  await prisma.emailSuppression.deleteMany({ where: { organizationId: orgId } });
  await prisma.organization.deleteMany({ where: { id: orgId } });
  await prisma.$disconnect();
});

describe("unsubscribe one-click", () => {
  it.skipIf(!dbUp || !schemaReady)("POST with valid token returns 204 + creates suppression", async () => {
    const emailRoutes = (await import("../routes/email.js")).default;
    const app = express();
    app.use(express.json());
    app.use("/api/email", emailRoutes);

    const token = jwt.sign({ orgId, recipient: "user@test.local" }, process.env.NEXTAUTH_SECRET!);
    const r = await postRaw(app, `/api/email/unsubscribe?t=${encodeURIComponent(token)}`, "");
    expect(r.status).toBe(204);

    const row = await prisma.emailSuppression.findFirst({
      where: { email: "user@test.local", organizationId: orgId },
    });
    expect(row).not.toBeNull();
    expect(row?.reason).toBe("UNSUBSCRIBED");
  });

  it.skipIf(!dbUp || !schemaReady)("POST with invalid token returns 400", async () => {
    const emailRoutes = (await import("../routes/email.js")).default;
    const app = express();
    app.use(express.json());
    app.use("/api/email", emailRoutes);

    const r = await postRaw(app, `/api/email/unsubscribe?t=garbage`, "");
    expect(r.status).toBe(400);
  });

  it.skipIf(!dbUp || !schemaReady)("POST is idempotent — clicking twice does not error", async () => {
    const emailRoutes = (await import("../routes/email.js")).default;
    const app = express();
    app.use(express.json());
    app.use("/api/email", emailRoutes);

    const token = jwt.sign({ orgId, recipient: "twice@test.local" }, process.env.NEXTAUTH_SECRET!);
    const a = await postRaw(app, `/api/email/unsubscribe?t=${encodeURIComponent(token)}`, "");
    const b = await postRaw(app, `/api/email/unsubscribe?t=${encodeURIComponent(token)}`, "");
    expect(a.status).toBe(204);
    expect(b.status).toBe(204);
  });
});
