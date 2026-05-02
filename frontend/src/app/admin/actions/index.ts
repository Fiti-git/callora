"use server";

import { revalidatePath } from "next/cache";
import { platformFetch } from "@/lib/platformApi";

/* ------------------------------------------------------------------ */
/* Phone number pool                                                  */
/* ------------------------------------------------------------------ */

export async function addPoolNumberAction(formData: FormData) {
  const areaCode = String(formData.get("areaCode") || "").trim() || undefined;
  await platformFetch("/numbers/pool", {
    method: "POST",
    body: JSON.stringify({ areaCode }),
  });
  revalidatePath("/admin/numbers");
}

export async function rotatePoolNumberAction(formData: FormData) {
  const id = String(formData.get("id") || "");
  if (!id) return;
  await platformFetch(`/numbers/pool/${encodeURIComponent(id)}/rotate`, {
    method: "POST",
  });
  revalidatePath("/admin/numbers");
}

/* ------------------------------------------------------------------ */
/* Spend cap                                                          */
/* ------------------------------------------------------------------ */

export async function updateSpendCapAction(formData: FormData) {
  const orgId = String(formData.get("orgId") || "");
  if (!orgId) return;
  const dailyRaw = formData.get("dailyCapCents");
  const monthlyRaw = formData.get("monthlyCapCents");
  const body: Record<string, number> = {};
  if (dailyRaw !== null && dailyRaw !== "") body.dailyCapCents = Number(dailyRaw);
  if (monthlyRaw !== null && monthlyRaw !== "")
    body.monthlyCapCents = Number(monthlyRaw);
  await platformFetch(`/spend-cap/${encodeURIComponent(orgId)}`, {
    method: "PATCH",
    body: JSON.stringify(body),
  });
  revalidatePath(`/spend-caps`);
}

/* ------------------------------------------------------------------ */
/* Anomaly unsuspend                                                  */
/* ------------------------------------------------------------------ */

export async function unsuspendOrgAction(formData: FormData) {
  const orgId = String(formData.get("orgId") || "");
  if (!orgId) return;
  await platformFetch(`/risk/unsuspend/${encodeURIComponent(orgId)}`, {
    method: "POST",
    body: JSON.stringify({}),
  });
  revalidatePath("/admin/anomalies");
}

/* ------------------------------------------------------------------ */
/* DNC list                                                           */
/* ------------------------------------------------------------------ */

export async function addDncAction(formData: FormData) {
  const phoneE164 = String(formData.get("phoneE164") || "").trim();
  const source = String(formData.get("source") || "manual").trim();
  if (!phoneE164) return;
  await platformFetch("/dnc", {
    method: "POST",
    body: JSON.stringify({ phoneE164, source }),
  });
  revalidatePath("/admin/dnc");
}

export async function removeDncAction(formData: FormData) {
  const phone = String(formData.get("phone") || "");
  if (!phone) return;
  await platformFetch(`/dnc/${encodeURIComponent(phone)}`, {
    method: "DELETE",
  });
  revalidatePath("/admin/dnc");
}

/* ------------------------------------------------------------------ */
/* Platform secrets                                                   */
/* ------------------------------------------------------------------ */

export async function saveSecret(
  key: string,
  value: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    await platformFetch(`/secrets/${encodeURIComponent(key)}`, {
      method: "PUT",
      body: JSON.stringify({ value }),
    });
    revalidatePath("/admin/secrets");
    return { ok: true };
  } catch (err: any) {
    return { ok: false, error: err?.message ?? "Save failed" };
  }
}

export async function deleteSecret(
  key: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    await platformFetch(`/secrets/${encodeURIComponent(key)}`, {
      method: "DELETE",
    });
    revalidatePath("/admin/secrets");
    return { ok: true };
  } catch (err: any) {
    return { ok: false, error: err?.message ?? "Delete failed" };
  }
}
