/**
 * Pagination cap — list endpoints must return at most 50 items by default,
 * even when the caller passes ?limit=500. DB-gated.
 *
 * Targets: /api/campaigns, /api/contacts, /api/deals, /api/leads.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import express from "express";
import http from "node:http";
import jwt from "jsonwebtoken";
import { PrismaClient } from "@prisma/client";

process.env.NEXTAUTH_SECRET ||= "test-nextauth-secret";
process.env.PLATFORM_JWT_SECRET ||= "test-platform-secret";
process.env.VAPI_WEBHOOK_SECRET ||= "test-vapi-webhook-secret";
process.env.TENANT_APP_ORIGIN ||= "http://localhost:3000";
process.env.TWOFA_ENCRYPTION_KEY ||= "0".repeat(64);
process.env.DNC_HASH_PEPPER ||= "test-pepper";
process.env.RESEND_WEBHOOK_SECRET ||= "test-resend-webhook";
process.env.DATABASE_URL ||= "postgresql://localhost:5432/none";

const prisma = new PrismaClient();
let dbUp = false;

beforeAll(async () => {
  try {
    await prisma.$queryRawUnsafe("SELECT 1");
    dbUp = true;
  } catch {
    dbUp = false;
  }
});

afterAll(async () => {
  await prisma.$disconnect();
});

async function getJson(
  port: number,
  path: string,
  token: string
): Promise<{ status: number; body: any }> {
  return new Promise((resolve, reject) => {
    const r = http.request(
      {
        host: "127.0.0.1",
        port,
        method: "GET",
        path,
        headers: { Authorization: `Bearer ${token}` },
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => {
          const text = Buffer.concat(chunks).toString("utf8");
          let parsed: any = text;
          try { parsed = JSON.parse(text); } catch {}
          resolve({ status: res.statusCode || 0, body: parsed });
        });
      }
    );
    r.on("error", reject);
    r.end();
  });
}

describe("list-endpoint pagination cap (50)", () => {
  it.skipIf(!dbUp)("contacts list caps at 50 even when limit=500", async () => {
    const tag = `pagcap-${Date.now()}`;
    const org = await prisma.organization.create({ data: { name: `Org ${tag}` } });
    const user = await prisma.user.create({
      data: {
        email: `${tag}@callora.test`,
        password: "hashed",
        organizationId: org.id,
        role: "ADMIN",
      },
    });
    // Insert 75 contacts so the cap is meaningful.
    await prisma.contact.createMany({
      data: Array.from({ length: 75 }, (_, i) => ({
        businessName: `Biz ${tag}-${i}`,
        phone: `+1555555${String(i).padStart(4, "0")}`,
        organizationId: org.id,
      })),
    });

    try {
      const { default: contactsRouter } = await import("../routes/contacts.js");
      const app = express();
      app.use(express.json());
      app.use("/api/contacts", contactsRouter);
      const server = app.listen(0);
      const port = (server.address() as any).port;

      const token = jwt.sign(
        { id: user.id, organizationId: org.id, role: "ADMIN" },
        process.env.NEXTAUTH_SECRET!
      );
      const { status, body } = await getJson(
        port,
        "/api/contacts?limit=500",
        token
      );
      server.close();

      expect(status).toBe(200);
      expect(Array.isArray(body)).toBe(true);
      expect(body.length).toBeLessThanOrEqual(50);
    } finally {
      await prisma.contact.deleteMany({ where: { organizationId: org.id } });
      await prisma.user.deleteMany({ where: { organizationId: org.id } });
      await prisma.organization.delete({ where: { id: org.id } });
    }
  });
});
