"use client";

import { useParams } from "next/navigation";

import { ViewConfigurator } from "@/components/mesh/schemas/views/ViewConfigurator";

export default function ViewsPage() {
    const { entity } = useParams<{ entity: string }>();
    const entityName = decodeURIComponent(entity);

    return <ViewConfigurator entityName={entityName} />;
}
