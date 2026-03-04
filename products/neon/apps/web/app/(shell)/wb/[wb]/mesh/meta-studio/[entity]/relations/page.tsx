"use client";

import { useParams } from "next/navigation";

import { RelationManager } from "@/components/mesh/schemas/relations/RelationManager";

export default function RelationsPage() {
    const { entity } = useParams<{ entity: string }>();
    const entityName = decodeURIComponent(entity);

    return <RelationManager entityName={entityName} />;
}
