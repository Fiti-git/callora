import { describe, it, expect } from "vitest";
import { validateAutomationSequence } from "../routes/emailMarketing/automationSchema.js";

describe("validateAutomationSequence", () => {
  it("rejects empty sequence", () => {
    expect(validateAutomationSequence([])).toMatch(/non-empty/);
  });

  it("accepts a basic WAIT + SEND_EMAIL sequence", () => {
    const seq = [
      { kind: "WAIT", days: 1 },
      { kind: "SEND_EMAIL", templateId: "tmpl_123" },
    ];
    expect(validateAutomationSequence(seq)).toBeNull();
  });

  it("rejects unknown step kind", () => {
    expect(
      validateAutomationSequence([{ kind: "DESTROY", target: "all" } as any])
    ).toMatch(/unknown kind/);
  });

  it("rejects SEND_EMAIL without templateId", () => {
    expect(
      validateAutomationSequence([{ kind: "SEND_EMAIL" } as any])
    ).toMatch(/templateId/);
  });

  it("rejects WAIT.days out of range", () => {
    expect(
      validateAutomationSequence([{ kind: "WAIT", days: -1 }])
    ).toMatch(/0-365/);
    expect(
      validateAutomationSequence([{ kind: "WAIT", days: 999 }])
    ).toMatch(/0-365/);
  });

  it("rejects BRANCH with invalid step index", () => {
    const seq = [
      {
        kind: "BRANCH",
        condition: { field: "x", op: "=", value: "y" },
        ifTrue: 99,
        ifFalse: 1,
      },
      { kind: "SEND_EMAIL", templateId: "t" },
    ];
    expect(validateAutomationSequence(seq)).toMatch(/ifTrue/);
  });

  it("detects circular BRANCH loop", () => {
    // Two BRANCH steps that point at each other on the ifTrue path.
    const seq = [
      {
        kind: "BRANCH",
        condition: { field: "x", op: "=", value: "y" },
        ifTrue: 1,
        ifFalse: 1,
      },
      {
        kind: "BRANCH",
        condition: { field: "x", op: "=", value: "y" },
        ifTrue: 0,
        ifFalse: 0,
      },
    ];
    expect(validateAutomationSequence(seq)).toMatch(/circular/);
  });

  it("rejects BRANCH with unsupported op", () => {
    const seq = [
      {
        kind: "BRANCH",
        condition: { field: "x", op: "!=", value: "y" },
        ifTrue: 0,
        ifFalse: 0,
      },
    ];
    expect(validateAutomationSequence(seq)).toMatch(/op/);
  });
});
