import { EntityPageShell } from "@/components/entity-page/EntityPageShell";

interface RecordDetailPageProps {
    params: Promise<{ entity: string; id: string }>;
}

export default async function RecordDetailPage({ params }: RecordDetailPageProps) {
    const { entity, id } = await params;

    return <EntityPageShell entityName={entity} entityId={id} />;
}
