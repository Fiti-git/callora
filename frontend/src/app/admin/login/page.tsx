import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { PLATFORM_COOKIE } from "@/lib/platformApi";

const BASE =
  process.env.PLATFORM_API_URL ||
  process.env.API_URL ||
  "http://localhost:4000/api/platform";

function loginUrl(): string {
  if (BASE.endsWith("/api/platform")) return BASE + "/auth/login";
  if (BASE.endsWith("/api")) return BASE + "/platform/auth/login";
  return BASE.replace(/\/$/, "") + "/api/platform/auth/login";
}

async function loginAction(formData: FormData) {
  "use server";
  const email = String(formData.get("email") || "");
  const password = String(formData.get("password") || "");
  const res = await fetch(loginUrl(), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
    cache: "no-store",
  });
  if (!res.ok) {
    redirect("/admin/login?error=invalid");
  }
  const data = await res.json();
  const c = await cookies();
  c.set(PLATFORM_COOKIE, data.token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 12,
  });
  redirect("/admin");
}

export default async function AdminLoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const sp = await searchParams;
  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-950">
      <form
        action={loginAction}
        className="bg-slate-900 p-8 rounded-xl w-96 space-y-4 border border-slate-800"
      >
        <h1 className="text-2xl font-bold text-white">Platform Admin</h1>
        <input
          name="email"
          type="email"
          placeholder="Email"
          required
          className="w-full p-2 rounded bg-slate-800 text-white"
        />
        <input
          name="password"
          type="password"
          placeholder="Password"
          required
          className="w-full p-2 rounded bg-slate-800 text-white"
        />
        {sp.error && (
          <p className="text-red-400 text-sm">Invalid credentials</p>
        )}
        <button className="w-full bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-semibold p-2 rounded">
          Sign In
        </button>
      </form>
    </div>
  );
}
