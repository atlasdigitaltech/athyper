import { StubPage } from "@/components/stubs/StubPage";

export default function VersionHistoryPage() {
    return <StubPage epic={6} title="Version History" description="View version history for this record." route="/app/:entity/:id/versions" />;
}
