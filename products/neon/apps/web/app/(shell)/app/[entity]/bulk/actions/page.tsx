import { StubPage } from "@/components/stubs/StubPage";

export default function BulkActionsPage() {
    return <StubPage epic={5} title="Bulk Actions" description="Execute bulk actions on selected entity records." route="/app/:entity/bulk/actions" />;
}
