import { StubPage } from "@/components/stubs/StubPage";

export default function BulkOperationsPage() {
    return <StubPage epic={5} title="Bulk Operations" description="Manage bulk operation jobs." route="/app/:entity/bulk" />;
}
