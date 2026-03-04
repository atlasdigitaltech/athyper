import { StubPage } from "@/components/stubs/StubPage";

export default function WebhooksPage() {
    return <StubPage epic={6} title="Webhooks" description="Manage webhook configurations for this record." route="/app/:entity/:id/webhooks" />;
}
