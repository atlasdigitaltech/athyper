import type { Metadata } from "next";
import { ContentHeader } from "@athyper/platform-shell";
import { businessPartnerDefinition } from "@athyper/product-studio-business-partner";

export const metadata: Metadata = { title: "Business Partner Definition" };

export default function BusinessPartnerDefinitionPage() {
  return <section className="athyper-landing" aria-labelledby="page-title">
    <ContentHeader eyebrow="Master Data Governance" title="Business Partner" description="Author, validate, and publish the governed Business Partner definition consumed by Neon and Mesh."/>
    <div className="athyper-landing__status">
      <span aria-hidden="true"/>
      <div><strong>Governed definition</strong><p>{businessPartnerDefinition.publicationKey}</p></div>
    </div>
  </section>;
}
