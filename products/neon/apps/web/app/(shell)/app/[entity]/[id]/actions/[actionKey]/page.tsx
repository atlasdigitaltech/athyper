import { StubPage } from "@/components/stubs/StubPage";

export default function ExecuteActionPage() {
    return <StubPage epic={6} title="Execute Action" description="Execute a specific action on this record." route="/app/:entity/:id/actions/:actionKey" />;
}
