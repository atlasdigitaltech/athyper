import type { Metadata } from "next";
import { ContentHeader } from "@athyper/platform-shell";

export const metadata: Metadata = { title: "Master Data Governance" };

export default function MdgWorkspacePage() {
  return <section className="athyper-landing" aria-labelledby="page-title">
    <ContentHeader eyebrow="MDG workspace" title="Master Data Governance" description="Create, validate, approve, and maintain trusted master records." variant="hero"/>
    <div className="athyper-landing__status"><span aria-hidden="true"/><div><strong>Governance workspace ready</strong><p>Available modules reflect your current permissions and business context.</p></div></div>
    <div className="athyper-landing__grid">
      <article><a className="athyper-landing__module-link" href="/mdg/business-partner">Open Business Partner</a><p>Available module</p><h2>Business Partner</h2><p>Govern supplier, customer, and dual-role partner records through controlled workflows.</p><span className="athyper-landing__number" aria-hidden="true">01</span><div className="athyper-landing__links"><a href="/mdg/business-partner/partners">Partners</a><a href="/mdg/business-partner/requests">Review requests</a></div></article>
    </div>
  </section>;
}
