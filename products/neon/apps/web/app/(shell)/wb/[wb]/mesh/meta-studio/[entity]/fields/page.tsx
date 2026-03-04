"use client";

import { useParams } from "next/navigation";

import { FieldEditor } from "@/components/mesh/schemas/fields/FieldEditor";

export default function FieldsPage() {
    const { entity } = useParams<{ entity: string }>();
    const entityName = decodeURIComponent(entity);

    return <FieldEditor entityName={entityName} />;
}
