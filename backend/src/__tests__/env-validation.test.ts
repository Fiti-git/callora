import { describe, it, expect } from "vitest";
import { validateEnv } from "../lib/env.js";

describe("env validation", () => {
  it("throws when a required env var is missing", () => {
    expect(() =>
      validateEnv(["DEFINITELY_NOT_SET_VAR_XYZ_12345"])
    ).toThrow(/Missing required environment variables/);
  });

  it("does not throw when required vars are present", () => {
    process.env.__ENV_TEST_PRESENT = "1";
    expect(() => validateEnv(["__ENV_TEST_PRESENT"])).not.toThrow();
    delete process.env.__ENV_TEST_PRESENT;
  });

  it("treats empty string as missing", () => {
    process.env.__ENV_TEST_EMPTY = "";
    expect(() => validateEnv(["__ENV_TEST_EMPTY"])).toThrow(
      /Missing required environment variables/
    );
    delete process.env.__ENV_TEST_EMPTY;
  });

  // Each required boot var, missing in isolation, must trip the validator.
  // This guards against silently dropping a required var from the list.
  const REQUIRED = [
    "DATABASE_URL",
    "NEXTAUTH_SECRET",
    "PLATFORM_JWT_SECRET",
    "VAPI_WEBHOOK_SECRET",
    "TENANT_APP_ORIGIN",
    "TWOFA_ENCRYPTION_KEY",
  ];
  for (const key of REQUIRED) {
    it(`throws when ${key} alone is missing`, () => {
      const before = process.env[key];
      delete process.env[key];
      expect(() => validateEnv([key])).toThrow(
        new RegExp(`Missing required environment variables.*${key}`)
      );
      if (before !== undefined) process.env[key] = before;
    });
  }

  it("passes when all required vars are present", () => {
    for (const k of REQUIRED) process.env[k] = process.env[k] || "test-value";
    expect(() => validateEnv(REQUIRED)).not.toThrow();
  });
});
