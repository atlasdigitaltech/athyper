import { StubPage } from "@/components/stubs/StubPage";

export default function ActionsPage() {
    return <StubPage epic={6} title="Actions" description="Available actions for this record." route="/app/:entity/:id/actions" />;
}
