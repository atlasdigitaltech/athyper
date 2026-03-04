import { StubPage } from "@/components/stubs/StubPage";

export default function ListExportPage() {
    return <StubPage epic={6} title="Export List" description="Export entity list data in the specified format." route="/app/:entity/view/list/export/:format" />;
}
