import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { StudioCatalogList } from "@athyper/product-studio-list-view";

export const metadata: Metadata = { title: "Administrative catalogs" };
export default async function StudioCatalogPage({ params }: { readonly params: Promise<{ readonly catalogCode: string }> }) {
  const { catalogCode } = await params;
  if (!/^[a-z][a-z0-9_.-]{0,126}$/.test(catalogCode)) notFound();
  return <StudioCatalogList catalogCode={catalogCode}/>;
}
