"use client";

import { useParams } from "next/navigation";

import { FormDesigner } from "@/components/mesh/schemas/forms/FormDesigner";

export default function FormsPage() {
    const { entity } = useParams<{ entity: string }>();
    const entityName = decodeURIComponent(entity);

    return <FormDesigner entityName={entityName} />;
}
