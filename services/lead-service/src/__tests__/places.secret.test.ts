import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  getServiceSecret: vi.fn(),
  axiosPost: vi.fn(),
  meterAndCharge: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@callora/shared", () => ({
  meterAndCharge: mocks.meterAndCharge,
  prisma: {},
  timeVendorCall: async (...args: any[]) => {
    const fn = args[args.length - 1];
    return fn();
  },
  logger: {
    info: () => undefined,
    warn: () => undefined,
    error: () => undefined,
    debug: () => undefined,
  },
  setCircuitBreakerState: () => undefined,
}));

vi.mock("axios", () => ({
  default: { post: mocks.axiosPost },
}));

vi.mock("../config.js", () => ({
  getServiceSecret: mocks.getServiceSecret,
  SERVICE_NAME: "lead-service",
}));

import { PlacesService } from "../services/places.js";

describe("PlacesService secret loading", () => {
  beforeEach(() => {
    mocks.getServiceSecret.mockReset();
    mocks.axiosPost.mockReset();
    mocks.axiosPost.mockResolvedValue({ data: { places: [] } });
    delete process.env.GOOGLE_MAPS_API_KEY;
  });

  it("reads the API key only via getServiceSecret, never from process.env", async () => {
    mocks.getServiceSecret.mockResolvedValue("platform-key-via-secrets-mgr");
    // Bust the module-level cachedKey from any previous test.
    vi.resetModules();
    const { PlacesService: Fresh } = await import("../services/places.js");
    const svc = new Fresh();
    await svc.findLeads("coffee");

    expect(mocks.getServiceSecret).toHaveBeenCalledWith("GOOGLE_MAPS_API_KEY");
    const callArgs = mocks.axiosPost.mock.calls[0];
    expect(callArgs[2].headers["X-Goog-Api-Key"]).toBe(
      "platform-key-via-secrets-mgr"
    );
  });

  it("throws when the platform secret is missing", async () => {
    mocks.getServiceSecret.mockResolvedValue("");
    vi.resetModules();
    const { PlacesService: Fresh } = await import("../services/places.js");
    await expect(new Fresh().findLeads("coffee")).rejects.toThrow(
      /GOOGLE_MAPS_API_KEY/
    );
  });

  it("PlacesService class is constructible (sanity)", () => {
    expect(new PlacesService()).toBeInstanceOf(PlacesService);
  });
});
