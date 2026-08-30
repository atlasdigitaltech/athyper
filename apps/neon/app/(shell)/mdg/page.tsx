import type { Metadata } from "next";
import { Building2Icon } from "@athyper/platform-icons";
import { PageFrame, PageHeader } from "@athyper/platform-shell";

export const metadata: Metadata = { title: "Master Data Governance" };

export default function MdgWorkspacePage() {
  return <PageFrame className="athyper-landing">
    <PageHeader level="workspace" context="MDG workspace" title="Master Data Governance" description="Create, validate, approve, and maintain trusted master records." icon={<Building2Icon/>} metadata={<><span>Ready</span><span>Permission-aware modules</span></>}/>
    <div className="athyper-landing__grid">
      <article><a className="athyper-landing__module-link" href="/mdg/business-partner">Open Business Partner</a><p>Available module</p><h2>Business Partner</h2><p>Govern supplier, customer, and dual-role partner records through controlled workflows.</p><span className="athyper-landing__icon" aria-hidden="true"><Building2Icon size={28}/></span><div className="athyper-landing__links"><a href="/mdg/business-partner/partners">Manage</a><a href="/mdg/business-partner/requests">Review requests</a></div></article>
    </div>
  </PageFrame>;
}
