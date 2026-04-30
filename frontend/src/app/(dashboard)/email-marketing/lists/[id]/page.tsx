import { notFound } from "next/navigation";
import { getList, listMembers } from "@/app/actions/email-marketing";
import { ListDetailClient } from "./client";

export const dynamic = "force-dynamic";

export default async function ListDetailPage({ params }: { params: { id: string } }) {
  let list: any = null;
  let members: any[] = [];
  try {
    list = await getList(params.id);
    const m = await listMembers(params.id, { limit: 100 });
    members = m.items ?? [];
  } catch (err) {
    console.error("List detail:", err);
  }
  if (!list) notFound();

  return <ListDetailClient list={list} initialMembers={members} />;
}
