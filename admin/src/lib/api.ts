import { getServerSession } from "next-auth";
import { authOptions } from "./auth";

const BASE = process.env.PLATFORM_API_URL || process.env.NEXT_PUBLIC_PLATFORM_API_URL || "http://localhost:4000/api/platform";

export async function platformFetch(path: string, init: RequestInit = {}) {
  const session = (await getServerSession(authOptions)) as any;
  const token = session?.accessToken;
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init.headers || {}),
    },
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(`platform api ${res.status}: ${await res.text()}`);
  }
  return res.json();
}
