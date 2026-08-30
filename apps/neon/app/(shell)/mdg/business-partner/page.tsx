import type { Metadata } from "next";
import { Building2Icon, ClipboardCheckIcon, PlusIcon } from "@athyper/platform-icons";
import { PageFrame, PageHeader } from "@athyper/platform-shell";

export const metadata: Metadata = { title: "Business Partner" };

export default function BusinessPartnerPage() {
  return <PageFrame width="wide" className="athyper-landing">
    <PageHeader level="module" context="MDG · Module" title="Business Partner" description="Govern suppliers, customers, and dual-role partners from request through approval and activation." icon={<Building2Icon/>} actions={<a className="a-button a-button--primary" href="/mdg/business-partner/new">Create Business Partner</a>}/>
    <div className="athyper-landing__grid">
      <article>
        <a className="athyper-landing__module-link" href="/mdg/business-partner/partners">Manage Business Partners</a>
        <p>Manage</p>
        <h2>Business Partners</h2>
        <p>Search and maintain approved supplier, customer, and dual-role partner records.</p>
        <span className="athyper-landing__icon" aria-hidden="true"><Building2Icon size={28}/></span>
      </article>
      <article>
        <a className="athyper-landing__module-link" href="/mdg/business-partner/requests">Review and approve Business Partner requests</a>
        <p>Review &amp; Approval</p>
        <h2>Business Partner</h2>
        <p>Validate onboarding and amendment requests before they update the canonical record.</p>
        <span className="athyper-landing__icon" aria-hidden="true"><ClipboardCheckIcon size={28}/></span>
      </article>
      <article>
        <a className="athyper-landing__module-link" href="/mdg/business-partner/new">Create a Business Partner request</a>
        <p>Create</p>
        <h2>Business Partner</h2>
        <p>Start a controlled supplier, customer, person, or role request.</p>
        <span className="athyper-landing__icon" aria-hidden="true"><PlusIcon size={28}/></span>
      </article>
    </div>
  </PageFrame>;
}
