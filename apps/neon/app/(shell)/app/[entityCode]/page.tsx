import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { NeonEntityList } from "@athyper/product-neon-list-view";

export const metadata: Metadata = { title: "Records" };

export default async function EntityListPage({ params }: { readonly params: Promise<{ readonly entityCode: string }> }) {
  const { entityCode } = await params;
  if (!/^[a-z][a-z0-9_.-]{0,126}$/.test(entityCode)) notFound();
  return <NeonEntityList entityCode={entityCode}/>;
}
