"use client";

import { useParams } from "next/navigation";

import { VersionTimeline } from "@/components/mesh/schemas/VersionTimeline";

export default function VersionsPage() {
    const { entity } = useParams<{ entity: string }>();
    const entityName = decodeURIComponent(entity);

    return <VersionTimeline entityName={entityName} />;
}
