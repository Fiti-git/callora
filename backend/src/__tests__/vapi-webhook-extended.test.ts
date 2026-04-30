import { describe, it, expect, vi, afterEach } from "vitest";
import express from "express";
import request from "node:http";
import crypto from "crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Vapi webhook regressions:
 *  - Source-order check: raw body parser is mounted before any json parser
 *    for the /api/vapi path in src/index.ts.
 *  - On a valid completion, a `callCompleted` job is enqueued onto the
 *    `campaign-calls` BullMQ queue.
 */

const SECRET = `test-vapi-${Date.now()}`;
process.env.VAPI_WEBHOOK_SECRET = SECRET;
process.env.NEXTAUTH_SECRET ||= "test-nextauth-secret";
process.env.PLATFORM_JWT_SECRET ||= "test-platform-secret";
process.env.TENANT_APP_ORIGIN ||= "http://localhost:3000";
process.env.DATABASE_URL ||= "postgresql://localhost:5432/none";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function sign(body: string): string {
  return crypto.createHmac("sha256", SECRET).update(body).digest("hex");
}

async function postRaw(
  app: express.Express,
  pathStr: string,
  body: string,
  headers: Record<string, string>
): Promise<{ status: number; body: any }> {
  return await new Promise((resolve, reject) => {
    const server = app.listen(0, () => {
      const port = (server.address() as any).port;
      const req = request.request(
        {
          host: "127.0.0.1",
          port,
          method: "POST",
          path: pathStr,
          headers: {
            "content-type": "application/json",
            "content-length": Buffer.byteLength(body),
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
            server.close();
            resolve({ status: res.statusCode || 0, body: parsed });
          });
        }
      );
      req.on("error", (err) => {
        server.close();
        reject(err);
      });
      req.write(body);
      req.end();
    });
  });
}

describe("vapi webhook source-order guard", () => {
  it("the raw body parser is registered for /api/vapi BEFORE express.json()", () => {
    const indexPath = path.resolve(__dirname, "..", "index.ts");
    const src = fs.readFileSync(indexPath, "utf8");
    const vapiIdx = src.search(/app\.use\(\s*["'`]\/api\/vapi["'`][^,]*,\s*vapiWebhookRoutes/);
    const jsonIdx = src.search(/app\.use\(\s*express\.json\(/);
    expect(vapiIdx).toBeGreaterThanOrEqual(0);
    expect(jsonIdx).toBeGreaterThan(0);
    expect(vapiIdx).toBeLessThan(jsonIdx);
  });
});

describe("vapi webhook enqueue on completion", () => {
  afterEach(() => {
    vi.resetModules();
    vi.doUnmock("../lib/queue.js");
    vi.doUnmock("../lib/prisma.js");
  });

  it("enqueues a callCompleted job with deterministic jobId on valid end-of-call event", async () => {
    const enqueued: Array<{ name: string; payload: any; opts: any }> = [];

    vi.doMock("../lib/queue.js", () => ({
      callQueue: {
        add: async (name: string, payload: any, opts: any) => {
          enqueued.push({ name, payload, opts });
          return { id: opts?.jobId };
        },
      },
      deadLetterQueue: { add: async () => ({}) },
      redisConnection: { ping: async () => "PONG" },
    }));

    vi.doMock("../lib/prisma.js", () => ({
      default: {
        callLog: {
          findUnique: async () => ({
            id: "cl_1",
            leadId: "lead_1",
            duration: 0,
            transcript: null,
            summary: null,
            cost: null,
          }),
          upsert: async () => ({ id: "cl_1" }),
        },
      },
    }));

    const mod = await import("../routes/vapi-webhook.js");
    const app = express();
    app.use("/api/vapi", mod.default);

    const callId = "vapi-test-end-1";
    const body = JSON.stringify({
      type: "end-of-call-report",
      call: { id: callId, status: "ended", endedReason: "customer-ended-call", durationSeconds: 42 },
      analysis: { summary: "ok" },
    });
    const res = await postRaw(app, "/api/vapi/webhook", body, {
      "x-vapi-signature": sign(body),
    });
    expect(res.status).toBe(200);

    expect(enqueued.length).toBe(1);
    expect(enqueued[0].name).toBe("callCompleted");
    expect(enqueued[0].payload.vapiCallId).toBe(callId);
    expect(enqueued[0].opts.jobId).toBe(`callCompleted:${callId}`);
  });
});
