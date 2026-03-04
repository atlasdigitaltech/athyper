import { StubPage } from "@/components/stubs/StubPage";

export default function DataQualityPage() {
    return <StubPage epic={6} title="Data Quality" description="Entity-level data quality overview and issues." route="/app/:entity/quality" />;
}
