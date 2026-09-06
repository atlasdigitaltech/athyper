import type { Metadata } from "next";
import { ClipboardCheckIcon } from "@athyper/platform-icons";
import { PageFrame, PageHeader } from "@athyper/platform-shell";
import { BusinessPartnerOperationsWorkspace } from "@athyper/product-studio-business-partner";
import qualification from "../../../../../../../governance/config/governance/business-partner-v1-qualification.v1.json";
import releaseQualification from "../../../../../../../governance/config/governance/business-partner-r8-qualification.v1.json";

export const metadata: Metadata = { title: "Business Partner Operations" };

export default function BusinessPartnerOperationsPage() {
  return (
    <PageFrame width="wide" className="athyper-landing">
      <PageHeader
        level="collection"
        context="Business Partner · Configuration"
        title="Operations & Proof"
        description="Dry-run immutable definition compatibility and inspect retained qualification coordinates without granting publication or recovery authority."
        icon={<ClipboardCheckIcon />}
      />
      <BusinessPartnerOperationsWorkspace
        qualification={qualification}
        releaseQualification={releaseQualification}
      />
    </PageFrame>
  );
}
