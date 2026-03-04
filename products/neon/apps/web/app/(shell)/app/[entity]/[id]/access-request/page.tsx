import { StubPage } from "@/components/stubs/StubPage";

export default function AccessRequestPage() {
    return <StubPage epic={6} title="Access Request" description="Request access to this record." route="/app/:entity/:id/access-request" />;
}
