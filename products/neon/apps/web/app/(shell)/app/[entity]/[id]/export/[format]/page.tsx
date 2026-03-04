import { StubPage } from "@/components/stubs/StubPage";

export default function ExportRecordPage() {
    return <StubPage epic={6} title="Export Record" description="Export this record in the specified format (PDF, XLSX, CSV, JSON)." route="/app/:entity/:id/export/:format" />;
}
