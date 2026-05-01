/**
 * Email merge-tag renderer. Mirrored from backend/src/lib/mergeTags.ts.
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
    if (value === undefined && key.startsWith("contact.")) {
      value = lookupPath(ctx, key.slice("contact.".length));
    }
    if (value === undefined || value === null) return "";
    return htmlEscape(String(value));
  });
}

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
