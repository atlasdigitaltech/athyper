import { StubPage } from "@/components/stubs/StubPage";

export default function CompareVersionsPage() {
    return <StubPage epic={6} title="Compare Versions" description="Compare two versions of this record side by side." route="/app/:entity/:id/compare" />;
}
