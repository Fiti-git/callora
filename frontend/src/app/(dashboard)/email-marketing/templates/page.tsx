import { listTemplates } from "@/app/actions/email-marketing";
import { TemplatesClient } from "./client";

export const dynamic = "force-dynamic";

export default async function TemplatesPage() {
  let items: any[] = [];
  try {
    const res = await listTemplates();
    items = res.items ?? [];
  } catch (err) {
    console.error("Templates page:", err);
  }
  return <TemplatesClient initial={items} />;
}
