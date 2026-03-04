import { StubPage } from "@/components/stubs/StubPage";

export default function WatchersPage() {
    return <StubPage epic={6} title="Watchers" description="Manage who receives notifications for this record." route="/app/:entity/:id/watchers" />;
}
