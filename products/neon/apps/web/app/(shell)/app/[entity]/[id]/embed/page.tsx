import { StubPage } from "@/components/stubs/StubPage";

export default function EmbedViewPage() {
    return <StubPage epic={6} title="Embed View" description="Embeddable view of this record." route="/app/:entity/:id/embed" />;
}
