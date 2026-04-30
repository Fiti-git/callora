import { listWebhooks } from "@/app/actions/webhooks";
import WebhooksClient from "./webhooks-client";

export const dynamic = "force-dynamic";

export default async function WebhooksPage() {
  let webhooks: Awaited<ReturnType<typeof listWebhooks>> = [];
  let error: string | null = null;
  try {
    webhooks = await listWebhooks();
  } catch (err: any) {
    error = err.message ?? "Failed to load webhooks";
  }
  return <WebhooksClient initial={webhooks} error={error} />;
}
