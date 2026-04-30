import { listTemplates } from "@/app/actions/email-marketing";
import { AutomationBuilder } from "./builder";

export const dynamic = "force-dynamic";

export default async function NewAutomationPage() {
  let templates: any[] = [];
  try {
    const res = await listTemplates();
    templates = res.items ?? [];
  } catch (err) {
    console.error(err);
  }

  return <AutomationBuilder templates={templates} />;
}
