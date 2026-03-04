import { StubPage } from "@/components/stubs/StubPage";

export default function ReportDetailPage() {
    return <StubPage epic={6} title="Report Detail" description="View a specific report." route="/app/:entity/:id/reports/:reportKey" />;
}
