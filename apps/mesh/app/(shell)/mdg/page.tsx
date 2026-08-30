import type { Metadata } from "next";
import { NetworkIcon } from "@athyper/platform-icons";
import { PageFrame, PageHeader } from "@athyper/platform-shell";

export const metadata: Metadata = { title: "Master Data Governance" };

export default function MdgWorkspacePage() {
  return <PageFrame className="athyper-landing">
    <PageHeader level="workspace" context="MDG workspace" title="Master Data Governance" description="Maintain, publish, and reconcile trusted partner information across your business network." icon={<NetworkIcon/>} metadata={<><span>Ready</span><span>Acting-account aware</span></>}/>
    <div className="athyper-landing__grid">
      <article><a className="athyper-landing__module-link" href="/mdg/business-partner">Open Business Partner</a><p>Available module</p><h2>Business Partner</h2><p>Review your organization profile, relationships, governed changes, and shared publications.</p><span className="athyper-landing__icon" aria-hidden="true"><NetworkIcon size={28}/></span><div className="athyper-landing__links"><a href="/mdg/business-partner/profile">My organization</a><a href="/mdg/business-partner/relationships">Relationships</a></div></article>
    </div>
  </PageFrame>;
}
