import { getServerSession } from "next-auth";
import { authOptions } from "./auth";

const API_URL = process.env.API_URL || "http://backend:4000/api";

export async function fetchWithAuth(path: string, options: RequestInit = {}) {
  const session = await getServerSession(authOptions);

  // If no session, backend will likely reject, or it's public usage which shouldn't use this util
  const token = session?.user?.accessToken;

  const headers: HeadersInit = {
    "Content-Type": "application/json",
    ...options.headers,
  };

  if (token) {
    (headers as any)["Authorization"] = `Bearer ${token}`;
  }

  const res = await fetch(`${API_URL}${path}`, {
    ...options,
    headers,
    cache: options.cache || "no-store", // Default to no-store for dynamic data
  });

  const text = await res.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    data = text;
  }

  if (!res.ok) {
    throw new Error(data.error || `API Error: ${res.status} ${res.statusText}`);
  }
  return data;
}
