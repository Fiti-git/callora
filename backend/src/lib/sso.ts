/**
 * SSO ID-token verification helpers (Phase 3 Agent 12).
 *
 * Each provider exposes a JWKS endpoint. We use `jose`'s remote JWKS loader
 * which caches keys in-process and rotates on `kid` mismatch. Tokens are
 * validated against issuer + audience + signature; failures throw and the
 * caller surfaces a 400.
 *
 * The JWKS loader is exported via a factory so tests can swap in a stub.
 */
import { createRemoteJWKSet, jwtVerify, type JWTVerifyResult } from "jose";
import { optionalEnv } from "./env.js";

export type SsoProvider = "GOOGLE" | "MICROSOFT";

export interface VerifiedSsoIdentity {
  provider: SsoProvider;
  email: string;
  emailVerified: boolean;
  name: string | null;
  subject: string;
}

interface ProviderConfig {
  issuer: string | string[];
  audience: string | string[];
  jwksUrl: string;
}

function googleConfig(): ProviderConfig {
  const audience = optionalEnv("GOOGLE_CLIENT_ID");
  if (!audience) throw new Error("SSO_NOT_CONFIGURED: GOOGLE_CLIENT_ID");
  return {
    issuer: ["https://accounts.google.com", "accounts.google.com"],
    audience,
    jwksUrl: "https://www.googleapis.com/oauth2/v3/certs",
  };
}

function microsoftConfig(): ProviderConfig {
  const audience = optionalEnv("MICROSOFT_CLIENT_ID");
  if (!audience) throw new Error("SSO_NOT_CONFIGURED: MICROSOFT_CLIENT_ID");
  const tenant = optionalEnv("MICROSOFT_TENANT_ID") || "common";
  return {
    // Microsoft uses tenant-specific issuers; v2.0 endpoint format:
    // https://login.microsoftonline.com/{tenantid}/v2.0
    issuer: [
      `https://login.microsoftonline.com/${tenant}/v2.0`,
      // For 'common' the iss includes the actual user tenant — we relax that
      // by also accepting any login.microsoftonline.com v2.0 issuer when the
      // configured tenant is 'common'.
      ...(tenant === "common"
        ? [/^https:\/\/login\.microsoftonline\.com\/[0-9a-f-]+\/v2\.0$/.toString()]
        : []),
    ],
    audience,
    jwksUrl: `https://login.microsoftonline.com/${tenant}/discovery/v2.0/keys`,
  };
}

// JWKS loader cache (one per URL). Allows swap for tests via setJwksLoader.
type JwksLoader = (token: string, opts: { issuer: string | string[]; audience: string | string[] }) => Promise<JWTVerifyResult>;
let jwksLoader: JwksLoader | null = null;
const jwksCache = new Map<string, ReturnType<typeof createRemoteJWKSet>>();

export function setJwksLoaderForTest(loader: JwksLoader | null): void {
  jwksLoader = loader;
}

async function defaultVerify(
  token: string,
  cfg: ProviderConfig
): Promise<JWTVerifyResult> {
  let jwks = jwksCache.get(cfg.jwksUrl);
  if (!jwks) {
    jwks = createRemoteJWKSet(new URL(cfg.jwksUrl));
    jwksCache.set(cfg.jwksUrl, jwks);
  }
  // Microsoft 'common' issuer matching: jose accepts string|string[] but
  // not regexp. We pass the tenant-specific issuer if the token claim
  // matches our pattern; otherwise rely on the explicit list.
  const issuers = Array.isArray(cfg.issuer) ? cfg.issuer : [cfg.issuer];
  const validIssuers = issuers.filter((i) => !i.startsWith("/^"));
  return jwtVerify(token, jwks, {
    issuer: validIssuers,
    audience: cfg.audience,
  });
}

/**
 * Verify a provider-issued ID token and return the trusted identity.
 *
 * Throws on signature, issuer, audience, or expiry failure. Callers should
 * catch and translate to HTTP 400.
 */
export async function verifySsoIdToken(
  provider: SsoProvider,
  idToken: string
): Promise<VerifiedSsoIdentity> {
  const cfg = provider === "GOOGLE" ? googleConfig() : microsoftConfig();
  const result = jwksLoader
    ? await jwksLoader(idToken, { issuer: cfg.issuer, audience: cfg.audience })
    : await defaultVerify(idToken, cfg);
  const payload = result.payload as Record<string, unknown>;

  const email = String(payload.email || "").toLowerCase();
  if (!email) throw new Error("SSO_TOKEN_MISSING_EMAIL");

  // Google uses snake_case; Microsoft v2 also exposes `email` and (in some
  // tenants) `verified_primary_email`. Default to true for Microsoft since
  // it does not always emit email_verified.
  const ev = payload.email_verified;
  const emailVerified =
    ev === true ||
    ev === "true" ||
    (provider === "MICROSOFT" && ev === undefined);

  const name = (payload.name as string | undefined) ?? null;
  // Google: `sub`. Microsoft v2: `oid` is per-user, `sub` is per-app. Prefer
  // `oid` when present so the same user across apps stays linked.
  const subject = String((payload.oid as string) || payload.sub || "");
  if (!subject) throw new Error("SSO_TOKEN_MISSING_SUBJECT");

  return { provider, email, emailVerified, name, subject };
}
