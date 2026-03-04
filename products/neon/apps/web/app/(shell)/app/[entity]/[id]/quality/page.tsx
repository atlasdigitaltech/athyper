import { StubPage } from "@/components/stubs/StubPage";

export default function QualityPage() {
    return <StubPage epic={6} title="Quality" description="Data quality score and issues for this record." route="/app/:entity/:id/quality" />;
}
