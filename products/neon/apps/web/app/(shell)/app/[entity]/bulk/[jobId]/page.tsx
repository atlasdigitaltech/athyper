import { StubPage } from "@/components/stubs/StubPage";

export default function BulkJobStatusPage() {
    return <StubPage epic={5} title="Bulk Job Status" description="Track the progress of a bulk operation job." route="/app/:entity/bulk/:jobId" />;
}
