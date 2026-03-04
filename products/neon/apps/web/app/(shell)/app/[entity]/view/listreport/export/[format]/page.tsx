import { StubPage } from "@/components/stubs/StubPage";

export default function ListReportExportPage() {
    return <StubPage epic={6} title="Export List Report" description="Export list report data in the specified format." route="/app/:entity/view/listreport/export/:format" />;
}
