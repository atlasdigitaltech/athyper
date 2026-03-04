import { StubPage } from "@/components/stubs/StubPage";

export default function VersionDetailPage() {
    return <StubPage epic={6} title="Version Detail" description="View a specific version of this record." route="/app/:entity/:id/versions/:versionId" />;
}
