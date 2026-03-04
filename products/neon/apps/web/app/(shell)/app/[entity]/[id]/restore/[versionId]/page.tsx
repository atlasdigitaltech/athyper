import { StubPage } from "@/components/stubs/StubPage";

export default function RestoreVersionPage() {
    return <StubPage epic={6} title="Restore Version" description="Restore this record to a previous version." route="/app/:entity/:id/restore/:versionId" />;
}
