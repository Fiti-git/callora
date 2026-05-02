"use server";

import { platformFetch } from "@/lib/platformApi";

// Generic server action so client components can hit platform endpoints
// without ever seeing the platform JWT (it lives in an httpOnly cookie).
export async function platformPost(
  path: string,
  body?: any
): Promise<{ ok: true; data: any } | { ok: false; error: string }> {
  try {
    const data = await platformFetch(path, {
      method: "POST",
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    return { ok: true, data };
  } catch (err: any) {
    return { ok: false, error: err?.message ?? "Failed" };
  }
}

export async function platformPatch(
  path: string,
  body?: any
): Promise<{ ok: true; data: any } | { ok: false; error: string }> {
  try {
    const data = await platformFetch(path, {
      method: "PATCH",
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    return { ok: true, data };
  } catch (err: any) {
    return { ok: false, error: err?.message ?? "Failed" };
  }
}
