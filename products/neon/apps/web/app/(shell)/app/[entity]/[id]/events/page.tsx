import { ActivityTimeline } from "@/components/collab";

interface EventsPageProps {
    params: Promise<{ entity: string; id: string }>;
}

export default async function EventsPage({ params }: EventsPageProps) {
    const { entity, id } = await params;

    return (
        <div className="mx-auto max-w-3xl p-6">
            <h1 className="mb-6 text-2xl font-semibold tracking-tight">Activity Timeline</h1>
            <ActivityTimeline entityType={entity} entityId={id} />
        </div>
    );
}
