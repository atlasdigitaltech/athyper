import type { Metadata } from "next";
import { ContentHeader } from "@athyper/platform-shell";
import { businessPartnerDefinition } from "@athyper/product-studio-business-partner";

export const metadata: Metadata = { title: "Business Partner Definition" };

export default function BusinessPartnerDefinitionPage() {
  return <section className="athyper-landing" aria-labelledby="page-title">
    <ContentHeader eyebrow="Master Data Governance" title="Business Partner" description="The governed module definition consumed by Neon stewardship and Mesh partner-network experiences."/>
    <div className="athyper-landing__status">
      <span aria-hidden="true"/>
      <div><strong>Governed definition</strong><p>{businessPartnerDefinition.publicationKey}</p></div>
    </div>
    <p><a className="athyper-landing__module-link" href="/mdg/business-partner/ai-experience">Configure Atlas widgets, search sources, prompts and agents</a></p>
    <div className="athyper-landing__grid"><article><a className="athyper-landing__module-link" href="/mdg/business-partner/model">Open data model</a><p>Structure</p><h2>Data Model</h2><p>Review the entities that compose a governed supplier, customer, or dual-role partner.</p><span className="athyper-landing__number" aria-hidden="true">01</span></article><article><a className="athyper-landing__module-link" href="/mdg/business-partner/validation">Open validation</a><p>Quality</p><h2>Validation &amp; Matching</h2><p>Inspect quality, duplicate, and identity-resolution responsibilities.</p><span className="athyper-landing__number" aria-hidden="true">02</span></article><article><a className="athyper-landing__module-link" href="/mdg/business-partner/workflows">Open workflows</a><p>Governance</p><h2>Workflow &amp; Publication</h2><p>Review approval stages and the definition published to consuming planes.</p><span className="athyper-landing__number" aria-hidden="true">03</span></article></div>
  </section>;
}
