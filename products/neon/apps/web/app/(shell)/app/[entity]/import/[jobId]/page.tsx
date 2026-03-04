import { StubPage } from "@/components/stubs/StubPage";

export default function ImportJobStatusPage() {
    return <StubPage epic={5} title="Import Job Status" description="Track the progress of an import job." route="/app/:entity/import/:jobId" />;
}
