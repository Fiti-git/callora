"use server";

import { fetchWithAuth } from "@/lib/api";

const API_URL = process.env.API_URL || "http://backend:4000/api";

export async function register(data: FormData) {
  const email = data.get("email") as string;
  const password = data.get("password") as string;
  const name = data.get("name") as string;
  const orgName = data.get("orgName") as string;

  if (!email || !password || !name || !orgName) {
    throw new Error("Missing required fields");
  }

  await fetchWithAuth("/auth/register", {
    method: "POST",
    body: JSON.stringify({ email, password, name, orgName }),
  });

  return { success: true };
}

export async function forgotPassword(email: string) {
  const res = await fetch(`${API_URL}/auth/forgot-password`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email }),
    cache: "no-store",
  });
  // The backend always returns { success: true } even when the email is unknown,
  // so there is no error to surface to the user from a successful HTTP response.
  if (!res.ok) {
    throw new Error("Something went wrong. Please try again.");
  }
  return { success: true };
}

export async function resetPassword(token: string, newPassword: string) {
  const res = await fetch(`${API_URL}/auth/reset-password`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token, newPassword }),
    cache: "no-store",
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || "Failed to reset password");
  }
  return { success: true };
}
