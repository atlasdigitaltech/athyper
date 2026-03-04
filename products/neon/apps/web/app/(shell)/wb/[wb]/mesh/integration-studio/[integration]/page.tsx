"use client";

import { useParams } from "next/navigation";

import { IntegrationDetailView } from "@/components/mesh/integrations/IntegrationDetailView";

export default function IntegrationDetailPage() {
    const { wb, integration } = useParams<{ wb: string; integration: string }>();
    const backHref = `/wb/${wb}/mesh/integration-studio`;

    return <IntegrationDetailView integrationId={integration} backHref={backHref} />;
}
