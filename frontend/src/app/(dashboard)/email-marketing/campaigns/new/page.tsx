import { listLists, listTemplates } from "@/app/actions/email-marketing";
import { CampaignWizard } from "./wizard";

export const dynamic = "force-dynamic";

export default async function NewCampaignPage() {
  const [listsRes, templatesRes] = await Promise.all([
    listLists({ limit: 200 }).catch(() => ({ items: [] })),
    listTemplates().catch(() => ({ items: [] })),
  ]);

  return (
    <CampaignWizard
      lists={listsRes.items ?? []}
      templates={templatesRes.items ?? []}
    />
  );
}
