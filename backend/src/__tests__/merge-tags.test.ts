import { describe, it, expect } from "vitest";
import { renderMergeTags, buildMergeContext } from "../lib/mergeTags.js";

describe("renderMergeTags", () => {
  it("substitutes known tags", () => {
    const out = renderMergeTags("Hi {{firstName}} at {{company}}", {
      firstName: "Ada",
      company: "Acme",
    });
    expect(out).toBe("Hi Ada at Acme");
  });

  it("renders unknown tags as empty string", () => {
    const out = renderMergeTags("X={{unknownTag}}Y", {});
    expect(out).toBe("X=Y");
  });

  it("HTML-escapes values to prevent XSS", () => {
    const out = renderMergeTags("Hello {{firstName}}", {
      firstName: "<script>alert(1)</script>",
    });
    expect(out).not.toContain("<script>");
    expect(out).toContain("&lt;script&gt;");
  });

  it("supports dotted contact paths", () => {
    const out = renderMergeTags("{{contact.businessName}}", {
      contact: { businessName: "Acme Corp" },
    });
    expect(out).toBe("Acme Corp");
  });

  it("never crashes on missing fields or null context", () => {
    expect(renderMergeTags("{{a.b.c}}", {})).toBe("");
    expect(renderMergeTags("{{contact.email}}", {})).toBe("");
    expect(renderMergeTags("plain text", {})).toBe("plain text");
  });

  it("tolerates whitespace inside braces", () => {
    expect(renderMergeTags("{{  firstName  }}", { firstName: "Ada" })).toBe("Ada");
  });

  it("buildMergeContext exposes firstName/company from contact", () => {
    const ctx = buildMergeContext({
      email: "x@y.com",
      contact: { businessName: "Ada Lovelace", email: "x@y.com", phone: null, address: null },
    });
    expect(ctx.email).toBe("x@y.com");
    expect(ctx.firstName).toBe("Ada");
    expect(ctx.lastName).toBe("Lovelace");
    expect(ctx.company).toBe("Ada Lovelace");
  });
});
