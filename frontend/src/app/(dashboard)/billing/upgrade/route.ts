import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

const API = process.env.API_URL || "http://localhost:4000/api";

export async function POST(req: Request) {
  const session: any = await getServerSession(authOptions);
  if (!session?.user?.accessToken) {
    return NextResponse.redirect(new URL("/login", req.url));
  }
  const form = await req.formData();
  const planTier = form.get("planTier");

  const res = await fetch(`${API}/billing/checkout`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${session.user.accessToken}`,
    },
    body: JSON.stringify({ planTier }),
  });
  const data = await res.json();
  if (!res.ok || !data.url) {
    return NextResponse.json(data, { status: res.status });
  }
  return NextResponse.redirect(data.url, 303);
}
