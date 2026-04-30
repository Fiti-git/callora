/**
 * Email merge-tag renderer (Phase 3 Agent 10).
 *
 * Syntax: `{{firstName}}`, `{{lastName}}`, `{{company}}`, `{{email}}`, and
 * dotted paths like `{{contact.businessName}}`.
 *
 * Behaviour:
 *  - Unknown tags render as the empty string. Never crashes on missing fields.
 *  - All values are HTML-escaped before substitution so a malicious recipient
 *    name like `<script>alert(1)</script>` is rendered as harmless text.
 *  - Whitespace inside `{{ ... }}` is tolerated.
 *
 * NOTE: This helper is intentionally pure / synchronous. Both the email
 * campaign worker (per-recipient render) and automation worker call it.
 */

const TAG_RE = /\{\{\s*([a-zA-Z0-9_.]+)\s*\}\}/g;

const HTML_ESCAPE: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

function htmlEscape(s: string): string {
  return s.replace(/[&<>"']/g, (c) => HTML_ESCAPE[c]);
}

function lookupPath(ctx: any, path: string): unknown {
  if (!ctx || typeof ctx !== "object") return undefined;
  const parts = path.split(".");
  let cur: any = ctx;
  for (const p of parts) {
    if (cur == null || typeof cur !== "object") return undefined;
    cur = cur[p];
  }
  return cur;
}

export function renderMergeTags(
  template: string,
  ctx: Record<string, unknown> = {}
): string {
  if (!template) return "";
  return template.replace(TAG_RE, (_match, key: string) => {
    let value = lookupPath(ctx, key);
    // Top-level alias: {{contact.<x>}} should also work even if ctx is the
    // contact itself — try the trailing path on the root.
    if (value === undefined && key.startsWith("contact.")) {
      value = lookupPath(ctx, key.slice("contact.".length));
    }
    if (value === undefined || value === null) return "";
    return htmlEscape(String(value));
  });
}

/**
 * Build a merge-tag context from a Contact (or partial). Convenience helper
 * used by the worker; safe to call with an "email-only" recipient (no Contact
 * row).
 */
export function buildMergeContext(opts: {
  email: string;
  contact?: {
    businessName?: string | null;
    email?: string | null;
    phone?: string | null;
    address?: string | null;
  } | null;
  extra?: Record<string, unknown>;
}): Record<string, unknown> {
  const c = opts.contact ?? null;
  const businessName = c?.businessName ?? "";
  // Best-effort first/last from businessName — most B2B CRMs don't track
  // people, only companies. Frontend can layer richer name fields later.
  const [firstName, ...rest] = businessName.split(" ");
  const lastName = rest.join(" ");
  return {
    email: opts.email,
    firstName: firstName ?? "",
    lastName: lastName ?? "",
    company: businessName,
    contact: c ?? {},
    ...(opts.extra ?? {}),
  };
}
