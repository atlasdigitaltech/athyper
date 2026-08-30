import type { Metadata } from "next";
import { ClipboardCheckIcon, FileTextIcon, LayoutIcon, SettingsIcon } from "@athyper/platform-icons";
import { PageFrame, PageHeader } from "@athyper/platform-shell";
import { businessPartnerDefinition } from "@athyper/product-studio-business-partner";

export const metadata: Metadata = { title: "Business Partner Definition" };

export default function BusinessPartnerDefinitionPage() {
  return <PageFrame width="wide" className="athyper-landing">
    <PageHeader level="module" context="MDG · Module configuration" title="Business Partner" description="The governed module definition consumed by Neon stewardship and Mesh partner-network experiences." icon={<SettingsIcon/>} metadata={<><span>Governed definition</span><span>{businessPartnerDefinition.publicationKey}</span></>}/>
    <div className="athyper-landing__grid">
      <article><a className="athyper-landing__module-link" href="/mdg/business-partner/model">Open data model</a><p>Structure</p><h2>Data Model</h2><p>Review the entities that compose a governed supplier, customer, or dual-role partner.</p><span className="athyper-landing__icon" aria-hidden="true"><LayoutIcon size={28}/></span></article>
      <article><a className="athyper-landing__module-link" href="/mdg/business-partner/validation">Open validation</a><p>Quality</p><h2>Validation &amp; Matching</h2><p>Inspect quality, duplicate, and identity-resolution responsibilities.</p><span className="athyper-landing__icon" aria-hidden="true"><ClipboardCheckIcon size={28}/></span></article>
      <article><a className="athyper-landing__module-link" href="/mdg/business-partner/workflows">Open workflows</a><p>Governance</p><h2>Workflow &amp; Publication</h2><p>Review approval stages and the definition published to consuming planes.</p><span className="athyper-landing__icon" aria-hidden="true"><FileTextIcon size={28}/></span></article>
    </div>
  </PageFrame>;
}
