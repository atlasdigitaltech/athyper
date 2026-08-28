import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { MeshEntityList } from "@athyper/product-mesh-list-view";

export const metadata: Metadata = { title: "Network records" };
export default async function MeshEntityListPage({ params }: { readonly params: Promise<{ readonly entityCode: string }> }) {
  const { entityCode } = await params;
  if (!/^[a-z][a-z0-9_.-]{0,126}$/.test(entityCode)) notFound();
  return <MeshEntityList entityCode={entityCode}/>;
}
