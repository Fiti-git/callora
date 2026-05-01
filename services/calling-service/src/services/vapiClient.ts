/**
 * Thin wrapper around the Vapi REST API that:
 *  - lazily resolves the platform Vapi key via getServiceSecret
 *  - guards every call with a circuit breaker
 *  - exposes a small surface (purchaseNumber, releaseNumber, createCall, getCall)
 *
 * Keep this file boring on purpose — the actual Vapi REST shapes can be
 * confirmed/refined later without touching callers.
 */

import axios from "axios";
import { getServiceSecret } from "../config.js";
import { CircuitBreaker } from "../lib/circuitBreaker.js";
import { timeVendorCall, logger } from "@callora/shared";

const BASE_URL = "https://api.vapi.ai";

const breaker = new CircuitBreaker({
  name: "vapi",
  failureThreshold: 5,
  cooldownMs: 30_000,
});

let cachedKey: string | null = null;
async function getKey(): Promise<string> {
  if (cachedKey) return cachedKey;
  cachedKey = await getServiceSecret("VAPI_PRIVATE_KEY");
  return cachedKey;
}

/** For testing only. */
export function _resetVapiClientForTesting(): void {
  cachedKey = null;
}

function authHeaders(key: string): Record<string, string> {
  return {
    Authorization: `Bearer ${key}`,
    "Content-Type": "application/json",
  };
}

function redactErr(err: any): Record<string, unknown> {
  return {
    status: err?.response?.status,
    statusText: err?.response?.statusText,
    code: err?.code,
    message: err?.message,
  };
}

export interface PurchasedNumber {
  id: string;
  number: string; // E.164
}

export interface PurchaseOptions {
  orgName: string;
  areaCode?: string;
  provider?: "vapi" | "twilio";
}

/**
 * Buy a Vapi-managed phone number. Idempotency is the caller's
 * responsibility — this function always issues a purchase.
 */
export async function purchaseNumber(opts: PurchaseOptions): Promise<PurchasedNumber> {
  const key = await getKey();
  return breaker.exec(() => timeVendorCall("vapi", "purchaseNumber", async () => {
    try {
      const res = await axios.post(
        `${BASE_URL}/phone-number`,
        {
          provider: opts.provider ?? "vapi",
          numberDesiredAreaCode: opts.areaCode ?? "415",
          name: `Callora - ${opts.orgName.slice(0, 40)}`,
        },
        { headers: authHeaders(key), timeout: 30_000 }
      );
      const { id, number } = res.data as { id: string; number: string };
      if (!id || !number) {
        throw new Error(`vapi returned unexpected shape: ${JSON.stringify(res.data)}`);
      }
      return { id, number };
    } catch (err: any) {
      logger.error({ err: redactErr(err) }, "[vapi.purchaseNumber] failed");
      throw err;
    }
  }));
}

/**
 * Release a Vapi-managed phone number. Treats 404 as success (already gone).
 */
export async function releaseNumber(phoneNumberId: string): Promise<void> {
  const key = await getKey();
  return breaker.exec(() => timeVendorCall("vapi", "releaseNumber", async () => {
    try {
      await axios.delete(`${BASE_URL}/phone-number/${phoneNumberId}`, {
        headers: authHeaders(key),
        timeout: 30_000,
      });
    } catch (err: any) {
      if (err?.response?.status === 404) return;
      logger.error({ err: redactErr(err) }, "[vapi.releaseNumber] failed");
      throw err;
    }
  }));
}

export interface CreateCallInput {
  phoneNumberId: string;
  toNumber: string; // E.164
  customerName: string;
  firstMessage: string;
  systemPrompt: string;
}

export async function createCall(input: CreateCallInput): Promise<{ id: string }> {
  const key = await getKey();
  return breaker.exec(() => timeVendorCall("vapi", "createCall", async () => {
    try {
      const res = await axios.post(
        `${BASE_URL}/call`,
        {
          phoneNumberId: input.phoneNumberId,
          customer: { number: input.toNumber, name: input.customerName },
          assistant: {
            firstMessage: input.firstMessage,
            model: {
              provider: "openai",
              model: "gpt-4o-mini",
              messages: [{ role: "system", content: input.systemPrompt }],
            },
          },
        },
        { headers: authHeaders(key), timeout: 30_000 }
      );
      return { id: res.data.id };
    } catch (err: any) {
      logger.error({ err: redactErr(err) }, "[vapi.createCall] failed");
      throw err;
    }
  }));
}

export async function getCall(callId: string): Promise<any> {
  const key = await getKey();
  return breaker.exec(() => timeVendorCall("vapi", "getCall", async () => {
    try {
      const res = await axios.get(`${BASE_URL}/call/${callId}`, {
        headers: authHeaders(key),
        timeout: 15_000,
      });
      return res.data;
    } catch (err: any) {
      logger.error({ err: redactErr(err) }, "[vapi.getCall] failed");
      throw err;
    }
  }));
}
