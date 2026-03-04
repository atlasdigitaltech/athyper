import { StubPage } from "@/components/stubs/StubPage";

export default function ReportsPage() {
    return <StubPage epic={6} title="Reports" description="View reports generated from this record." route="/app/:entity/:id/reports" />;
}
