import type { Metadata } from "next";
import { SettingsIcon } from "@athyper/platform-icons";
import { PageFrame, PageHeader } from "@athyper/platform-shell";

export const metadata: Metadata = { title: "Master Data Governance" };

export default function MdgWorkspacePage() {
  return <PageFrame className="athyper-landing">
    <PageHeader level="workspace" context="MDG workspace" title="Master Data Governance" description="Design and publish the models, policies, validation, and workflows used by Neon and Mesh." icon={<SettingsIcon/>} metadata={<><span>Ready</span><span>Published definitions authoritative</span></>}/>
    <div className="athyper-landing__grid">
      <article><a className="athyper-landing__module-link" href="/mdg/business-partner">Configure Business Partner</a><p>Published module</p><h2>Business Partner</h2><p>Inspect the governed data model, validation, matching, workflow, and publication contract.</p><span className="athyper-landing__icon" aria-hidden="true"><SettingsIcon size={28}/></span><div className="athyper-landing__links"><a href="/mdg/business-partner/model">Data model</a><a href="/mdg/business-partner/publication">Publication</a></div></article>
    </div>
  </PageFrame>;
}
