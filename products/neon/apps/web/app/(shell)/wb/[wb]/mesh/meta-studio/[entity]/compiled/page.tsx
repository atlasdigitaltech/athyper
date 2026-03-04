"use client";

import { useParams } from "next/navigation";

import { CompilationDashboard } from "@/components/mesh/schemas/CompilationDashboard";

export default function CompiledPage() {
    const { entity } = useParams<{ entity: string }>();
    const entityName = decodeURIComponent(entity);

    return <CompilationDashboard entityName={entityName} />;
}
