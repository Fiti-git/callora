"use server";

import { fetchWithAuth } from "@/lib/api";

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
