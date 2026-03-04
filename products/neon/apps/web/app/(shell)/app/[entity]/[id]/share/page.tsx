import { StubPage } from "@/components/stubs/StubPage";

export default function SharePage() {
    return <StubPage epic={6} title="Share" description="Share this record with other users." route="/app/:entity/:id/share" />;
}
