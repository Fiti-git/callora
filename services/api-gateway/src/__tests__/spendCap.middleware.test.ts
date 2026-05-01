import { describe, it, expect, vi, beforeEach } from "vitest";

const fetchMock = vi.fn();
(globalThis as any).fetch = fetchMock;

import { spendCap } from "../middleware/spendCap.js";

function makeReqRes(opts: { method?: string; orgId?: string } = {}) {
  const req: any = {
    method: opts.method ?? "POST",
    headers: opts.orgId ? { "x-organization-id": opts.orgId } : {},
  };
  const res: any = {
    statusCode: 200,
    headersSent: false,
    _body: undefined as any,
    _headers: {} as Record<string, string>,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(body: any) {
      this._body = body;
      return this;
    },
    setHeader(k: string, v: string) {
      this._headers[k] = v;
    },
  };
  const next = vi.fn();
  return { req, res, next };
}

beforeEach(() => {
  fetchMock.mockReset();
});

describe("spendCap middleware", () => {
  it("returns 402 when billing-service responds 402", async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 402,
      json: async () => ({ scope: "daily", capCents: 1000 }),
    });

    const mw = spendCap({ action: "call-trigger" });
    const { req, res, next } = makeReqRes({ orgId: "org_a" });
    await mw(req, res, next);

    expect(res.statusCode).toBe(402);
    expect(res._body).toMatchObject({
      error: "spend_cap_exceeded",
      scope: "daily",
      capCents: 1000,
      action: "call-trigger",
    });
    expect(next).not.toHaveBeenCalled();
  });

  it("soft-allows on network failure (next called, header set)", async () => {
    fetchMock.mockRejectedValue(new Error("ECONNREFUSED"));

    const mw = spendCap({ action: "campaign-run" });
    const { req, res, next } = makeReqRes({ orgId: "org_b" });
    await mw(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(res._headers["X-SpendCap-Soft-Allow"]).toBe("1");
  });

  it("soft-allows on non-OK non-402 response (e.g. 500)", async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 500, json: async () => ({}) });
    const mw = spendCap({ action: "lead-scrape" });
    const { req, res, next } = makeReqRes({ orgId: "org_c" });
    await mw(req, res, next);
    expect(next).toHaveBeenCalledTimes(1);
    expect(res._headers["X-SpendCap-Soft-Allow"]).toBe("1");
  });

  it("passes through without checking when no x-organization-id header", async () => {
    const mw = spendCap({ action: "call-trigger" });
    const { req, res, next } = makeReqRes({});
    await mw(req, res, next);
    expect(next).toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("skips on disallowed methods (GET)", async () => {
    const mw = spendCap({ action: "call-trigger" });
    const { req, res, next } = makeReqRes({ method: "GET", orgId: "org_x" });
    await mw(req, res, next);
    expect(next).toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
