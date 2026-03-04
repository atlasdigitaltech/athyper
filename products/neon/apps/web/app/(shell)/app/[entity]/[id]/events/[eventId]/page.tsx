import { StubPage } from "@/components/stubs/StubPage";

export default function EventDetailPage() {
    return <StubPage epic={6} title="Event Detail" description="View details of a specific event." route="/app/:entity/:id/events/:eventId" />;
}
