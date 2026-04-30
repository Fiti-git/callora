import { notFound } from "next/navigation";
import {
  getCampaign,
  getCampaignAnalytics,
} from "@/app/actions/email-marketing";
import { CampaignDetailClient } from "./client";

export const dynamic = "force-dynamic";

export default async function CampaignDetailPage({
  params,
}: {
  params: { id: string };
}) {
  let campaign: any = null;
  let analytics: any = null;
  try {
    [campaign, analytics] = await Promise.all([
      getCampaign(params.id),
      getCampaignAnalytics(params.id),
    ]);
  } catch (err) {
    console.error("Campaign detail:", err);
  }
  if (!campaign) notFound();

  return <CampaignDetailClient campaign={campaign} analytics={analytics} />;
}
