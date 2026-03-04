"use client";

import { useParams } from "next/navigation";

import { IntegrationExplorer } from "@/components/mesh/integrations/IntegrationExplorer";

export default function IntegrationStudioPage() {
    const { wb } = useParams<{ wb: string }>();
    const basePath = `/wb/${wb}/mesh/integration-studio`;

    return <IntegrationExplorer basePath={basePath} />;
}
