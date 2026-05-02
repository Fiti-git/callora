// Server-side helper for talking to the platform API from inside the
// frontend's /admin route group. Uses an httpOnly cookie set by the
// /admin/login server action — completely separate from the tenant NextAuth
// session.

import { cookies } from "next/headers";
import { redirect } from "next/navigation";

export const PLATFORM_COOKIE = "callora_platform_token";

const BASE =
  process.env.PLATFORM_API_URL ||
  process.env.NEXT_PUBLIC_PLATFORM_API_URL ||
  process.env.API_URL ||
  "http://localhost:4000/api/platform";

function platformBase(): string {
  // Allow either /api/platform or just /api (we'll append /api/platform)
  if (BASE.endsWith("/api/platform")) return BASE;
  if (BASE.endsWith("/api")) return BASE + "/platform";
  return BASE.replace(/\/$/, "") + "/api/platform";
}

export async function getPlatformToken(): Promise<string | null> {
  const c = await cookies();
  return c.get(PLATFORM_COOKIE)?.value ?? null;
}

export async function requirePlatformToken(): Promise<string> {
  const t = await getPlatformToken();
  if (!t) redirect("/admin/login");
  return t;
}

export async function platformFetch<T = any>(
  path: string,
  init: RequestInit = {}
): Promise<T> {
  const token = await requirePlatformToken();
  const res = await fetch(`${platformBase()}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...(init.headers || {}),
    },
    cache: "no-store",
  });
  if (res.status === 401) redirect("/admin/login");
  if (!res.ok) {
    throw new Error(`platform api ${res.status}: ${await res.text()}`);
  }
  return res.json();
}
