import { listPublicApiKeys } from "@/app/actions/api-keys";
import ApiKeysClient from "./api-keys-client";

export const dynamic = "force-dynamic";

export default async function ApiKeysPage() {
  let keys: Awaited<ReturnType<typeof listPublicApiKeys>> = [];
  let error: string | null = null;
  try {
    keys = await listPublicApiKeys();
  } catch (err: any) {
    error = err.message ?? "Failed to load API keys";
  }
  return <ApiKeysClient initial={keys} error={error} />;
}
