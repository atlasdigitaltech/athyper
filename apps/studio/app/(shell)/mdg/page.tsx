import type { Metadata } from "next";
import { ContentHeader } from "@athyper/platform-shell";

export const metadata: Metadata = { title: "Master Data Governance" };

export default function MdgWorkspacePage() {
  return <section className="athyper-landing" aria-labelledby="page-title">
    <ContentHeader eyebrow="MDG workspace" title="Master Data Governance" description="Design and publish the models, policies, validation, and workflows used by Neon and Mesh." variant="hero"/>
    <div className="athyper-landing__status"><span aria-hidden="true"/><div><strong>Governance configuration ready</strong><p>Published definitions remain the authority for operational and network experiences.</p></div></div>
    <div className="athyper-landing__grid">
      <article><a className="athyper-landing__module-link" href="/mdg/business-partner">Configure Business Partner</a><p>Published module</p><h2>Business Partner</h2><p>Inspect the governed data model, validation, matching, workflow, and publication contract.</p><span className="athyper-landing__number" aria-hidden="true">01</span><div className="athyper-landing__links"><a href="/mdg/business-partner/model">Data model</a><a href="/mdg/business-partner/publication">Publication</a></div></article>
    </div>
  </section>;
}
