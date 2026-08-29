import type { Metadata } from "next";
import { ContentHeader } from "@athyper/platform-shell";

export const metadata: Metadata = { title: "Master Data Governance" };

export default function MdgWorkspacePage() {
  return <section className="athyper-landing" aria-labelledby="page-title">
    <ContentHeader eyebrow="MDG workspace" title="Master Data Governance" description="Maintain, publish, and reconcile trusted partner information across your business network." variant="hero"/>
    <div className="athyper-landing__status"><span aria-hidden="true"/><div><strong>Partner workspace ready</strong><p>Your organization and available relationships are controlled by the acting-account context.</p></div></div>
    <div className="athyper-landing__grid">
      <article><a className="athyper-landing__module-link" href="/mdg/business-partner">Open Business Partner</a><p>Available module</p><h2>Business Partner</h2><p>Review your organization profile, relationships, governed changes, and shared publications.</p><span className="athyper-landing__number" aria-hidden="true">01</span><div className="athyper-landing__links"><a href="/mdg/business-partner/profile">My organization</a><a href="/mdg/business-partner/relationships">Relationships</a></div></article>
    </div>
  </section>;
}
