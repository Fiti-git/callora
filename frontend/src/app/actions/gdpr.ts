"use server";

import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

const API_URL = process.env.API_URL || "http://backend:4000/api";

/**
 * Server actions for the GDPR data page.
 *
 * Export: returns the raw JSON bundle; the client triggers a browser
 * download. We do NOT stream from the server action because Server
 * Actions can't stream binary cleanly today — for very large orgs the
 * backend itself handles the cap (100k/entity).
 *
 * Delete: posts the typed-confirmation body. The backend re-validates the
 * "DELETE_MY_ORG" string; the typed-org-name check below is purely a UX
 * guard so a slip of the keyboard can't trigger erasure.
 */

export async function exportMyData(): Promise<{
  success: boolean;
  bundle?: any;
  error?: string;
}> {
  const session = await getServerSession(authOptions);
  const token = session?.user?.accessToken;
  if (!token) return { success: false, error: "Not authenticated" };
  try {
    const res = await fetch(`${API_URL}/gdpr/export`, {
      method: "GET",
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    });
    const text = await res.text();
    if (!res.ok) {
      let msg = `Export failed: ${res.status}`;
      try {
        msg = JSON.parse(text).error ?? msg;
      } catch {
        /* keep default */
      }
      return { success: false, error: msg };
    }
    return { success: true, bundle: JSON.parse(text) };
  } catch (err: any) {
    return { success: false, error: err?.message ?? "Export failed" };
  }
}

export async function deleteMyOrganization(input: {
  typedOrgName: string;
  expectedOrgName: string;
  reason?: string;
}): Promise<{ success: boolean; error?: string }> {
  // UX guard: the typed name must match the org name exactly. Spaces are
  // significant — copy/paste-friendly but typo-resistant.
  if (input.typedOrgName !== input.expectedOrgName) {
    return { success: false, error: "Organization name does not match." };
  }
  const session = await getServerSession(authOptions);
  const token = session?.user?.accessToken;
  if (!token) return { success: false, error: "Not authenticated" };
  try {
    const res = await fetch(`${API_URL}/gdpr/delete`, {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        confirmation: "DELETE_MY_ORG",
        reason: input.reason ?? null,
      }),
      cache: "no-store",
    });
    const text = await res.text();
    if (!res.ok) {
      let msg = `Delete failed: ${res.status}`;
      try {
        msg = JSON.parse(text).error ?? msg;
      } catch {
        /* keep default */
      }
      return { success: false, error: msg };
    }
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err?.message ?? "Delete failed" };
  }
}
