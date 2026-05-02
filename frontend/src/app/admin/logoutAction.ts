"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { PLATFORM_COOKIE } from "@/lib/platformApi";

export async function logoutAction() {
  const c = await cookies();
  c.delete(PLATFORM_COOKIE);
  redirect("/admin/login");
}
