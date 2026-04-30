import { describe, it, expect } from "vitest";
import { runChecks, isStrong, passwordSchema } from "../lib/passwordPolicy.js";

describe("password policy", () => {
  it("each individual rule fails on its own", () => {
    expect(runChecks("Aa1!").minLength).toBe(false);
    expect(runChecks("aaaaaaaa1!").uppercase).toBe(false);
    expect(runChecks("AAAAAAAA1!").lowercase).toBe(false);
    expect(runChecks("Aaaaaaaa!").digit).toBe(false);
    expect(runChecks("Aaaaaaaa1").special).toBe(false);
  });

  it("isStrong is true only when all five rules pass", () => {
    expect(isStrong("Aaaaaaa1!")).toBe(true);
    expect(isStrong("weakpw")).toBe(false);
  });

  it("zod passwordSchema rejects weak passwords and accepts strong ones", () => {
    expect(passwordSchema.safeParse("weak").success).toBe(false);
    expect(passwordSchema.safeParse("Aaaaaaa1!").success).toBe(true);
  });

  it("returns full PasswordChecks shape so frontend can render per-rule UI", () => {
    const c = runChecks("Aaaaaaa1!");
    expect(Object.keys(c).sort()).toEqual(
      ["digit", "lowercase", "minLength", "special", "uppercase"]
    );
  });
});
