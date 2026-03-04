import { EntityPageShell } from "@/components/entity-page/EntityPageShell";

interface EditRecordPageProps {
    params: Promise<{ entity: string; id: string }>;
}

export default async function EditRecordPage({ params }: EditRecordPageProps) {
    const { entity, id } = await params;

    return <EntityPageShell entityName={entity} entityId={id} initialViewMode="edit" />;
}
