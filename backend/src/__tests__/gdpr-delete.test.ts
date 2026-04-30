import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";
import express from "express";
import http from "node:http";
import jwt from "jsonwebtoken";

process.env.NEXTAUTH_SECRET ||= "test-nextauth-secret";
process.env.PLATFORM_JWT_SECRET ||= "test-platform-secret";
process.env.VAPI_WEBHOOK_SECRET ||= "test-vapi-webhook-secret";
process.env.TENANT_APP_ORIGIN ||= "http://localhost:3000";
process.env.DATABASE_URL ||= "postgresql://localhost:5432/none";
process.env.NODE_ENV = "test";

/**
 * GDPR delete route — mocked Prisma + Stripe so it runs without DB.
 *
 * Asserts the contractually important branches:
 *   - Wrong/missing confirmation → 400, no destructive call.
 *   - Stripe cancel fails → 502, no anonymisation runs.
 *   - Happy path → User PII anonymised, CallLog transcripts redacted,
 *     gdprDeletedAt set, tokenVersion bumped, AuditLog row created.
 */

const ORG_ID = "ckorgaaaaaaaaaaaaaaaaaaaaa";
const USER_ID = "ckuseraaaaaaaaaaaaaaaaaaaa";

let stripeShouldThrow = false;
let stripeCancelCalled = 0;

let txOps: { op: string; model?: string; args?: any }[] = [];
let auditCreated: any[] = [];

const txClient = {
  user: {
    findMany: async () => [{ id: USER_ID }],
    update: async (args: any) => {
      txOps.push({ op: "user.update", args });
      return { id: USER_ID };
    },
  },
  contact: {
    updateMany: async (args: any) => {
      txOps.push({ op: "contact.updateMany", args });
      return { count: 1 };
    },
  },
  lead: {
    updateMany: async (args: any) => {
      txOps.push({ op: "lead.updateMany", args });
      return { count: 1 };
    },
  },
  callLog: {
    updateMany: async (args: any) => {
      txOps.push({ op: "callLog.updateMany", args });
      return { count: 1 };
    },
  },
  campaign: {
    updateMany: async (args: any) => {
      txOps.push({ op: "campaign.updateMany", args });
      return { count: 1 };
    },
  },
  deal: {
    updateMany: async (args: any) => {
      txOps.push({ op: "deal.updateMany", args });
      return { count: 1 };
    },
  },
  task: {
    updateMany: async (args: any) => {
      txOps.push({ op: "task.updateMany", args });
      return { count: 1 };
    },
  },
  note: {
    updateMany: async (args: any) => {
      txOps.push({ op: "note.updateMany", args });
      return { count: 1 };
    },
  },
  blacklist: {
    updateMany: async (args: any) => {
      txOps.push({ op: "blacklist.updateMany", args });
      return { count: 1 };
    },
  },
  passwordResetToken: {
    deleteMany: async () => ({ count: 0 }),
  },
  apiKey: {
    deleteMany: async () => ({ count: 0 }),
  },
  organization: {
    update: async (args: any) => {
      txOps.push({ op: "organization.update", args });
      return { id: ORG_ID, ...args.data };
    },
  },
};

vi.mock("../lib/prisma.js", () => {
  const stub: any = {
    organization: {
      findUnique: async () => ({ id: ORG_ID, status: "ACTIVE" }),
    },
    user: {
      findUnique: async () => ({ id: USER_ID, tokenVersion: 0 }),
    },
    subscription: {
      findUnique: async () => ({ stripeSubscriptionId: "sub_123" }),
    },
    auditLog: {
      create: async (args: any) => {
        auditCreated.push(args.data);
        return { id: "a1" };
      },
    },
    $transaction: async (fn: any) => fn(txClient),
  };
  return { default: stub, rawPrisma: stub };
});

vi.mock("../services/stripe.js", () => ({
  ensureStripe: () => ({
    subscriptions: {
      cancel: async (id: string) => {
        stripeCancelCalled++;
        if (stripeShouldThrow) throw new Error("stripe boom");
        return { id, status: "canceled" };
      },
    },
    invoices: { list: async () => ({ data: [] }) },
  }),
}));

let port = 0;
let adminToken = "";

beforeAll(async () => {
  const mod = await import("../routes/privacy.js");
  const app = express();
  app.use(express.json());
  app.use("/api/gdpr", mod.default);
  const server = app.listen(0);
  port = (server.address() as any).port;
  adminToken = jwt.sign(
    {
      userId: USER_ID,
      organizationId: ORG_ID,
      email: "u@a.test",
      role: "ADMIN",
      tokenVersion: 0,
    },
    process.env.NEXTAUTH_SECRET!,
    { expiresIn: "5m" }
  );
});

beforeEach(() => {
  stripeShouldThrow = false;
  stripeCancelCalled = 0;
  txOps = [];
  auditCreated = [];
});

function deleteJson(path: string, body: any, headers: Record<string, string> = {}) {
  const payload = JSON.stringify(body);
  return new Promise<{ status: number; body: any }>((resolve, reject) => {
    const req = http.request(
      {
        host: "127.0.0.1",
        port,
        path,
        method: "DELETE",
        headers: {
          "content-type": "application/json",
          "content-length": Buffer.byteLength(payload).toString(),
          ...headers,
        },
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => {
          const text = Buffer.concat(chunks).toString("utf8");
          let parsed: any;
          try {
            parsed = JSON.parse(text);
          } catch {
            parsed = text;
          }
          resolve({ status: res.statusCode ?? 0, body: parsed });
        });
      }
    );
    req.on("error", reject);
    req.write(payload);
    req.end();
  });
}

describe("DELETE /api/gdpr/delete", () => {
  it("rejects without the confirmation token", async () => {
    const r = await deleteJson("/api/gdpr/delete", {}, {
      authorization: `Bearer ${adminToken}`,
    });
    expect(r.status).toBe(400);
    expect(stripeCancelCalled).toBe(0);
    expect(txOps).toHaveLength(0);
  });

  it("rejects an incorrect confirmation string", async () => {
    const r = await deleteJson(
      "/api/gdpr/delete",
      { confirmation: "kinda please" },
      { authorization: `Bearer ${adminToken}` }
    );
    expect(r.status).toBe(400);
    expect(txOps).toHaveLength(0);
  });

  it("aborts cleanly when Stripe cancel throws", async () => {
    stripeShouldThrow = true;
    const r = await deleteJson(
      "/api/gdpr/delete",
      { confirmation: "DELETE_MY_ORG" },
      { authorization: `Bearer ${adminToken}` }
    );
    expect(r.status).toBe(502);
    expect(stripeCancelCalled).toBe(1);
    // No anonymisation should have happened.
    expect(txOps).toHaveLength(0);
    expect(auditCreated).toHaveLength(0);
  });

  it("anonymises PII and writes the audit row on the happy path", async () => {
    const r = await deleteJson(
      "/api/gdpr/delete",
      { confirmation: "DELETE_MY_ORG", reason: "user requested closure" },
      { authorization: `Bearer ${adminToken}` }
    );
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ success: true });
    expect(stripeCancelCalled).toBe(1);

    // User update: PII cleared, tokenVersion incremented.
    const userUpdate = txOps.find((o) => o.op === "user.update");
    expect(userUpdate).toBeDefined();
    expect(userUpdate!.args.data.tokenVersion).toEqual({ increment: 1 });
    expect(userUpdate!.args.data.email).toMatch(/^deleted\+/);
    expect(userUpdate!.args.data.twoFASecret).toBeNull();
    expect(userUpdate!.args.data.twoFAEnabled).toBe(false);

    // CallLog transcripts redacted.
    const callLog = txOps.find((o) => o.op === "callLog.updateMany");
    expect(callLog!.args.data).toMatchObject({
      transcript: "[REDACTED]",
      summary: "[REDACTED]",
    });

    // Org marked.
    const orgUpdate = txOps.find((o) => o.op === "organization.update");
    expect(orgUpdate!.args.data.status).toBe("CANCELED");
    expect(orgUpdate!.args.data.gdprDeletedAt).toBeInstanceOf(Date);
    expect(orgUpdate!.args.data.name).toMatch(/^Deleted Organization /);

    // AuditLog write happened with canonical actorType.
    expect(auditCreated).toHaveLength(1);
    expect(auditCreated[0]).toMatchObject({
      actorType: "TENANT_USER",
      action: "GDPR_DELETE",
      entity: "Organization",
      entityId: ORG_ID,
    });
  });
});
